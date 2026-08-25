/**
 * Stage 2 translation-provider contract.
 *
 * Provider definitions describe how a request is shaped and how a response is
 * read. Credentials are deliberately not part of this model; they are
 * addressed through auth.secretRef and live in chrome.storage.local.
 */

export const TRANSLATION_PROVIDER_MODEL_VERSION = 1

export const PROVIDER_KINDS = Object.freeze({
  HTTP: 'http',
  BUILT_IN: 'built-in'
})

export const PROVIDER_SOURCES = Object.freeze({
  PRESET: 'preset'
})

export const PROVIDER_EXECUTION_CONTEXTS = Object.freeze({
  BACKGROUND: 'background',
  CONTENT_PAGE: 'content-page'
})

export const PROVIDER_ADAPTERS = Object.freeze({
  HTTP: 'http',
  DEEPL: 'deepl',
  GEMINI: 'gemini',
  CHROME_TRANSLATOR: 'chrome-translator'
})

export const PROVIDER_AUTH_MODES = Object.freeze({
  NONE: 'none',
  API_KEY: 'api-key'
})

export const DEFAULT_PROVIDER_ID = 'deepl-free'
export const CHROME_TRANSLATOR_PROVIDER_ID = 'chrome-translator'
export const GEMINI_DEFAULT_MODEL_ID = 'gemini-3.5-flash'

const PROVIDER_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/
const GEMINI_MODEL_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,127}$/

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function cloneValue(value) {
  if (Array.isArray(value)) {
    return value.map(cloneValue)
  }

  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [
      key,
      cloneValue(child)
    ]))
  }

  return value
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value
  }

  Object.values(value).forEach(deepFreeze)
  return Object.freeze(value)
}

function normalizedString(value, fallback = '') {
  if (typeof value !== 'string') {
    return fallback
  }

  const result = value.trim()
  return result || fallback
}

function normalizedProviderId(value, fallback = '') {
  const result = normalizedString(value, fallback).toLowerCase()
  return PROVIDER_ID_PATTERN.test(result) ? result : fallback
}

