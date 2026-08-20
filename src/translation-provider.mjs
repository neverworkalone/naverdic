/**
 * Stage 2 translation-provider contract.
 *
 * Provider definitions describe how a request is shaped and how a response is
 * read. Credentials are deliberately not part of this model; they are
 * addressed through auth.secretRef and live in chrome.storage.local.
 */

export const TRANSLATION_PROVIDER_MODEL_VERSION = 1

export const PROVIDER_KINDS = Object.freeze({
  PRESET: 'preset',
  CUSTOM: 'custom'
})

export const PROVIDER_AUTH_MODES = Object.freeze({
  NONE: 'none',
  API_KEY: 'api-key',
  BEARER: 'bearer',
  CUSTOM: 'custom'
})

export const PROVIDER_HTTP_METHODS = Object.freeze([
  'GET',
  'POST',
  'PUT',
  'PATCH'
])

export const DEFAULT_PROVIDER_ID = 'deepl-free'

const PROVIDER_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/
const SECRET_REF_PATTERN = /^providers\.[a-z0-9][a-z0-9._-]{0,63}\.(?:apiKey|token)$/
const SECRET_PLACEHOLDER_PATTERN = /\{\{(?:apiKey|token|secret)\}\}/
const SENSITIVE_FIELD_PATTERN = /^(?:api[-_]?key|authorization|password|secret|token)$/i
const SENSITIVE_HEADER_PATTERN = /(?:authorization|api[-_]?key|token|secret)/i

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
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : ''
  } catch (_error) {
    return ''
  }
}

function normalizedMethod(value, fallback = 'POST') {
  const method = normalizedString(value, fallback).toUpperCase()
  return PROVIDER_HTTP_METHODS.includes(method) ? method : fallback
}

function sanitizeTemplateValue(value, fieldName = '') {
  if (Array.isArray(value)) {
    return value.map(child => sanitizeTemplateValue(child, fieldName))
  }

  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key, child]) => !SENSITIVE_FIELD_PATTERN.test(key) || (
          typeof child === 'string' && SECRET_PLACEHOLDER_PATTERN.test(child)
        ))
        .map(([key, child]) => [key, sanitizeTemplateValue(child, key)])
    )
  }

  if (SENSITIVE_FIELD_PATTERN.test(fieldName) && (
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
  if (!name) {
    return null
  }

  if (!valueTemplate && !secretRef) {
    return null
  }

  if (SENSITIVE_HEADER_PATTERN.test(name) &&
      !secretRef &&
      !SECRET_PLACEHOLDER_PATTERN.test(valueTemplate)) {
    // A sensitive header without a local secret reference is not safe to
    // persist. The caller can add a secretRef and a {{secret}} placeholder.
    return null
  }

  const safeValueTemplate = SENSITIVE_HEADER_PATTERN.test(name) &&
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

const DEEPL_REQUEST = deepFreeze({
  headers: [
    {name: 'Content-Type', valueTemplate: 'application/json'}
  ],
  bodyTemplate: {
    text: ['{{text}}'],
    target_lang: '{{targetLanguage}}'
  },
  textPath: 'text',
  targetLanguagePath: 'target_lang'
})

const DEEPL_RESPONSE = deepFreeze({
  textPath: 'translations[0].text'
})

const PRESET_DEFINITIONS = {
  'deepl-free': {
    modelVersion: TRANSLATION_PROVIDER_MODEL_VERSION,
    id: 'deepl-free',
    name: 'DeepL Free',
    kind: PROVIDER_KINDS.PRESET,
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
    response: DEEPL_RESPONSE
  },
  'deepl-pro': {
    modelVersion: TRANSLATION_PROVIDER_MODEL_VERSION,
    id: 'deepl-pro',
    name: 'DeepL Pro',
    kind: PROVIDER_KINDS.PRESET,
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
    response: DEEPL_RESPONSE
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

  const kind = input.kind === PROVIDER_KINDS.PRESET
    ? PROVIDER_KINDS.PRESET
    : PROVIDER_KINDS.CUSTOM
  const presetId = kind === PROVIDER_KINDS.PRESET
    ? normalizedProviderId(input.presetId, id)
    : null
  const endpointSource = isRecord(input.endpoint) ? input.endpoint : input
  const url = normalizedHttpUrl(endpointSource.url)
  if (!url) {
    return null
  }

  const requestSource = isRecord(input.request) ? input.request : {}
  const responseSource = isRecord(input.response) ? input.response : {}
  const authFallback = kind === PROVIDER_KINDS.PRESET && PROVIDER_PRESETS[presetId]
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
    presetId,
    endpoint: {
      url,
      method: normalizedMethod(endpointSource.method)
    },
    auth: normalizedAuth(input.auth, id, authFallback),
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
    }
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
    isRecord(value.endpoint) &&
    typeof value.endpoint.url === 'string' &&
    typeof value.endpoint.method === 'string' &&
    isRecord(value.auth) &&
    isRecord(value.request) &&
    isRecord(value.response)
  )
}
