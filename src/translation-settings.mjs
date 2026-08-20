import {
  PROVIDER_AUTH_MODES,
  PROVIDER_HTTP_METHODS,
  PROVIDER_PRESETS,
  normalizeProviderDefinition
} from './translation-provider.mjs'

const PROVIDER_ID_PATTERN = /^[a-z0-9][a-z0-9._-]{0,63}$/
const HEADER_NAME_PATTERN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/
const HTTP_PROTOCOLS = new Set(['http:', 'https:'])

export const CUSTOM_PROVIDER_METHODS = Object.freeze([...PROVIDER_HTTP_METHODS])
export const CUSTOM_PROVIDER_AUTH_MODES = Object.freeze([
  PROVIDER_AUTH_MODES.NONE,
  PROVIDER_AUTH_MODES.API_KEY,
  PROVIDER_AUTH_MODES.BEARER,
  PROVIDER_AUTH_MODES.CUSTOM
])
export const CUSTOM_PROVIDER_AUTH_LOCATIONS = Object.freeze(['header', 'query'])

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

function normalizedString(value, fallback = '') {
  if (typeof value !== 'string') {
    return fallback
  }

  const normalized = value.trim()
  return normalized || fallback
}

function getSecretValue(provider, secrets = {}) {
  const secretRef = provider?.auth?.secretRef
  if (!secretRef) {
    return ''
  }

  const value = secretRef.split('.').reduce((current, segment) => current?.[segment], secrets)
  return typeof value === 'string' ? value.trim() : ''
}

function secretFieldForAuth(mode) {
  return mode === PROVIDER_AUTH_MODES.BEARER ? 'token' : 'apiKey'
}

export function providerIdFromName(value) {
  const normalized = normalizedString(value, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)

  return normalized || 'custom-api'
}

function formatHeaders(headers = []) {
  return headers
    .filter(header => isRecord(header) && header.name)
    .map(header => `${header.name}: ${header.valueTemplate || ''}`.trim())
    .join('\n')
}

function formatBodyTemplate(bodyTemplate) {
  if (bodyTemplate === null) {
    return ''
  }

  try {
    return JSON.stringify(bodyTemplate, null, 2)
  } catch (_error) {
    return ''
  }
}

export function createCustomProviderForm(provider = null, secrets = {}) {
  const normalized = provider && normalizeProviderDefinition(provider, {id: provider.id})
  const auth = normalized?.auth || {}
  const mode = CUSTOM_PROVIDER_AUTH_MODES.includes(auth.mode)
    ? auth.mode
    : PROVIDER_AUTH_MODES.API_KEY
  const secret = normalized ? getSecretValue(normalized, secrets) : ''

  return {
    id: normalized?.id || '',
    name: normalized?.name || '',
    url: normalized?.endpoint?.url || '',
    method: normalized?.endpoint?.method || 'POST',
    authMode: mode,
    authLocation: CUSTOM_PROVIDER_AUTH_LOCATIONS.includes(auth.location)
      ? auth.location
      : 'header',
    authHeaderName: auth.headerName || (mode === PROVIDER_AUTH_MODES.BEARER
      ? 'Authorization'
      : 'X-API-Key'),
    authPrefix: typeof auth.prefix === 'string' ? auth.prefix : '',
    headersText: formatHeaders(normalized?.request?.headers) || 'Content-Type: application/json',
    bodyTemplateText: formatBodyTemplate(normalized?.request?.bodyTemplate ?? {
      text: '{{text}}',
      targetLanguage: '{{targetLanguage}}'
    }),
    responsePath: normalized?.response?.textPath || 'text',
    apiKey: '',
    hasCredential: Boolean(secret),
    clearCredential: false
  }
}

function parseHeaders(value) {
  const lines = String(value ?? '').split(/\r?\n/)
  const headers = []
  const errors = []

  lines.forEach((line, index) => {
    const trimmed = line.trim()
    if (!trimmed) {
      return
    }

    const separator = trimmed.indexOf(':')
    if (separator <= 0) {
      errors.push({code: 'invalid-headers', line: index + 1})
      return
    }

    const name = trimmed.slice(0, separator).trim()
    const valueTemplate = trimmed.slice(separator + 1).trim()
    if (!HEADER_NAME_PATTERN.test(name) || !valueTemplate) {
      errors.push({code: 'invalid-headers', line: index + 1})
      return
    }

    headers.push({name, valueTemplate})
  })

  return {headers, errors}
}

