import {
  DEFAULT_MESSAGE_TIMEOUT_MS,
  MESSAGE_ACTIONS,
  MESSAGE_ERROR_CODES,
  createErrorResponse,
  createSuccessResponse,
  respondOnce
} from './messaging.mjs'
import {
  executeProviderTranslation,
  PROVIDER_ERROR_CODES
} from './translation-engine.mjs'
import {getProviderPreset, normalizeProviderDefinition} from './translation-provider.mjs'
import {hasProviderOriginPermission} from './provider-permissions.mjs'

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isHttpUrl(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return false
  }

  try {
    const url = new URL(value)
    return (url.protocol === 'http:' || url.protocol === 'https:') &&
      !url.username && !url.password
  } catch (_error) {
    return false
  }
}

function hasMessageAction(action) {
  return Object.values(MESSAGE_ACTIONS).includes(action)
}

function expectedMethod(action) {
  return action === MESSAGE_ACTIONS.DICTIONARY ? 'GET' : 'POST'
}

function hasProvider(request) {
  return isRecord(request.provider)
}

/**
 * Validate the two existing message request shapes before touching fetch.
 * Returning a response instead of throwing makes malformed messages safe at
 * the service-worker boundary.
 */
export function validateMessageRequest(request) {
  if (!isRecord(request)) {
    return createErrorResponse(
      MESSAGE_ERROR_CODES.INVALID_REQUEST,
      'The message request must be an object.'
    )
  }

  if (typeof request.action !== 'string' || !request.action.trim()) {
    return createErrorResponse(
      MESSAGE_ERROR_CODES.INVALID_REQUEST,
      'The message action is required.'
    )
  }

  if (!hasMessageAction(request.action)) {
    return createErrorResponse(
      MESSAGE_ERROR_CODES.UNKNOWN_ACTION,
      `Unsupported message action: ${request.action}`
    )
  }

  const providerRequest = request.action === MESSAGE_ACTIONS.TRANSLATION && hasProvider(request)
  if ((request.url === undefined || request.url === null || request.url === '') &&
      !providerRequest) {
    return createErrorResponse(
      MESSAGE_ERROR_CODES.MISSING_PAYLOAD,
      'The message URL is required.'
    )
  }

  if (request.url !== undefined && request.url !== null && request.url !== '' &&
      !isHttpUrl(request.url)) {
    return createErrorResponse(
      MESSAGE_ERROR_CODES.INVALID_REQUEST,
      'The message URL must be an HTTP or HTTPS URL.'
    )
  }

  if ((request.method === undefined || request.method === null || request.method === '') &&
      !providerRequest) {
    return createErrorResponse(
      MESSAGE_ERROR_CODES.MISSING_PAYLOAD,
      'The message method is required.'
    )
  }

  if (!providerRequest && typeof request.method !== 'string') {
    return createErrorResponse(
      MESSAGE_ERROR_CODES.INVALID_REQUEST,
      'The message method must be a string.'
    )
  }

  if (!providerRequest && request.method.toUpperCase() !== expectedMethod(request.action)) {
    return createErrorResponse(
      MESSAGE_ERROR_CODES.INVALID_REQUEST,
      `The ${request.action} action requires ${expectedMethod(request.action)}.`
    )
  }

  if (request.action === MESSAGE_ACTIONS.DICTIONARY) {
    return null
  }

  if (!providerRequest && (request.key === undefined || request.key === null || request.key === '')) {
    return createErrorResponse(
      MESSAGE_ERROR_CODES.MISSING_PAYLOAD,
      'The translation API key is required.'
    )
  }

  if (!providerRequest && typeof request.key !== 'string') {
    return createErrorResponse(
      MESSAGE_ERROR_CODES.INVALID_REQUEST,
      'The translation API key must be a string.'
    )
  }

  if (!providerRequest && !request.key.trim()) {
    return createErrorResponse(
      MESSAGE_ERROR_CODES.MISSING_PAYLOAD,
      'The translation API key is required.'
    )
  }

  if (request.data === undefined || request.data === null) {
    return createErrorResponse(
      MESSAGE_ERROR_CODES.MISSING_PAYLOAD,
      'The translation payload is required.'
    )
  }

  if (!isRecord(request.data)) {
    return createErrorResponse(
      MESSAGE_ERROR_CODES.INVALID_REQUEST,
      'The translation payload must be an object.'
    )
  }

  if (!Array.isArray(request.data.text) || request.data.text.length === 0) {
    return createErrorResponse(
      MESSAGE_ERROR_CODES.MISSING_PAYLOAD,
      'The translation payload must include a non-empty text array.'
    )
  }

  if (request.data.text.some(text => typeof text !== 'string')) {
    return createErrorResponse(
      MESSAGE_ERROR_CODES.INVALID_REQUEST,
      'Every translation text value must be a string.'
    )
  }

  const targetLanguage = request.data.targetLanguage ?? request.data.target_lang
  if (typeof targetLanguage !== 'string' || !targetLanguage.trim()) {
    return createErrorResponse(
      MESSAGE_ERROR_CODES.MISSING_PAYLOAD,
      'The translation target language is required.'
    )
  }

  return null
}

