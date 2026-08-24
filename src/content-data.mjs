import {buildNaverApiUrl, parseNaverDictionaryResponse} from './dictionary/parser.mjs'
import {
  MESSAGE_ERROR_CODES,
  createDictionaryRequest as createDictionaryMessage,
  createErrorResponse,
  createTranslationRequest as createTranslationMessage,
  sendRuntimeMessage
} from './messaging.mjs'
import {executeProviderTranslation, getPathValue} from './translation-engine.mjs'
import {
  CHROME_TRANSLATOR_PROVIDER_ID,
  getProviderPreset,
  PROVIDER_KINDS
} from './translation-provider.mjs'
import {createAbortError} from './content-request.mjs'

function throwIfAborted(signal) {
  if (signal?.aborted) {
    throw createAbortError()
  }
}

/**
 * Chrome's runtime messaging API cannot cancel an already-dispatched message.
 * Race it against the request signal so a closed/replaced popup stops waiting
 * immediately while the coordinator's revision guard ignores the late result.
 */
export function awaitWithAbort(value, signal) {
  throwIfAborted(signal)

  if (!signal || typeof signal.addEventListener !== 'function') {
    return Promise.resolve(value)
  }

  return new Promise((resolve, reject) => {
    let settled = false
    let abortListener = null

    const cleanup = () => {
      if (abortListener) {
        signal.removeEventListener?.('abort', abortListener)
      }
    }

    const complete = callback => result => {
      if (settled) {
        return
      }

      settled = true
      cleanup()
      callback(result)
    }

    const onAbort = complete(reject)
    abortListener = () => onAbort(createAbortError())
    signal.addEventListener('abort', abortListener, {once: true})

    Promise.resolve(value).then(
      complete(resolve),
      complete(reject)
    )
  })
}

function createInlineRequestError(scope, {
  code = MESSAGE_ERROR_CODES.RUNTIME_ERROR,
  message = 'The popup request failed.',
  response,
  cause
} = {}) {
  const error = new Error(message)
  error.name = 'InlinePopupRequestError'
  error.code = code
  error.scope = scope
  error.response = response || createErrorResponse(code, message)
  if (cause) {
    error.cause = cause
  }
  return error
}

function responseError(scope, response) {
  return createInlineRequestError(scope, {
    code: response?.error?.code || MESSAGE_ERROR_CODES.RUNTIME_ERROR,
    message: response?.error?.message || 'The popup request failed.',
    response
  })
}

function normalizeTranslationConfig(value) {
  if (value && typeof value === 'object' && value.provider) {
    return {
      provider: value.provider,
      credential: typeof value.credential === 'string' ? value.credential : '',
      targetLanguage: typeof value.targetLanguage === 'string'
        ? value.targetLanguage
        : 'ko'
    }
  }

  return {
    provider: getProviderPreset('deepl-free'),
    credential: typeof value === 'string' ? value : '',
    targetLanguage: 'ko'
  }
}

function providerError(scope, error) {
  if (error?.name === 'InlinePopupRequestError') {
    return error
  }

  return createInlineRequestError(scope, {
    code: error?.code || MESSAGE_ERROR_CODES.RUNTIME_ERROR,
    message: error?.message || 'The popup request failed.',
    cause: error
  })
}

/**
 * Keep dictionary/translation transport and response normalization out of the
 * content interaction and popup rendering code.
 */
export function createInlinePopupDataClient({
  runtime,
  getChromeTranslatorRuntime,
  sendMessage = sendRuntimeMessage
} = {}) {
  async function lookupDictionary(query, {signal} = {}) {
    throwIfAborted(signal)

    const response = await awaitWithAbort(
      sendMessage(
        runtime,
        createDictionaryMessage({
          method: 'GET',
          url: buildNaverApiUrl(query)
        })
      ),
      signal
    )

    if (!response?.ok) {
      throw responseError('dictionary lookup', response)
    }

    return parseNaverDictionaryResponse(response.data)
  }

  async function translate(text, value, {signal} = {}) {
    throwIfAborted(signal)

    const config = normalizeTranslationConfig(value)
    const provider = config.provider || getProviderPreset('deepl-free')

    if (
      provider.kind === PROVIDER_KINDS.BUILT_IN &&
      provider.id === CHROME_TRANSLATOR_PROVIDER_ID
    ) {
      try {
        const result = await awaitWithAbort(
          executeProviderTranslation(provider, {
            text: [text],
            targetLanguage: 'ko',
            translatorRuntime: getChromeTranslatorRuntime?.()
          }),
          signal
        )
        return typeof result?.text === 'string' ? result.text : ''
      } catch (error) {
        throw providerError('translation', error)
      }
    }

    const response = await awaitWithAbort(
      sendMessage(
        runtime,
        createTranslationMessage({
          provider,
          key: config.credential,
          data: {
            text: [text],
            targetLanguage: config.targetLanguage
          }
        })
      ),
      signal
    )

    if (!response?.ok) {
      throw responseError('translation', response)
    }

    const translatedText = getPathValue(response.data, provider.response?.textPath)
    if (typeof translatedText !== 'string') {
      throw createInlineRequestError('translation', {
        code: MESSAGE_ERROR_CODES.INVALID_RESPONSE,
        message: 'The translation response did not include translated text.',
        response: createErrorResponse(
          MESSAGE_ERROR_CODES.INVALID_RESPONSE,
          'The translation response did not include translated text.'
        )
      })
    }

    return translatedText
  }

  return {
    lookupDictionary,
    translate
  }
}

export {normalizeTranslationConfig}