export function normalizeGeminiModelId(value, fallback = GEMINI_DEFAULT_MODEL_ID) {
  const normalized = normalizedString(value, fallback)
    .replace(/^models\//i, '')
    .replace(/:generateContent$/i, '')
    .toLowerCase()
  return GEMINI_MODEL_ID_PATTERN.test(normalized) ? normalized : fallback
}

const DEEPL_REQUEST = deepFreeze({
  headers: [
    {name: 'Content-Type', valueTemplate: 'application/json'}
  ],
  bodyTemplate: {
    text: '{{texts}}',
    target_lang: '{{targetLanguage}}'
  },
  textPath: 'text',
  targetLanguagePath: 'target_lang'
})

const DEEPL_RESPONSE = deepFreeze({
  textPath: 'translations[0].text'
})

const GEMINI_REQUEST = deepFreeze({
  headers: [
    {name: 'Content-Type', valueTemplate: 'application/json'}
  ],
  bodyTemplate: {
    contents: [{
      role: 'user',
      parts: [{text: 'Translate the following text to {{targetLanguage}}. Return only the translated text.\\n\\n{{text}}'}]
    }]
  },
  textPath: 'text',
  targetLanguagePath: 'targetLanguage'
})

const GEMINI_RESPONSE = deepFreeze({
  textPath: 'candidates[0].content.parts[0].text'
})

const PRESET_DEFINITIONS = {
  'deepl-free': {
    modelVersion: TRANSLATION_PROVIDER_MODEL_VERSION,
    id: 'deepl-free',
    name: 'DeepL Free',
    kind: PROVIDER_KINDS.HTTP,
    source: PROVIDER_SOURCES.PRESET,
    presetId: 'deepl-free',
    endpoint: {
      url: 'https://api-free.deepl.com/v2/translate',
      method: 'POST'
    },
    auth: {
      mode: PROVIDER_AUTH_MODES.API_KEY,
      location: 'header',
      headerName: 'Authorization',
      prefix: 'DeepL-Auth-Key ',
      secretRef: 'providers.deepl-free.apiKey'
    },
    request: DEEPL_REQUEST,
    response: DEEPL_RESPONSE,
    execution: {
      adapterId: PROVIDER_ADAPTERS.DEEPL,
      context: PROVIDER_EXECUTION_CONTEXTS.BACKGROUND,
      supportsWebWorker: true
    }
  },
  'deepl-pro': {
    modelVersion: TRANSLATION_PROVIDER_MODEL_VERSION,
    id: 'deepl-pro',
    name: 'DeepL Pro',
    kind: PROVIDER_KINDS.HTTP,
    source: PROVIDER_SOURCES.PRESET,
    presetId: 'deepl-pro',
    endpoint: {
      url: 'https://api.deepl.com/v2/translate',
      method: 'POST'
    },
    auth: {
      mode: PROVIDER_AUTH_MODES.API_KEY,
      location: 'header',
      headerName: 'Authorization',
      prefix: 'DeepL-Auth-Key ',
      secretRef: 'providers.deepl-pro.apiKey'
    },
    request: DEEPL_REQUEST,
    response: DEEPL_RESPONSE,
    execution: {
      adapterId: PROVIDER_ADAPTERS.DEEPL,
      context: PROVIDER_EXECUTION_CONTEXTS.BACKGROUND,
      supportsWebWorker: true
    }
  },
  gemini: {
    modelVersion: TRANSLATION_PROVIDER_MODEL_VERSION,
    id: 'gemini',
    name: 'Gemini',
    kind: PROVIDER_KINDS.HTTP,
    source: PROVIDER_SOURCES.PRESET,
    presetId: 'gemini',
    model: GEMINI_DEFAULT_MODEL_ID,
    endpoint: {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_DEFAULT_MODEL_ID}:generateContent`,
      method: 'POST'
    },
    auth: {
      mode: PROVIDER_AUTH_MODES.API_KEY,
      location: 'header',
      headerName: 'x-goog-api-key',
      prefix: '',
      secretRef: 'providers.gemini.apiKey'
    },
    request: GEMINI_REQUEST,
    response: GEMINI_RESPONSE,
    execution: {
      adapterId: PROVIDER_ADAPTERS.GEMINI,
      context: PROVIDER_EXECUTION_CONTEXTS.BACKGROUND,
      supportsWebWorker: true
    }
  },
  [CHROME_TRANSLATOR_PROVIDER_ID]: {
    modelVersion: TRANSLATION_PROVIDER_MODEL_VERSION,
    id: CHROME_TRANSLATOR_PROVIDER_ID,
    name: 'Chrome built-in translation (Translator API)',
    kind: PROVIDER_KINDS.BUILT_IN,
    source: PROVIDER_SOURCES.PRESET,
    presetId: CHROME_TRANSLATOR_PROVIDER_ID,
    endpoint: null,
    auth: {
      mode: PROVIDER_AUTH_MODES.NONE
    },
    request: {
      headers: [],
      bodyTemplate: null,
      textPath: 'text',
      targetLanguagePath: 'targetLanguage'
    },
    response: {
      textPath: 'result'
    },
    execution: {
      adapterId: PROVIDER_ADAPTERS.CHROME_TRANSLATOR,
      context: PROVIDER_EXECUTION_CONTEXTS.CONTENT_PAGE,
      globalName: 'Translator',
      requiresDocument: true,
      supportsWebWorker: false
    }
  }
}

export const PROVIDER_PRESETS = deepFreeze(PRESET_DEFINITIONS)

function providerWithGeminiModel(preset, model) {
  if (preset.id !== 'gemini') {
    return cloneValue(preset)
  }

  const result = cloneValue(preset)
  result.model = normalizeGeminiModelId(model)
  result.endpoint.url = `https://generativelanguage.googleapis.com/v1beta/models/${result.model}:generateContent`
  return result
}

/**
 * Return a canonical built-in provider definition.
 *
 * Provider definitions are intentionally closed over the three supported
 * services. Persisted or message-bound objects that do not identify one of
 * unsupported persisted objects are rejected instead of being interpreted as
 * arbitrary network configuration.
 */
export function normalizeProviderDefinition(input, {id: fallbackId = '', model: fallbackModel = ''} = {}) {
  if (!isRecord(input)) {
    return null
  }

  const id = normalizedProviderId(input.id, normalizedProviderId(fallbackId))
  const preset = PROVIDER_PRESETS[id]
  if (!id || !preset) {
    return null
  }

  if (input.source && input.source !== PROVIDER_SOURCES.PRESET) {
    return null
  }
  if (input.kind && input.kind !== preset.kind) {
    return null
  }

  return providerWithGeminiModel(
    preset,
    id === 'gemini' ? fallbackModel || input.model : ''
  )
}

export function getProviderPreset(presetId, {model = ''} = {}) {
  const definition = PROVIDER_PRESETS[normalizedProviderId(presetId)]
  return definition ? normalizeProviderDefinition(definition, {model}) : null
}

export function isProviderDefinition(value) {
  return Boolean(
    isRecord(value) &&
    value.modelVersion === TRANSLATION_PROVIDER_MODEL_VERSION &&
    typeof value.id === 'string' &&
    Boolean(PROVIDER_PRESETS[value.id]) &&
    Object.values(PROVIDER_KINDS).includes(value.kind) &&
    value.source === PROVIDER_SOURCES.PRESET &&
    (value.kind === PROVIDER_KINDS.BUILT_IN
      ? value.endpoint === null
      : isRecord(value.endpoint) &&
        typeof value.endpoint.url === 'string' &&
        typeof value.endpoint.method === 'string') &&
    isRecord(value.auth) &&
    isRecord(value.request) &&
    isRecord(value.response) &&
    isRecord(value.execution) &&
    typeof value.execution.adapterId === 'string' &&
    typeof value.execution.context === 'string' &&
    (value.kind !== PROVIDER_KINDS.BUILT_IN ||
      value.execution.context === PROVIDER_EXECUTION_CONTEXTS.CONTENT_PAGE) &&
    (value.id !== 'gemini' || normalizeGeminiModelId(value.model) === value.model)
  )
}
