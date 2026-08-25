import {
  CHROME_TRANSLATOR_PROVIDER_ID,
  PROVIDER_ADAPTERS,
  PROVIDER_AUTH_MODES,
  PROVIDER_EXECUTION_CONTEXTS,
  PROVIDER_KINDS,
  getProviderPreset,
  isProviderDefinition,
  normalizeProviderDefinition
} from './translation-provider.mjs'

export const PROVIDER_ERROR_CODES = Object.freeze({
  INVALID_PROVIDER: 'INVALID_PROVIDER',
  INVALID_ENDPOINT: 'INVALID_ENDPOINT',
  AUTH_REQUIRED: 'AUTH_REQUIRED',
  UNSUPPORTED_CONTEXT: 'UNSUPPORTED_CONTEXT',
  HTTP_ERROR: 'HTTP_ERROR',
  INVALID_RESPONSE: 'INVALID_RESPONSE',
  NETWORK_ERROR: 'NETWORK_ERROR',
  TIMEOUT: 'TIMEOUT'
})

const TRANSLATOR_ERROR_CODE_PATTERN = /^TRANSLATOR_[A-Z0-9_]+$/

const TEMPLATE_PATTERN = /\{\{([a-zA-Z][a-zA-Z0-9_.-]*)\}\}/g
const PATH_PATTERN = /(?:^|\.)([^.[\]]+)|\[(\d+)\]/g
const DEFAULT_TIMEOUT_MS = 10000

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function providerError(code, message, details = {}) {
  const error = new Error(message)
  error.name = 'ProviderError'
  error.code = code
  Object.entries(details).forEach(([key, value]) => {
    if (value !== undefined) {
      error[key] = value
    }
  })
  return error
}

function providerDefinition(value) {
  const normalized = normalizeProviderDefinition(value, {
    id: value?.id || '',
    model: value?.model || ''
  })
  return normalized && isProviderDefinition(normalized) ? normalized : null
}

function pathTokens(path) {
  const tokens = []
  String(path ?? '').replace(PATH_PATTERN, (_match, property, index) => {
    tokens.push(index === undefined ? property : Number(index))
    return _match
  })
  return tokens
}

export function getPathValue(value, path) {
  if (!path) {
    return value
  }

  return pathTokens(path).reduce((current, token) => current?.[token], value)
}

function setHeader(headers, name, value) {
  const existing = Object.keys(headers).find(key => key.toLowerCase() === name.toLowerCase())
  headers[existing || name] = value
}

function getSecretValue(secretRef, secrets) {
  const value = getPathValue(secrets, secretRef)
  return typeof value === 'string' ? value.trim() : ''
}

function collectSecretValues(value, output = []) {
  if (Array.isArray(value)) {
    value.forEach(child => collectSecretValues(child, output))
    return output
  }

  if (!isRecord(value)) {
    return output
  }

  Object.entries(value).forEach(([key, child]) => {
    const normalizedKey = key.toLowerCase().replace(/[^a-z]/g, '')
    if (['apikey', 'token', 'authorization', 'secret', 'password'].includes(normalizedKey) &&
        typeof child === 'string' && child.trim()) {
      output.push(child.trim())
    }
    collectSecretValues(child, output)
  })
  return output
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function redactSecrets(value, secrets = {}, extraSecrets = []) {
  let result = String(value ?? '')
  const secretsToRedact = [
    ...collectSecretValues(secrets),
    ...(Array.isArray(extraSecrets) ? extraSecrets : [extraSecrets])
  ]
    .filter(secret => typeof secret === 'string' && secret.length >= 4)
    .sort((left, right) => right.length - left.length)

  secretsToRedact.forEach(secret => {
    result = result.replace(new RegExp(escapeRegExp(secret), 'g'), '[REDACTED]')
  })

  return result
}

function templateValue(value, variables) {
  if (Array.isArray(value)) {
    return value.map(child => templateValue(child, variables))
  }

  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [
      key,
      templateValue(child, variables)
    ]))
  }

  if (typeof value !== 'string') {
    return value
  }

  const exact = /^\{\{([a-zA-Z][a-zA-Z0-9_.-]*)\}\}$/.exec(value)
  if (exact) {
    return variables[exact[1]] ?? ''
  }

  return value.replace(TEMPLATE_PATTERN, (_match, name) => {
    const replacement = variables[name]
    return replacement === undefined || replacement === null
      ? ''
      : String(replacement)
  })
}

function normalizeTextInput(value) {
  const values = Array.isArray(value) ? value : [value]
  return values
    .filter(item => typeof item === 'string')
    .map(item => item.trim())
    .filter(Boolean)
}

function defaultAuthHeader(mode) {
  if (mode === PROVIDER_AUTH_MODES.API_KEY) {
    return 'X-API-Key'
  }

  return 'Authorization'
}

