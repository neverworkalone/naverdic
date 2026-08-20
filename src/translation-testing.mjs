import {
  executeProviderTranslation,
  PROVIDER_ERROR_CODES
} from './translation-engine.mjs'
import {
  PROVIDER_KINDS,
  PROVIDER_SOURCES
} from './translation-provider.mjs'
import {
  getProviderOriginPattern,
  hasProviderOriginPermission,
  requestProviderOriginPermission
} from './provider-permissions.mjs'

export async function hasTranslationProviderPermission(
  provider,
  permissionApi = globalThis.chrome?.permissions
) {
  if (provider?.source !== PROVIDER_SOURCES.CUSTOM) {
    return true
  }

  const pattern = getProviderOriginPattern(provider.endpoint?.url)
  if (!pattern) {
    return false
  }

  return hasProviderOriginPermission(permissionApi, provider.endpoint.url)
}

export async function requestTranslationProviderPermission(
  provider,
  permissionApi = globalThis.chrome?.permissions
) {
  if (provider?.source !== PROVIDER_SOURCES.CUSTOM) {
    return true
  }

  const pattern = getProviderOriginPattern(provider.endpoint?.url)
  if (!pattern) {
    return false
  }

  if (typeof permissionApi?.contains === 'function' &&
      await hasProviderOriginPermission(permissionApi, provider.endpoint.url)) {
    return true
  }

  return requestProviderOriginPermission(permissionApi, provider.endpoint?.url)
}

export async function testTranslationProvider(provider, {
  secrets = {},
  targetLanguage = 'ko',
  permissionApi = globalThis.chrome?.permissions,
  fetchFn = globalThis.fetch,
  timeoutMs
} = {}) {
  if (provider?.kind === PROVIDER_KINDS.BUILT_IN) {
    const error = new Error('This provider does not support background connection tests.')
    error.code = PROVIDER_ERROR_CODES.UNSUPPORTED_CONTEXT
    throw error
  }

  const allowedOrigins = []
  if (provider?.source === PROVIDER_SOURCES.CUSTOM) {
    const pattern = getProviderOriginPattern(provider.endpoint?.url)
    const granted = await requestTranslationProviderPermission(provider, permissionApi)
    if (!pattern || !granted) {
      const error = new Error('Permission for the translation provider domain is required.')
      error.code = PROVIDER_ERROR_CODES.PERMISSION_REQUIRED
      throw error
    }
    allowedOrigins.push(pattern)
  }

  return executeProviderTranslation(provider, {
    text: ['NaverDic connection test'],
    targetLanguage,
    secrets,
    allowedOrigins,
    fetchFn,
    timeoutMs
  })
}
