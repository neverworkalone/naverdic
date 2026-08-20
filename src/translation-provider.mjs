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
  PRESET: 'preset',
  CUSTOM: 'custom'
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
  API_KEY: 'api-key',
  BEARER: 'bearer',
  CUSTOM: 'custom'
})

export const PROVIDER_HTTP_METHODS = Object.freeze([
  'POST',
  'PUT',
  'PATCH'
])

export const DEFAULT_PROVIDER_ID = 'deepl-free'
export const CHROME_TRANSLATOR_PROVIDER_ID = 'chrome-translator'

const PROVIDER_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/
const SECRET_REF_PATTERN = /^providers\.[a-z0-9][a-z0-9._-]{0,63}\.(?:apiKey|token)$/
const SECRET_PLACEHOLDER_PATTERN = /\{\{(?:apiKey|token|secret)\}\}/

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key)
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

function normalizedFieldName(value) {
  return String(value ?? '')
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[^a-z0-9]+/gi, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase()
}

function isSensitiveFieldName(value) {
  const fieldName = normalizedFieldName(value)
  return fieldName === 'key' ||
    fieldName === 'apikey' ||
    fieldName.endsWith('_key') ||
    fieldName === 'token' ||
    fieldName.endsWith('_token') ||
    fieldName === 'authorization' ||
    fieldName.endsWith('_authorization') ||
    fieldName === 'credential' ||
    fieldName === 'credentials' ||
    fieldName.endsWith('_credential') ||
    fieldName.endsWith('_credentials') ||
    fieldName === 'password' ||
    fieldName.endsWith('_password') ||
    fieldName === 'secret' ||
    fieldName.endsWith('_secret')
}

function isSensitiveHeaderName(value) {
  return isSensitiveFieldName(value)
}

function normalizedProviderId(value, fallback = '') {
  const result = normalizedString(value, fallback).toLowerCase()
  return PROVIDER_ID_PATTERN.test(result) ? result : fallback
}

function normalizedSecretRef(value) {
  const result = normalizedString(value)
  return SECRET_REF_PATTERN.test(result) ? result : null
}

function normalizedHttpUrl(value) {
  const result = normalizedString(value)
  if (!result) {
    return ''
  }

  try {
    const url = new URL(result)
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') ||
        url.username || url.password) {
      return ''
    }

    return url.toString()
  } catch (_error) {
    return ''
  }
}

function isValidHeaderName(value) {
  return /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(value)
}

function normalizedMethod(value, fallback = 'POST') {
  const method = normalizedString(value).toUpperCase()
  if (!method) {
    return fallback
  }

  return PROVIDER_HTTP_METHODS.includes(method) ? method : ''
}

function sanitizeTemplateValue(value, fieldName = '') {
  if (Array.isArray(value)) {
    return value.map(child => sanitizeTemplateValue(child, fieldName))
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key, child]) => !isSensitiveFieldName(key) || (
          typeof child === 'string' && SECRET_PLACEHOLDER_PATTERN.test(child)
        ))
        .map(([key, child]) => [key, sanitizeTemplateValue(child, key)])
    )
  }

  if (isSensitiveFieldName(fieldName) && (
    typeof value !== 'string' || !SECRET_PLACEHOLDER_PATTERN.test(value)
  )) {
    return undefined
  }

  return value
}

function normalizedHeader(header) {
  const name = normalizedString(header.name)
  const valueTemplate = normalizedString(
    header.valueTemplate ?? header.value,
    ''
  )
  const secretRef = normalizedSecretRef(header.secretRef)
  if (!name || !isValidHeaderName(name)) {
    return null
  }

  if (!valueTemplate && !secretRef) {
    return null
  }

  const sensitive = isSensitiveHeaderName(name)

  if (sensitive &&
      !secretRef &&
      !SECRET_PLACEHOLDER_PATTERN.test(valueTemplate)) {
    // A sensitive header without a local secret reference is not safe to
    // persist. The caller can add a secretRef and a {{secret}} placeholder.
    return null
  }

  const safeValueTemplate = sensitive &&
    !SECRET_PLACEHOLDER_PATTERN.test(valueTemplate)
    ? '{{secret}}'
    : valueTemplate

  return {
    name,
    valueTemplate: safeValueTemplate,
    secretRef: secretRef || null
  }
}

function normalizedHeaderEntries(value) {
  let headers
  if (Array.isArray(value)) {
    headers = value.filter(isRecord)
  } else if (isRecord(value)) {
    headers = Object.entries(value).map(([name, headerValue]) => ({
      name,
      value: headerValue
    }))
  } else {
    headers = []
  }

  return headers
    .map(normalizedHeader)
    .filter(Boolean)
}