function parseBodyTemplate(value) {
  const source = String(value ?? '').trim()
  if (!source) {
    return {value: null, error: null}
  }

  try {
    return {value: JSON.parse(source), error: null}
  } catch (_error) {
    return {value: null, error: {code: 'invalid-body'}}
  }
}

function validateEndpoint(value) {
  try {
    const url = new URL(String(value ?? '').trim())
    if (!HTTP_PROTOCOLS.has(url.protocol) || url.username || url.password) {
      return false
    }
    return Boolean(url.hostname)
  } catch (_error) {
    return false
  }
}

function formErrorsToResult(errors) {
  return {
    valid: false,
    errors,
    provider: null,
    credentialField: null,
    credentialValue: '',
    clearCredential: false
  }
}

export function validateCustomProviderForm(
  form,
  {existingIds = [], editingId = ''} = {}
) {
  const source = isRecord(form) ? form : {}
  const name = normalizedString(source.name, '')
  const id = normalizedString(source.id, '') || providerIdFromName(name)
  const errors = []

  if (!name) {
    errors.push({code: 'required-name'})
  }

  if (!PROVIDER_ID_PATTERN.test(id)) {
    errors.push({code: 'invalid-id'})
  }

  if (existingIds.includes(id) && id !== editingId) {
    errors.push({code: 'duplicate-id'})
  }

  if (PROVIDER_PRESETS[id] && id !== editingId) {
    errors.push({code: 'reserved-id'})
  }

  if (!validateEndpoint(source.url)) {
    errors.push({code: 'invalid-url'})
  }

  const method = normalizedString(source.method, '').toUpperCase()
  if (!CUSTOM_PROVIDER_METHODS.includes(method)) {
    errors.push({code: 'invalid-method'})
  }

  const parsedHeaders = parseHeaders(source.headersText)
  if (parsedHeaders.errors.length) {
    errors.push({code: 'invalid-headers'})
  }

  const parsedBody = parseBodyTemplate(source.bodyTemplateText)
  if (parsedBody.error) {
    errors.push(parsedBody.error)
  }

  const authMode = CUSTOM_PROVIDER_AUTH_MODES.includes(source.authMode)
    ? source.authMode
    : ''
  const authLocation = CUSTOM_PROVIDER_AUTH_LOCATIONS.includes(source.authLocation)
    ? source.authLocation
    : ''
  if (!authMode) {
    errors.push({code: 'invalid-auth-mode'})
  }
  if (authMode !== PROVIDER_AUTH_MODES.NONE && !authLocation) {
    errors.push({code: 'invalid-auth-location'})
  }

  const authHeaderName = normalizedString(source.authHeaderName, '')
  if (authMode !== PROVIDER_AUTH_MODES.NONE &&
      (!authHeaderName || !HEADER_NAME_PATTERN.test(authHeaderName))) {
    errors.push({code: 'invalid-auth-header'})
  }

  const responsePath = normalizedString(source.responsePath, '')
  if (!responsePath) {
    errors.push({code: 'required-response-path'})
  }

  if (errors.length) {
    return formErrorsToResult(errors)
  }

  const credentialField = secretFieldForAuth(authMode)
  const secretRef = authMode === PROVIDER_AUTH_MODES.NONE
    ? null
    : `providers.${id}.${credentialField}`
  const provider = normalizeProviderDefinition({
    id,
    name,
    kind: 'custom',
    source: 'custom',
    endpoint: {url: String(source.url).trim(), method},
    auth: authMode === PROVIDER_AUTH_MODES.NONE
      ? {mode: PROVIDER_AUTH_MODES.NONE}
      : {
        mode: authMode,
        location: authLocation,
        headerName: authHeaderName,
        prefix: typeof source.authPrefix === 'string' ? source.authPrefix : '',
        secretRef
      },
    request: {
      headers: parsedHeaders.headers,
      bodyTemplate: parsedBody.value
    },
    response: {textPath: responsePath}
  })

  if (!provider) {
    return formErrorsToResult([{code: 'invalid-provider'}])
  }

  return {
    valid: true,
    errors: [],
    provider,
    credentialField,
    credentialValue: normalizedString(source.apiKey, ''),
    clearCredential: Boolean(source.clearCredential)
  }
}

export function getProviderCredential(provider, secrets = {}) {
  return getSecretValue(provider, secrets)
}

export function cloneProvider(value) {
  return cloneValue(value)
}
