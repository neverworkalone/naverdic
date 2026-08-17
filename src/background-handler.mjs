import {
  DEFAULT_MESSAGE_TIMEOUT_MS,
  MESSAGE_ACTIONS,
  MESSAGE_ERROR_CODES,
  createErrorResponse,
  createSuccessResponse,
  respondOnce
} from './messaging.mjs'

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isHttpUrl(value) {
  if (typeof value !== 'string' || !value.trim()) {
    return false
  }

  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
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

  if (request.url === undefined || request.url === null || request.url === '') {
    return createErrorResponse(
      MESSAGE_ERROR_CODES.MISSING_PAYLOAD,
      'The message URL is required.'
    )
  }

  if (!isHttpUrl(request.url)) {
    return createErrorResponse(
      MESSAGE_ERROR_CODES.INVALID_REQUEST,
      'The message URL must be an HTTP or HTTPS URL.'
    )
  }

  if (request.method === undefined || request.method === null || request.method === '') {
    return createErrorResponse(
      MESSAGE_ERROR_CODES.MISSING_PAYLOAD,
      'The message method is required.'
    )
  }

  if (typeof request.method !== 'string') {
    return createErrorResponse(
      MESSAGE_ERROR_CODES.INVALID_REQUEST,
      'The message method must be a string.'
    )
  }

  if (request.method.toUpperCase() !== expectedMethod(request.action)) {
    return createErrorResponse(
      MESSAGE_ERROR_CODES.INVALID_REQUEST,
      `The ${request.action} action requires ${expectedMethod(request.action)}.`
    )
  }

  if (request.action === MESSAGE_ACTIONS.DICTIONARY) {
    return null
  }

  if (request.key === undefined || request.key === null || request.key === '') {
    return createErrorResponse(
      MESSAGE_ERROR_CODES.MISSING_PAYLOAD,
      'The translation API key is required.'
    )
  }

  if (typeof request.key !== 'string') {
    return createErrorResponse(
      MESSAGE_ERROR_CODES.INVALID_REQUEST,
      'The translation API key must be a string.'
    )
  }

  if (!request.key.trim()) {
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

  if (typeof request.data.target_lang !== 'string' || !request.data.target_lang.trim()) {
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

/**
 * Race a background fetch against a bounded timeout. AbortController is used
 * when available, while the race also protects test and older runtimes whose
 * fetch implementation does not support abort signals.
 */
export async function fetchWithTimeout(fetchFn, url, options, timeoutMs) {
  const normalizedTimeout = Number(timeoutMs)
  const effectiveTimeout = Number.isFinite(normalizedTimeout) && normalizedTimeout > 0
    ? normalizedTimeout
    : DEFAULT_MESSAGE_TIMEOUT_MS
  const controller = typeof AbortController === 'function'
    ? new AbortController()
    : null
  const fetchOptions = {...options}

  if (controller) {
    fetchOptions.signal = controller.signal
  }

  let timeoutId = null
  const fetchPromise = Promise.resolve().then(() => fetchFn(url, fetchOptions))
  const timeoutPromise = new Promise((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      controller?.abort()
      reject(timeoutError())
    }, effectiveTimeout)
  })

  try {
    return await Promise.race([fetchPromise, timeoutPromise])
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

  if (action === MESSAGE_ACTIONS.TRANSLATION) {
    const firstTranslation = data.translations?.[0]
    if (!Array.isArray(data.translations) ||
        !isRecord(firstTranslation) ||
        typeof firstTranslation.text !== 'string') {
      return createErrorResponse(
        MESSAGE_ERROR_CODES.INVALID_RESPONSE,
        'The translation response did not include translated text.'
      )
    }
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

  return createErrorResponse(
    MESSAGE_ERROR_CODES.NETWORK_ERROR,
    error?.message || 'The network request failed.'
  )
}

function requestOptions(request) {
  if (request.action === MESSAGE_ACTIONS.DICTIONARY) {
    return {method: request.method}
  }

  return {
    method: request.method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `DeepL-Auth-Key ${request.key}`
    },
    body: JSON.stringify(request.data)
  }
}

/**
 * Handle one message independently of chrome.* so all boundary cases can be
 * tested without loading a service-worker global in Node.
 */
export async function handleBackgroundMessage(
  request,
  {fetchFn = globalThis.fetch, timeoutMs = DEFAULT_MESSAGE_TIMEOUT_MS} = {}
) {
  const validationError = validateMessageRequest(request)
  if (validationError) {
    return validationError
  }

  if (typeof fetchFn !== 'function') {
    return createErrorResponse(
      MESSAGE_ERROR_CODES.INTERNAL_ERROR,
      'The background fetch implementation is unavailable.'
    )
  }

  let response
  try {
    response = await fetchWithTimeout(
      fetchFn,
      request.url,
      requestOptions(request),
      timeoutMs
    )
  } catch (error) {
    return networkErrorResponse(error)
  }

  if (!response || typeof response.json !== 'function') {
    return createErrorResponse(
      MESSAGE_ERROR_CODES.INVALID_RESPONSE,
      'The network response did not provide a JSON body.'
    )
  }

  if (response.ok === false || response.status >= 400) {
    return httpErrorResponse(response)
  }

  let data
  try {
    data = await response.json()
  } catch (_error) {
    return createErrorResponse(
      MESSAGE_ERROR_CODES.INVALID_RESPONSE,
      'The network response was not valid JSON.'
    )
  }

  return responsePayloadError(request.action, data) || createSuccessResponse(data)
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