function normalizedAuth(value, providerId, fallback = {}) {
  const source = isRecord(value) ? value : {}
  const mode = Object.values(PROVIDER_AUTH_MODES).includes(source.mode)
    ? source.mode
    : (fallback.mode || PROVIDER_AUTH_MODES.NONE)
  const location = source.location === 'query' ? 'query' : 'header'
  const headerName = normalizedString(source.headerName, fallback.headerName || '')
  const prefix = typeof source.prefix === 'string'
    ? source.prefix
    : (fallback.prefix || '')
  const fallbackRef = fallback.secretRef || `providers.${providerId}.apiKey`
  const secretRef = mode === PROVIDER_AUTH_MODES.NONE
    ? null
    : normalizedSecretRef(source.secretRef) || normalizedSecretRef(fallbackRef)

  return {
    mode,
    location,
    headerName,
    prefix,
    secretRef
  }
}

function normalizedExecution(value, kind, adapterId) {
  const source = isRecord(value) ? value : {}

  if (kind === PROVIDER_KINDS.BUILT_IN) {
    return {
      adapterId: PROVIDER_ADAPTERS.CHROME_TRANSLATOR,
      context: PROVIDER_EXECUTION_CONTEXTS.CONTENT_PAGE,
      globalName: normalizedString(source.globalName, 'Translator'),
      requiresDocument: true,
      supportsWebWorker: false
    }
  }

  return {
    adapterId: normalizedString(adapterId, PROVIDER_ADAPTERS.HTTP),
    context: PROVIDER_EXECUTION_CONTEXTS.BACKGROUND,
    globalName: '',
    requiresDocument: false,
    supportsWebWorker: true
  }
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
    endpoint: {
      url: 'https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent',
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

/**
 * Normalize a provider definition to the storage-safe common model.
 * Unknown fields, including apiKey/key/authorization values, are discarded.
 */
export function normalizeProviderDefinition(input, {id: fallbackId = ''} = {}) {
  if (!isRecord(input)) {
    return null
  }

  const id = normalizedProviderId(input.id, normalizedProviderId(fallbackId))
  if (!id) {
    return null
  }

  const kind = input.kind === PROVIDER_KINDS.BUILT_IN
    ? PROVIDER_KINDS.BUILT_IN
    : PROVIDER_KINDS.HTTP
  const source = input.kind === PROVIDER_KINDS.BUILT_IN ||
    input.source === PROVIDER_SOURCES.PRESET ||
    input.kind === 'preset'
    ? PROVIDER_SOURCES.PRESET
    : PROVIDER_SOURCES.CUSTOM
  const presetId = source === PROVIDER_SOURCES.PRESET
    ? normalizedProviderId(input.presetId, id)
    : null
  const endpointSource = isRecord(input.endpoint) ? input.endpoint : input
  const url = normalizedHttpUrl(endpointSource.url)
  if (kind === PROVIDER_KINDS.HTTP && !url) {
    return null
  }

  const method = kind === PROVIDER_KINDS.HTTP
    ? normalizedMethod(endpointSource.method)
    : null
  if (kind === PROVIDER_KINDS.HTTP && !method) {
    return null
  }

  const requestSource = isRecord(input.request) ? input.request : {}
  const responseSource = isRecord(input.response) ? input.response : {}
  const authFallback = source === PROVIDER_SOURCES.PRESET && PROVIDER_PRESETS[presetId]
    ? PROVIDER_PRESETS[presetId].auth
    : {}
  const bodyTemplate = hasOwn(requestSource, 'bodyTemplate')
    ? sanitizeTemplateValue(requestSource.bodyTemplate)
    : {}

  return {
    modelVersion: TRANSLATION_PROVIDER_MODEL_VERSION,
    id,
    name: normalizedString(input.name, id),
    kind,
    source,
    presetId,
    endpoint: kind === PROVIDER_KINDS.BUILT_IN
      ? null
      : {
        url,
        method
      },
    auth: kind === PROVIDER_KINDS.BUILT_IN
      ? normalizedAuth({mode: PROVIDER_AUTH_MODES.NONE}, id)
      : normalizedAuth(input.auth, id, authFallback),
    request: {
      headers: normalizedHeaderEntries(requestSource.headers),
      bodyTemplate,
      textPath: normalizedString(requestSource.textPath, 'text'),
      targetLanguagePath: normalizedString(
        requestSource.targetLanguagePath,
        'target_lang'
      )
    },
    response: {
      textPath: normalizedString(responseSource.textPath, 'text')
    },
    execution: normalizedExecution(
      input.execution,
      kind,
      input.execution?.adapterId
    )
  }
}

export function getProviderPreset(presetId) {
  const definition = PROVIDER_PRESETS[normalizedProviderId(presetId)]
  return definition ? normalizeProviderDefinition(definition) : null
}

export function isProviderDefinition(value) {
  return Boolean(
    isRecord(value) &&
    value.modelVersion === TRANSLATION_PROVIDER_MODEL_VERSION &&
    typeof value.id === 'string' &&
    Object.values(PROVIDER_KINDS).includes(value.kind) &&
    Object.values(PROVIDER_SOURCES).includes(value.source) &&
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
      value.execution.context === PROVIDER_EXECUTION_CONTEXTS.CONTENT_PAGE)
  )
}