function resolveProviderSecret(provider, secrets) {
  if (provider.auth.mode === PROVIDER_AUTH_MODES.NONE) {
    return ''
  }

  const secret = getSecretValue(provider.auth.secretRef, secrets)
  if (!secret) {
    throw providerError(
      PROVIDER_ERROR_CODES.AUTH_REQUIRED,
      'The translation provider credential is required.'
    )
  }
  return secret
}

export function createProviderRequest(providerInput, {
  text,
  targetLanguage,
  sourceLanguage = '',
  secrets = {}
} = {}) {
  const provider = providerDefinition(providerInput)
  if (!provider) {
    throw providerError(
      PROVIDER_ERROR_CODES.INVALID_PROVIDER,
      'The translation provider configuration is invalid.'
    )
  }

  if (provider.kind === PROVIDER_KINDS.BUILT_IN) {
    throw providerError(
      PROVIDER_ERROR_CODES.UNSUPPORTED_CONTEXT,
      'This translation provider must run in the content page.',
      {context: PROVIDER_EXECUTION_CONTEXTS.CONTENT_PAGE}
    )
  }

  const textValues = normalizeTextInput(text)
  if (!textValues.length || typeof targetLanguage !== 'string' || !targetLanguage.trim()) {
    throw providerError(
      PROVIDER_ERROR_CODES.INVALID_PROVIDER,
      'The translation input is incomplete.'
    )
  }

  const authSecret = resolveProviderSecret(provider, secrets)
  const variables = {
    text: textValues.length === 1 ? textValues[0] : textValues.join('\n'),
    texts: textValues,
    targetLanguage: targetLanguage.trim(),
    sourceLanguage: typeof sourceLanguage === 'string' ? sourceLanguage.trim() : '',
    secret: authSecret,
    apiKey: authSecret,
    token: authSecret
  }
  const url = new URL(provider.endpoint.url)
  const headers = {}

  provider.request.headers.forEach(header => {
    const headerSecret = getSecretValue(header.secretRef, secrets)
    if (header.secretRef && !headerSecret) {
      throw providerError(
        PROVIDER_ERROR_CODES.AUTH_REQUIRED,
        'The translation provider credential is required.'
      )
    }

    const rendered = templateValue(header.valueTemplate, {
      ...variables,
      secret: headerSecret || authSecret,
      apiKey: headerSecret || authSecret,
      token: headerSecret || authSecret
    })
    if (typeof rendered === 'string' && rendered) {
      setHeader(headers, header.name, rendered)
    }
  })

  if (provider.auth.mode !== PROVIDER_AUTH_MODES.NONE) {
    const authValue = `${provider.auth.prefix}${authSecret}`
    if (provider.auth.location === 'query') {
      url.searchParams.set(provider.auth.headerName || 'key', authValue)
    } else {
      setHeader(
        headers,
        provider.auth.headerName || defaultAuthHeader(provider.auth.mode),
        authValue
      )
    }
  }

  const options = {
    method: provider.endpoint.method,
    headers
  }
  if (provider.endpoint.method !== 'GET' && provider.endpoint.method !== 'HEAD' &&
      provider.request.bodyTemplate !== null) {
    options.body = JSON.stringify(templateValue(provider.request.bodyTemplate, variables))
    if (!Object.keys(headers).some(name => name.toLowerCase() === 'content-type')) {
      setHeader(headers, 'Content-Type', 'application/json')
    }
  }

  return {
    url: url.toString(),
    options
  }
}

export const buildProviderRequest = createProviderRequest

export function normalizeProviderResponse(providerInput, payload) {
  const provider = providerDefinition(providerInput)
  const translatedText = provider
    ? getPathValue(payload, provider.response.textPath)
    : null

  if (!provider || typeof translatedText !== 'string' || !translatedText.trim()) {
    throw providerError(
      PROVIDER_ERROR_CODES.INVALID_RESPONSE,
      'The translation provider response did not include translated text.'
    )
  }

  return {
    providerId: provider.id,
    text: translatedText,
    raw: payload
  }
}

function validatePresetEndpoint(provider) {
  const preset = getProviderPreset(provider.presetId, {model: provider.model})
  if (!preset || preset.endpoint?.url !== provider.endpoint?.url) {
    throw providerError(
      PROVIDER_ERROR_CODES.INVALID_ENDPOINT,
      'The preset translation provider endpoint is invalid.'
    )
  }
  return true
}

function effectiveTimeout(timeoutMs) {
  const normalized = Number(timeoutMs)
  return Number.isFinite(normalized) && normalized > 0 ? normalized : DEFAULT_TIMEOUT_MS
}

