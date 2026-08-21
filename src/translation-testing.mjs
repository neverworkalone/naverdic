import {
  executeProviderTranslation,
  PROVIDER_ERROR_CODES
} from './translation-engine.mjs'
import {
  PROVIDER_KINDS,
  PROVIDER_PRESETS
} from './translation-provider.mjs'

export async function testTranslationProvider(provider, {
  secrets = {},
  targetLanguage = 'ko',
  fetchFn = globalThis.fetch,
  timeoutMs
} = {}) {
  if (!provider || !PROVIDER_PRESETS[provider.id]) {
    const error = new Error('Unknown translation provider.')
    error.code = PROVIDER_ERROR_CODES.INVALID_PROVIDER
    throw error
  }

  if (provider?.kind === PROVIDER_KINDS.BUILT_IN) {
    const error = new Error('This provider does not support background connection tests.')
    error.code = PROVIDER_ERROR_CODES.UNSUPPORTED_CONTEXT
    throw error
  }

  return executeProviderTranslation(provider, {
    text: ['NaverDic connection test'],
    targetLanguage,
    secrets,
    fetchFn,
    timeoutMs
  })
}