function timeoutError() {
  const error = new Error('The network request timed out.')
  error.code = MESSAGE_ERROR_CODES.TIMEOUT
  return error
}

function invalidJsonError() {
  const error = new Error('The network response was not valid JSON.')
  error.code = MESSAGE_ERROR_CODES.INVALID_RESPONSE
  return error
}

function effectiveTimeout(timeoutMs) {
  const normalizedTimeout = Number(timeoutMs)
  return Number.isFinite(normalizedTimeout) && normalizedTimeout > 0
    ? normalizedTimeout
    : DEFAULT_MESSAGE_TIMEOUT_MS
}

/**
 * Race a background fetch and response processing against one bounded
 * deadline. The optional responseHandler is used to parse the body while the
 * same timer is still active. AbortController is used when available, while
 * the race also protects test and older runtimes whose fetch implementation
 * does not support abort signals.
 */
export async function fetchWithTimeout(
  fetchFn,
  url,
  options,
  timeoutMs,
  responseHandler = response => response
) {
  const timeout = effectiveTimeout(timeoutMs)
  const controller = typeof AbortController === 'function'
    ? new AbortController()
    : null
  const fetchOptions = {...options}

  if (controller) {
    fetchOptions.signal = controller.signal
  }

  let timeoutId = null
  let rejectTimeout
  const timeoutPromise = new Promise((_resolve, reject) => {
    rejectTimeout = reject
    timeoutId = setTimeout(() => {
      controller?.abort()
      rejectTimeout(timeoutError())
    }, timeout)
  })
  const fetchPromise = Promise.resolve().then(() => fetchFn(url, fetchOptions))

  try {
    const response = await Promise.race([fetchPromise, timeoutPromise])
    return await Promise.race([
      Promise.resolve().then(() => responseHandler(response)),
      timeoutPromise
    ])
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId)
    }
  }
}

function responsePayloadError(action, data) {
  if (!isRecord(data)) {
    return createErrorResponse(
      MESSAGE_ERROR_CODES.INVALID_RESPONSE,
      `The ${action} response must be a JSON object.`
    )
  }

  return null
}

function httpErrorResponse(response) {
  const status = Number.isFinite(response?.status) ? response.status : undefined
  const suffix = status === undefined ? '' : ` (${status})`
  return createErrorResponse(
    MESSAGE_ERROR_CODES.HTTP_ERROR,
    `The network request failed${suffix}.`,
    {status}
  )
}

function networkErrorResponse(error) {
  if (error?.code === MESSAGE_ERROR_CODES.TIMEOUT || error?.name === 'AbortError') {
    return createErrorResponse(
      MESSAGE_ERROR_CODES.TIMEOUT,
      'The network request timed out.'
    )
  }

  if (error?.code === MESSAGE_ERROR_CODES.INVALID_RESPONSE) {
    return createErrorResponse(
      MESSAGE_ERROR_CODES.INVALID_RESPONSE,
      error.message
    )
  }

  return createErrorResponse(
    MESSAGE_ERROR_CODES.NETWORK_ERROR,
    error?.message || 'The network request failed.'
  )
}

function requestOptions(request) {
  return {method: request.method}
}

function providerSecrets(provider, request) {
  if (isRecord(request.secrets)) {
    return request.secrets
  }

  const secretField = provider.auth.secretRef?.split('.').pop() || 'apiKey'
  return {
    providers: {
      [provider.id]: {
        [secretField]: typeof request.key === 'string' ? request.key : ''
      }
    }
  }
}

