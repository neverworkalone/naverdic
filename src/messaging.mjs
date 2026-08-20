export const DEFAULT_MESSAGE_TIMEOUT_MS = 10000

export const MESSAGE_ACTIONS = Object.freeze({
  DICTIONARY: 'endic',
  TRANSLATION: 'translation'
})

export const MESSAGE_ERROR_CODES = Object.freeze({
  INVALID_REQUEST: 'INVALID_REQUEST',
  MISSING_PAYLOAD: 'MISSING_PAYLOAD',
  UNKNOWN_ACTION: 'UNKNOWN_ACTION',
  HTTP_ERROR: 'HTTP_ERROR',
  INVALID_RESPONSE: 'INVALID_RESPONSE',
  NETWORK_ERROR: 'NETWORK_ERROR',
  RUNTIME_ERROR: 'RUNTIME_ERROR',
  TIMEOUT: 'TIMEOUT',
  INTERNAL_ERROR: 'INTERNAL_ERROR'
})

/**
 * Existing actions only. Both actions use the same response envelope:
 * {ok: true, data: unknown} or
 * {ok: false, error: {code: string, message: string, ...details}}.
 *
 * endic request:       {action: 'endic', method: 'GET', url: string}
 * translation request: {action: 'translation', method: 'POST', url?: string,
 *                        key?: string, provider?: ProviderDefinition,
 *                        data: {text: string[], target_lang?: string,
 *                        targetLanguage?: string}}
 */
export const MESSAGE_CONTRACTS = Object.freeze({
  [MESSAGE_ACTIONS.DICTIONARY]: Object.freeze({
    request: "{ action: 'endic', method: 'GET', url: string }",
    response: 'MessageResponse<NaverDictionaryResponse>'
  }),
  [MESSAGE_ACTIONS.TRANSLATION]: Object.freeze({
    request: "{ action: 'translation', method: 'POST', url?: string, key?: string, provider?: ProviderDefinition, data: TranslationRequest }",
    response: 'MessageResponse<TranslationResponse>'
  })
})

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key)

function getErrorMessage(error, fallback) {
  if (typeof error === 'string' && error.trim()) {
    return error.trim()
  }

  if (error && typeof error.message === 'string' && error.message.trim()) {
    return error.message.trim()
  }

  return fallback
}

export function createDictionaryRequest({url, method = 'GET'} = {}) {
  return {
    action: MESSAGE_ACTIONS.DICTIONARY,
    method,
    url
  }
}

export function createTranslationRequest({url, method = 'POST', key, data, provider} = {}) {
  const request = {
    action: MESSAGE_ACTIONS.TRANSLATION,
    method,
    url,
    key,
    data
  }

  if (provider !== undefined) {
    request.provider = provider
  }

  return request
}

export function createSuccessResponse(data) {
  return {ok: true, data}
}

export function createErrorResponse(code, message, details = {}) {
  const error = {
    code: code || MESSAGE_ERROR_CODES.INTERNAL_ERROR,
    message: getErrorMessage(message, 'The message request failed.')
  }

  if (details && typeof details === 'object') {
    Object.entries(details).forEach(([key, value]) => {
      if (value !== undefined) {
        error[key] = value
      }
    })
  }

  return {ok: false, error}
}

export function isMessageResponse(response) {
  if (!response || typeof response !== 'object') {
    return false
  }

  if (response.ok === true) {
    return hasOwn(response, 'data')
  }

  return response.ok === false &&
    response.error &&
    typeof response.error === 'object' &&
    typeof response.error.code === 'string' &&
    typeof response.error.message === 'string'
}

function getRuntimeLastError(runtime) {
  try {
    const lastError = runtime?.lastError
    return lastError && typeof lastError.message === 'string'
      ? lastError
      : null
  } catch (_error) {
    return null
  }
}

/**
 * Send one runtime message and always resolve with the shared response shape.
 * The completion guard protects callers from callback/promise double delivery
 * and from a late callback after the timeout has already fired.
 */
export function sendRuntimeMessage(
  runtime,
  request,
  {timeoutMs = DEFAULT_MESSAGE_TIMEOUT_MS} = {}
) {
  return new Promise(resolve => {
    let settled = false
    let timeoutId = null

    const complete = response => {
      if (settled) {
        return
      }

      settled = true
      if (timeoutId !== null) {
        clearTimeout(timeoutId)
      }

      const lastError = getRuntimeLastError(runtime)
      if (lastError) {
        resolve(createErrorResponse(
          MESSAGE_ERROR_CODES.RUNTIME_ERROR,
          lastError.message
        ))
        return
      }

      resolve(isMessageResponse(response)
        ? response
        : createErrorResponse(
          MESSAGE_ERROR_CODES.INVALID_RESPONSE,
          'The message response did not match the expected contract.'
        ))
    }

    const normalizedTimeout = Number(timeoutMs)
    if (Number.isFinite(normalizedTimeout) && normalizedTimeout > 0) {
      timeoutId = setTimeout(() => {
        complete(createErrorResponse(
          MESSAGE_ERROR_CODES.TIMEOUT,
          'The message request timed out.'
        ))
      }, normalizedTimeout)
    }

    try {
      const returned = runtime?.sendMessage?.(request, complete)
      // Some MV3 runtimes expose a Promise as well as the callback API. Keep
      // this path guarded so either delivery mechanism can complete once.
      if (returned && typeof returned.then === 'function') {
        returned
          .then(complete)
          .catch(error => complete(createErrorResponse(
            MESSAGE_ERROR_CODES.RUNTIME_ERROR,
            getErrorMessage(error, 'The runtime message failed.')
          )))
      }
    } catch (error) {
      complete(createErrorResponse(
        MESSAGE_ERROR_CODES.RUNTIME_ERROR,
        getErrorMessage(error, 'The runtime message failed.')
      ))
    }
  })
}

/**
 * Report an already-normalized failure without adding a user-facing error UI.
 * Task5 callers use this for console diagnostics while preserving the current
 * no-result behaviour of the dictionary and translation popups.
 */
export function reportMessageFailure(scope, response, logger = globalThis.console) {
  if (isMessageResponse(response) && response.ok === false) {
    logger?.error?.(
      `[naverdic] ${scope} failed (${response.error.code}): ${response.error.message}`
    )
    return true
  }

  if (!isMessageResponse(response)) {
    logger?.error?.(`[naverdic] ${scope} failed: invalid message response`)
    return true
  }

  return false
}

/**
 * Protect the background listener from duplicate sendResponse calls.
 */
export function respondOnce(sendResponse) {
  let responded = false

  return response => {
    if (responded) {
      return false
    }

    responded = true
    try {
      sendResponse?.(response)
    } catch (_error) {
      // The channel can close before a late response is delivered. It must not
      // turn an already handled request into an uncaught service-worker error.
    }
    return true
  }
}