async function fetchProviderResponse(fetchFn, request, timeoutMs) {
  if (typeof fetchFn !== 'function') {
    throw providerError(
      PROVIDER_ERROR_CODES.NETWORK_ERROR,
      'The translation provider request could not be completed.'
    )
  }

  const controller = typeof AbortController === 'function'
    ? new AbortController()
    : null
  const options = {...request.options}
  if (controller) {
    options.signal = controller.signal
  }

  let timeoutId = null
  let rejectTimeout
  const timeout = new Promise((_resolve, reject) => {
    rejectTimeout = reject
    timeoutId = setTimeout(() => {
      controller?.abort()
      rejectTimeout(providerError(
        PROVIDER_ERROR_CODES.TIMEOUT,
        'The translation provider request timed out.'
      ))
    }, effectiveTimeout(timeoutMs))
  })

  try {
    const response = await Promise.race([
      Promise.resolve().then(() => fetchFn(request.url, options)),
      timeout
    ])

    if (!response || typeof response.json !== 'function') {
      throw providerError(
        PROVIDER_ERROR_CODES.INVALID_RESPONSE,
        'The translation provider response was invalid.'
      )
    }

    if (response.ok === false || response.status >= 400) {
      throw providerError(
        PROVIDER_ERROR_CODES.HTTP_ERROR,
        'The translation provider request failed.',
        {status: Number.isFinite(response.status) ? response.status : undefined}
      )
    }

    let payload
    try {
      payload = await Promise.race([
        Promise.resolve().then(() => response.json()),
        timeout
      ])
    } catch (error) {
      if (error?.code === PROVIDER_ERROR_CODES.TIMEOUT) {
        throw error
      }
      throw providerError(
        PROVIDER_ERROR_CODES.INVALID_RESPONSE,
        'The translation provider response was not valid JSON.'
      )
    }

    return payload
  } catch (error) {
    if (error?.code) {
      throw error
    }

    if (error?.name === 'AbortError') {
      throw providerError(
        PROVIDER_ERROR_CODES.TIMEOUT,
        'The translation provider request timed out.'
      )
    }

    throw providerError(
      PROVIDER_ERROR_CODES.NETWORK_ERROR,
      'The translation provider request could not be completed.'
    )
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId)
    }
  }
}

const HTTP_ADAPTER = Object.freeze({
  id: PROVIDER_ADAPTERS.HTTP,
  buildRequest: createProviderRequest,
  normalizeResponse: normalizeProviderResponse
})

const DEEPL_ADAPTER = Object.freeze({
  ...HTTP_ADAPTER,
  id: PROVIDER_ADAPTERS.DEEPL
})

const GEMINI_ADAPTER = Object.freeze({
  ...HTTP_ADAPTER,
  id: PROVIDER_ADAPTERS.GEMINI
})

const CHROME_TRANSLATOR_ADAPTER = Object.freeze({
  id: PROVIDER_ADAPTERS.CHROME_TRANSLATOR,
  buildRequest() {
    throw providerError(
      PROVIDER_ERROR_CODES.UNSUPPORTED_CONTEXT,
      'This translation provider must run in the content page.',
      {context: PROVIDER_EXECUTION_CONTEXTS.CONTENT_PAGE}
    )
  },
  normalizeResponse: normalizeProviderResponse
})

export const TRANSLATION_ADAPTERS = Object.freeze({
  [PROVIDER_ADAPTERS.HTTP]: HTTP_ADAPTER,
  [PROVIDER_ADAPTERS.DEEPL]: DEEPL_ADAPTER,
  [PROVIDER_ADAPTERS.GEMINI]: GEMINI_ADAPTER,
  [PROVIDER_ADAPTERS.CHROME_TRANSLATOR]: CHROME_TRANSLATOR_ADAPTER
})

export function getTranslationAdapter(providerInput) {
  const provider = providerDefinition(providerInput)
  if (!provider) {
    return null
  }

  return TRANSLATION_ADAPTERS[provider.execution.adapterId] || (
    provider.kind === PROVIDER_KINDS.HTTP ? HTTP_ADAPTER : null
  )
}

export function normalizeProviderError(error, {secrets = {}, extraSecrets = []} = {}) {
  if (error?.name === 'ProviderError') {
    error.message = redactSecrets(error.message, secrets, extraSecrets)
    return error
  }

  if (TRANSLATOR_ERROR_CODE_PATTERN.test(String(error?.code || ''))) {
    return providerError(
      error.code,
      redactSecrets(
        error?.message || 'The Chrome Translator request could not be completed.',
        secrets,
        extraSecrets
      ),
      {errorName: error?.errorName || error?.name}
    )
  }

  const code = error?.name === 'AbortError'
    ? PROVIDER_ERROR_CODES.TIMEOUT
    : PROVIDER_ERROR_CODES.NETWORK_ERROR
  const fallback = code === PROVIDER_ERROR_CODES.TIMEOUT
    ? 'The translation provider request timed out.'
    : 'The translation provider request could not be completed.'
  const message = redactSecrets(error?.message || fallback, secrets, extraSecrets)
  return providerError(code, message || fallback)
}