function providerErrorResponse(error) {
  const code = error?.code
  if (code === PROVIDER_ERROR_CODES.AUTH_REQUIRED) {
    return createErrorResponse(
      MESSAGE_ERROR_CODES.MISSING_PAYLOAD,
      'The translation provider credential is required.'
    )
  }

  if (code === PROVIDER_ERROR_CODES.PERMISSION_REQUIRED ||
      code === PROVIDER_ERROR_CODES.INVALID_PROVIDER ||
      code === PROVIDER_ERROR_CODES.INVALID_ENDPOINT ||
      code === PROVIDER_ERROR_CODES.UNSUPPORTED_CONTEXT) {
    return createErrorResponse(
      MESSAGE_ERROR_CODES.INVALID_REQUEST,
      error.message
    )
  }

  if (code === PROVIDER_ERROR_CODES.HTTP_ERROR) {
    return createErrorResponse(
      MESSAGE_ERROR_CODES.HTTP_ERROR,
      'The translation provider request failed.',
      {status: error.status}
    )
  }

  if (code === PROVIDER_ERROR_CODES.INVALID_RESPONSE) {
    return createErrorResponse(
      MESSAGE_ERROR_CODES.INVALID_RESPONSE,
      error.message
    )
  }

  if (code === PROVIDER_ERROR_CODES.TIMEOUT) {
    return createErrorResponse(
      MESSAGE_ERROR_CODES.TIMEOUT,
      'The translation provider request timed out.'
    )
  }

  return createErrorResponse(
    MESSAGE_ERROR_CODES.NETWORK_ERROR,
    'The translation provider request could not be completed.'
  )
}

async function handleProviderTranslation(request, {
  fetchFn,
  timeoutMs,
  permissionApi,
  allowedOrigins = [],
  permissionChecker
} = {}) {
  const provider = request.provider
    ? normalizeProviderDefinition(request.provider, {id: request.provider.id})
    : getProviderPreset('deepl-free')

  if (!provider) {
    return providerErrorResponse({
      code: PROVIDER_ERROR_CODES.INVALID_PROVIDER,
      message: 'The translation provider configuration is invalid.'
    })
  }

  const targetLanguage = request.data.targetLanguage ?? request.data.target_lang
  const checker = permissionChecker || (async (_pattern, endpointUrl) => (
    hasProviderOriginPermission(permissionApi, endpointUrl)
  ))

  try {
    const result = await executeProviderTranslation(provider, {
      text: request.data.text,
      targetLanguage,
      secrets: providerSecrets(provider, request),
      allowedOrigins,
      permissionChecker: checker,
      fetchFn,
      timeoutMs
    })
    // Keep the v6.6 response body stable for content.js while the provider
    // engine exposes the normalized text to newer callers.
    return createSuccessResponse(result.raw)
  } catch (error) {
    return providerErrorResponse(error)
  }
}

/**
 * Handle one message independently of chrome.* so all boundary cases can be
 * tested without loading a service-worker global in Node.
 */
export async function handleBackgroundMessage(
  request,
  {
    fetchFn = globalThis.fetch,
    timeoutMs = DEFAULT_MESSAGE_TIMEOUT_MS,
    permissionApi = globalThis.chrome?.permissions,
    allowedOrigins = [],
    permissionChecker
  } = {}
) {
  const validationError = validateMessageRequest(request)
  if (validationError) {
    return validationError
  }

  if (request.action === MESSAGE_ACTIONS.TRANSLATION) {
    return handleProviderTranslation(request, {
      fetchFn,
      timeoutMs,
      permissionApi,
      allowedOrigins,
      permissionChecker
    })
  }

  if (typeof fetchFn !== 'function') {
    return createErrorResponse(
      MESSAGE_ERROR_CODES.INTERNAL_ERROR,
      'The background fetch implementation is unavailable.'
    )
  }

  let result
  try {
    result = await fetchWithTimeout(
      fetchFn,
      request.url,
      requestOptions(request),
      timeoutMs,
      async response => {
        if (!response || typeof response.json !== 'function') {
          return {response}
        }

        if (response.ok === false || response.status >= 400) {
          return {response}
        }

        let data
        try {
          data = await response.json()
        } catch (_error) {
          throw invalidJsonError()
        }

        return {response, data}
      }
    )
  } catch (error) {
    return networkErrorResponse(error)
  }

  const response = result?.response
  if (!response || typeof response.json !== 'function') {
    return createErrorResponse(
      MESSAGE_ERROR_CODES.INVALID_RESPONSE,
      'The network response did not provide a JSON body.'
    )
  }

  if (response.ok === false || response.status >= 400) {
    return httpErrorResponse(response)
  }

  return responsePayloadError(request.action, result.data) || createSuccessResponse(result.data)
}

/**
 * Register the Chrome listener separately from the fetch logic so the
 * sendResponse/return-true lifecycle can be tested without a Chrome global.
 */
export function registerBackgroundListener(runtime, handler = handleBackgroundMessage) {
  if (!runtime?.onMessage?.addListener) {
    return null
  }

  const listener = (request, _sender, sendResponse) => {
    const respond = respondOnce(sendResponse)

    Promise.resolve()
      .then(() => handler(request))
      .then(respond)
      .catch(() => respond(createErrorResponse(
        MESSAGE_ERROR_CODES.INTERNAL_ERROR,
        'The background message handler failed.'
      )))

    // Keep the channel open for the asynchronous handler response.
    return true
  }

  runtime.onMessage.addListener(listener)
  return listener
}
