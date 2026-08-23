import {normalizeGeminiModelId} from './translation-provider.mjs'

export const GEMINI_MODELS_URL = 'https://generativelanguage.googleapis.com/v1beta/models'

const DEFAULT_TIMEOUT_MS = 10000

function modelIdFromName(value) {
  if (typeof value !== 'string') {
    return ''
  }

  return value.trim().replace(/^models\//i, '')
}

function isFlashModel(model) {
  return /flash(?:-lite)?/i.test(model)
}

function timeoutValue(value) {
  const normalized = Number(value)
  return Number.isFinite(normalized) && normalized > 0
    ? normalized
    : DEFAULT_TIMEOUT_MS
}

function createModelError(message, code = 'MODEL_LIST_ERROR') {
  const error = new Error(message)
  error.code = code
  return error
}

/**
 * Fetch the Gemini models that can serve generateContent requests.
 * API keys are used only in the request header and are never included in an
 * error or returned value.
 */
export async function fetchGeminiModels(apiKey, {
  fetchFn = globalThis.fetch,
  timeoutMs
} = {}) {
  const credential = String(apiKey || '').trim()
  if (!credential) {
    throw createModelError('A Gemini API key is required.', 'API_KEY_REQUIRED')
  }
  if (typeof fetchFn !== 'function') {
    throw createModelError('The Gemini model list could not be requested.')
  }

  const controller = typeof AbortController === 'function'
    ? new AbortController()
    : null
  const request = {
    headers: {'x-goog-api-key': credential}
  }
  if (controller) {
    request.signal = controller.signal
  }

  let timeoutId
  try {
    const responsePromise = Promise.resolve().then(() => fetchFn(GEMINI_MODELS_URL, request))
    const timeoutPromise = new Promise((_resolve, reject) => {
      timeoutId = setTimeout(() => {
        controller?.abort()
        reject(createModelError('The Gemini model list request timed out.', 'TIMEOUT'))
      }, timeoutValue(timeoutMs))
    })
    const response = await Promise.race([responsePromise, timeoutPromise])
    if (!response || typeof response.json !== 'function') {
      throw createModelError('The Gemini model list response was invalid.')
    }
    if (!response.ok) {
      throw createModelError('The Gemini model list request failed.', 'HTTP_ERROR')
    }

    const payload = await response.json()
    const models = Array.isArray(payload?.models)
      ? payload.models
        .filter(model => Array.isArray(model?.supportedGenerationMethods) && model.supportedGenerationMethods.includes('generateContent'))
        .map(model => modelIdFromName(model.name))
        .filter(model => model && isFlashModel(model))
        .map(model => normalizeGeminiModelId(model, ''))
        .filter(Boolean)
      : []
    const uniqueModels = [...new Set(models)].sort()
    if (!uniqueModels.length) {
      throw createModelError('No compatible Gemini models were found.', 'NO_MODELS')
    }
    return uniqueModels
  } catch (error) {
    if (error?.code) {
      throw error
    }
    throw createModelError('The Gemini model list request failed.')
  } finally {
    clearTimeout(timeoutId)
  }
}