/**
 * Run a built-in provider in the document/content-page that owns the
 * Translator API. This path intentionally has no permission or fetch step;
 * background callers must continue to receive UNSUPPORTED_CONTEXT.
 */
export async function executeContentProviderTranslation(providerInput, {
  text,
  targetLanguage = 'ko',
  sourceLanguage = '',
  translatorRuntime
} = {}) {
  const provider = providerDefinition(providerInput)
  if (!provider) {
    throw providerError(
      PROVIDER_ERROR_CODES.INVALID_PROVIDER,
      'The translation provider configuration is invalid.'
    )
  }

  if (provider.kind !== PROVIDER_KINDS.BUILT_IN ||
      provider.id !== CHROME_TRANSLATOR_PROVIDER_ID ||
      provider.execution.context !== PROVIDER_EXECUTION_CONTEXTS.CONTENT_PAGE) {
    throw providerError(
      PROVIDER_ERROR_CODES.UNSUPPORTED_CONTEXT,
      'This translation provider is not a content-page provider.',
      {context: PROVIDER_EXECUTION_CONTEXTS.CONTENT_PAGE}
    )
  }

  if (!translatorRuntime || typeof translatorRuntime.translate !== 'function') {
    throw providerError(
      PROVIDER_ERROR_CODES.UNSUPPORTED_CONTEXT,
      'The Chrome Translator provider must run in the content page.',
      {context: PROVIDER_EXECUTION_CONTEXTS.CONTENT_PAGE}
    )
  }

  const textValues = normalizeTextInput(text)
  const normalizedSourceLanguage = String(sourceLanguage || '').trim().toLowerCase()
  if (!textValues.length ||
      (normalizedSourceLanguage && normalizedSourceLanguage !== 'en') ||
      String(targetLanguage || '').trim().toLowerCase() !== 'ko') {
    throw providerError(
      PROVIDER_ERROR_CODES.INVALID_PROVIDER,
      'The Chrome Translator provider only supports English to Korean.'
    )
  }

  // Keep the fixed source/target pair explicit at this execution boundary.
  // `sourceLanguage` is accepted for the shared engine signature but cannot
  // override the Chrome provider contract.
  void sourceLanguage
  const translated = []
  for (const value of textValues) {
    translated.push(await translatorRuntime.translate(value))
  }

  if (translated.some(value => typeof value !== 'string' || !value.trim())) {
    throw providerError(
      PROVIDER_ERROR_CODES.INVALID_RESPONSE,
      'The Chrome Translator response did not include translated text.'
    )
  }

  return {
    providerId: provider.id,
    text: translated.join('\n'),
    raw: {
      translations: translated.map(value => ({text: value}))
    }
  }
}

export async function executeProviderTranslation(providerInput, {
  text,
  targetLanguage,
  sourceLanguage = '',
  secrets = {},
  fetchFn = globalThis.fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  translatorRuntime
} = {}) {
  const provider = providerDefinition(providerInput)
  if (!provider) {
    throw providerError(
      PROVIDER_ERROR_CODES.INVALID_PROVIDER,
      'The translation provider configuration is invalid.'
    )
  }

  const adapter = getTranslationAdapter(provider)
  if (!adapter) {
    throw providerError(
      PROVIDER_ERROR_CODES.INVALID_PROVIDER,
      'The translation provider adapter is unavailable.'
    )
  }

  try {
    if (provider.kind === PROVIDER_KINDS.BUILT_IN) {
      return await executeContentProviderTranslation(provider, {
        text,
        targetLanguage,
        sourceLanguage,
        translatorRuntime
      })
    }

    validatePresetEndpoint(provider)
    const request = adapter.buildRequest(provider, {
      text,
      targetLanguage,
      sourceLanguage,
      secrets
    })
    const payload = await fetchProviderResponse(fetchFn, request, timeoutMs)
    const normalized = adapter.normalizeResponse(provider, payload)
    return normalized
  } catch (error) {
    throw normalizeProviderError(error, {secrets})
  }
}

export function isBackgroundProvider(providerInput) {
  const provider = providerDefinition(providerInput)
  return Boolean(
    provider &&
    provider.kind === PROVIDER_KINDS.HTTP &&
    provider.execution.context === PROVIDER_EXECUTION_CONTEXTS.BACKGROUND &&
    provider.id !== CHROME_TRANSLATOR_PROVIDER_ID
  )
}
