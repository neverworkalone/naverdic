/**
 * Content-page runtime for Chrome's built-in Translator API.
 *
 * Translator is deliberately resolved from the supplied document-like scope
 * and never from a worker. The runtime owns one Translator instance per
 * document, which keeps model creation out of every individual translation
 * request and makes its lifecycle explicit for both the options page and the
 * content script.
 */

export const CHROME_TRANSLATOR_LANGUAGE_PAIR = Object.freeze({
  sourceLanguage: 'en',
  targetLanguage: 'ko'
})

export const CHROME_TRANSLATOR_AVAILABILITY = Object.freeze([
  'unavailable',
  'downloadable',
  'downloading',
  'available'
])

export const CHROME_TRANSLATOR_PHASES = Object.freeze({
  CHECKING: 'checking',
  UNSUPPORTED: 'unsupported',
  UNAVAILABLE: 'unavailable',
  DOWNLOADABLE: 'downloadable',
  DOWNLOADING: 'downloading',
  AVAILABLE: 'available',
  FAILED: 'failed'
})

export const CHROME_TRANSLATOR_ERROR_CODES = Object.freeze({
  UNSUPPORTED: 'TRANSLATOR_UNSUPPORTED',
  UNAVAILABLE: 'TRANSLATOR_UNAVAILABLE',
  MODEL_NOT_READY: 'TRANSLATOR_MODEL_NOT_READY',
  USER_ACTIVATION_REQUIRED: 'TRANSLATOR_USER_ACTIVATION_REQUIRED',
  NETWORK: 'TRANSLATOR_NETWORK_ERROR',
  NOT_ALLOWED: 'TRANSLATOR_NOT_ALLOWED',
  NOT_SUPPORTED: 'TRANSLATOR_NOT_SUPPORTED',
  OPERATION: 'TRANSLATOR_OPERATION_ERROR',
  INVALID_RESPONSE: 'TRANSLATOR_INVALID_RESPONSE',
  DOWNLOAD_FAILED: 'TRANSLATOR_DOWNLOAD_FAILED',
  TRANSLATE_FAILED: 'TRANSLATOR_TRANSLATE_FAILED',
  UNKNOWN: 'TRANSLATOR_UNKNOWN_ERROR'
})

function clampProgress(value) {
  const number = Number(value)
  if (!Number.isFinite(number)) {
    return null
  }

  const normalized = number > 1 ? number / 100 : number
  return Math.max(0, Math.min(1, normalized))
}

function getScope(scope) {
  if (scope !== undefined && scope !== null) {
    return scope.self && typeof scope.self === 'object'
      ? scope.self
      : scope
  }

  return typeof self !== 'undefined' ? self : globalThis
}

function resolveTranslatorApi(scope, translatorApi) {
  if (translatorApi !== undefined) {
    return translatorApi
  }

  const documentScope = getScope(scope)
  return documentScope && 'Translator' in documentScope
    ? documentScope.Translator
    : null
}

function errorMessage(error, fallback) {
  return typeof error?.message === 'string' && error.message.trim()
    ? error.message.trim()
    : fallback
}

function errorCodeFor(error, operation) {
  switch (error?.name) {
    case 'NetworkError':
      return CHROME_TRANSLATOR_ERROR_CODES.NETWORK
    case 'NotAllowedError':
      return CHROME_TRANSLATOR_ERROR_CODES.NOT_ALLOWED
    case 'NotSupportedError':
      return CHROME_TRANSLATOR_ERROR_CODES.NOT_SUPPORTED
    case 'OperationError':
      return CHROME_TRANSLATOR_ERROR_CODES.OPERATION
    default:
      return operation === 'download'
        ? CHROME_TRANSLATOR_ERROR_CODES.DOWNLOAD_FAILED
        : operation === 'translate'
          ? CHROME_TRANSLATOR_ERROR_CODES.TRANSLATE_FAILED
          : CHROME_TRANSLATOR_ERROR_CODES.UNKNOWN
  }
}

export class ChromeTranslatorError extends Error {
  constructor(code, message, {cause, name: errorName} = {}) {
    super(message)
    this.name = 'ChromeTranslatorError'
    this.code = code
    this.errorName = errorName || cause?.name || ''
    if (cause !== undefined) {
      this.cause = cause
    }
  }
}

export function normalizeChromeTranslatorError(error, operation = 'translate') {
  if (error instanceof ChromeTranslatorError) {
    return error
  }

  const code = errorCodeFor(error, operation)
  const fallback = operation === 'download'
    ? 'The Chrome Translator model could not be downloaded.'
    : 'The Chrome Translator request could not be completed.'
  return new ChromeTranslatorError(code, errorMessage(error, fallback), {
    cause: error,
    name: error?.name
  })
}

function initialState(api) {
  return {
    supported: Boolean(api),
    availability: null,
    phase: api ? CHROME_TRANSLATOR_PHASES.CHECKING : CHROME_TRANSLATOR_PHASES.UNSUPPORTED,
    progress: null,
    indeterminate: false,
    errorCode: null,
    errorName: '',
    errorMessage: ''
  }
}

function publicState(state) {
  return Object.freeze({
    ...state,
    status: state.availability
  })
}

function availabilityPhase(availability) {
  switch (availability) {
    case 'unavailable':
      return CHROME_TRANSLATOR_PHASES.UNAVAILABLE
    case 'downloadable':
      return CHROME_TRANSLATOR_PHASES.DOWNLOADABLE
    case 'downloading':
      return CHROME_TRANSLATOR_PHASES.DOWNLOADING
    case 'available':
      return CHROME_TRANSLATOR_PHASES.AVAILABLE
    default:
      return CHROME_TRANSLATOR_PHASES.UNAVAILABLE
  }
}

function availabilityError(message, code = CHROME_TRANSLATOR_ERROR_CODES.UNAVAILABLE) {
  return new ChromeTranslatorError(code, message)
}

/**
 * Create one Translator API lifecycle for one document.
 *
 * `download()` intentionally calls Translator.create() before awaiting
 * anything. Call it directly from a user click handler so Chrome's user
 * activation requirement remains intact.
 */
export function createChromeTranslatorRuntime({
  scope,
  translatorApi,
  onStateChange
} = {}) {
  const api = resolveTranslatorApi(scope, translatorApi)
  let state = initialState(api)
  let translator = null
  let availabilityPromise = null
  let createPromise = null
  let destroyed = false
  const listeners = new Set()

  if (typeof onStateChange === 'function') {
    listeners.add(onStateChange)
  }

  function currentState() {
    return publicState(state)
  }

  function emit() {
    const nextState = currentState()
    listeners.forEach(listener => {
      try {
        listener(nextState)
      } catch (_error) {
        // A UI subscriber must not break the Translator lifecycle.
      }
    })
    return nextState
  }

  function updateState(patch) {
    state = {...state, ...patch}
    return emit()
  }

  function ensureActive() {
    if (destroyed) {
      throw new ChromeTranslatorError(
        CHROME_TRANSLATOR_ERROR_CODES.UNKNOWN,
        'The Chrome Translator runtime has been destroyed.'
      )
    }
  }

  function ensureApi({requireAvailability = false} = {}) {
    ensureActive()
    if (!api || typeof api.create !== 'function' ||
        (requireAvailability && typeof api.availability !== 'function')) {
      updateState({
        supported: false,
        phase: CHROME_TRANSLATOR_PHASES.UNSUPPORTED,
        errorCode: CHROME_TRANSLATOR_ERROR_CODES.UNSUPPORTED,
        errorName: 'NotSupportedError',
        errorMessage: 'The Translator API is not supported in this document.'
      })
      throw new ChromeTranslatorError(
        CHROME_TRANSLATOR_ERROR_CODES.UNSUPPORTED,
        'The Translator API is not supported in this document.'
      )
    }
    return api
  }

  function setDownloadProgress(loaded) {
    const progress = clampProgress(loaded)
    if (progress === null) {
      updateState({
        phase: CHROME_TRANSLATOR_PHASES.DOWNLOADING,
        availability: 'downloading',
        progress: null,
        indeterminate: true,
        errorCode: null,
        errorName: '',
        errorMessage: ''
      })
      return
    }

    updateState({
      phase: CHROME_TRANSLATOR_PHASES.DOWNLOADING,
      availability: 'downloading',
      progress,
      indeterminate: false,
      errorCode: null,
      errorName: '',
      errorMessage: ''
    })
  }

  function attachDownloadMonitor(monitor) {
    if (!monitor || typeof monitor.addEventListener !== 'function') {
      updateState({
        phase: CHROME_TRANSLATOR_PHASES.DOWNLOADING,
        availability: 'downloading',
        progress: null,
        indeterminate: true
      })
      return
    }

    monitor.addEventListener('downloadprogress', event => {
      setDownloadProgress(event?.loaded)
    })
  }

  function createTranslator({monitor = false, operation = 'download'} = {}) {
    ensureApi()

    if (translator) {
      return Promise.resolve(translator)
    }
    if (createPromise) {
      return createPromise
    }

    const options = {
      ...CHROME_TRANSLATOR_LANGUAGE_PAIR
    }
    if (monitor) {
      options.monitor = attachDownloadMonitor
    }

    updateState({
      phase: CHROME_TRANSLATOR_PHASES.DOWNLOADING,
      availability: 'downloading',
      progress: monitor ? null : state.progress,
      indeterminate: monitor,
      errorCode: null,
      errorName: '',
      errorMessage: ''
    })

    let result
    try {
      // Do not add an await before this call. Chrome checks user activation at
      // Translator.create() time when a model download is required.
      result = api.create(options)
    } catch (error) {
      result = Promise.reject(error)
    }

    createPromise = Promise.resolve(result)
      .then(createdTranslator => {
        if (!createdTranslator || typeof createdTranslator.translate !== 'function') {
          throw new ChromeTranslatorError(
            CHROME_TRANSLATOR_ERROR_CODES.INVALID_RESPONSE,
            'Translator.create() did not return a usable translator.'
          )
        }

        if (destroyed) {
          return Promise.resolve(createdTranslator.destroy?.()).then(() => {
            throw new ChromeTranslatorError(
              CHROME_TRANSLATOR_ERROR_CODES.UNKNOWN,
              'The Chrome Translator runtime has been destroyed.'
            )
          })
        }

        translator = createdTranslator
        updateState({
          phase: CHROME_TRANSLATOR_PHASES.AVAILABLE,
          availability: 'available',
          progress: 1,
          indeterminate: false,
          errorCode: null,
          errorName: '',
          errorMessage: ''
        })
        return translator
      })
      .catch(error => {
        const normalized = normalizeChromeTranslatorError(error, operation)
        updateState({
          phase: CHROME_TRANSLATOR_PHASES.FAILED,
          availability: operation === 'download' ? 'downloadable' : state.availability,
          progress: null,
          indeterminate: false,
          errorCode: normalized.code,
          errorName: normalized.errorName,
          errorMessage: normalized.message
        })
        throw normalized
      })
      .finally(() => {
        createPromise = null
      })

    return createPromise
  }

  async function refreshAvailability() {
    ensureActive()
    if (!api || typeof api.availability !== 'function') {
      ensureApi({requireAvailability: true})
    }
    if (availabilityPromise) {
      return availabilityPromise
    }

    availabilityPromise = Promise.resolve()
      .then(() => api.availability({...CHROME_TRANSLATOR_LANGUAGE_PAIR}))
      .then(availability => {
        if (!CHROME_TRANSLATOR_AVAILABILITY.includes(availability)) {
          throw availabilityError(
            'The Translator API returned an unknown availability state.'
          )
        }

        if (createPromise || translator) {
          return currentState()
        }

        updateState({
          availability,
          phase: availabilityPhase(availability),
          progress: availability === 'available' ? 1 : null,
          indeterminate: availability === 'downloading',
          errorCode: null,
          errorName: '',
          errorMessage: ''
        })
        return currentState()
      })
      .catch(error => {
        const normalized = normalizeChromeTranslatorError(error, 'availability')
        updateState({
          phase: CHROME_TRANSLATOR_PHASES.UNAVAILABLE,
          availability: 'unavailable',
          progress: null,
          indeterminate: false,
          errorCode: normalized.code,
          errorName: normalized.errorName,
          errorMessage: normalized.message
        })
        throw normalized
      })
      .finally(() => {
        availabilityPromise = null
      })

    return availabilityPromise
  }

  function download() {
    ensureApi()
    if (translator) {
      return Promise.resolve(translator)
    }
    if (state.availability === 'unavailable') {
      return Promise.reject(availabilityError(
        'The English to Korean Translator model is unavailable.'
      ))
    }
    if (state.availability === 'downloading' && !createPromise) {
      return Promise.reject(new ChromeTranslatorError(
        CHROME_TRANSLATOR_ERROR_CODES.MODEL_NOT_READY,
        'The English to Korean Translator model is already downloading.'
      ))
    }
    // This is intentionally not async and does not await availability(). The
    // caller must invoke it from the click handler that starts the download.
    return createTranslator({monitor: true, operation: 'download'})
  }

  async function getTranslatorForTranslation() {
    ensureApi()
    if (translator) {
      return translator
    }

    if (!state.availability) {
      await refreshAvailability()
    }

    if (state.availability === 'unavailable') {
      throw new ChromeTranslatorError(
        CHROME_TRANSLATOR_ERROR_CODES.UNAVAILABLE,
        'The English to Korean Translator model is unavailable.'
      )
    }
    if (state.availability === 'downloadable' ||
        state.availability === 'downloading' ||
        state.phase === CHROME_TRANSLATOR_PHASES.FAILED) {
      throw new ChromeTranslatorError(
        CHROME_TRANSLATOR_ERROR_CODES.MODEL_NOT_READY,
        'The English to Korean Translator model is not ready.'
      )
    }

    return createTranslator({monitor: false, operation: 'translate'})
  }

  async function translate(text) {
    const value = typeof text === 'string' ? text.trim() : ''
    if (!value) {
      throw new ChromeTranslatorError(
        CHROME_TRANSLATOR_ERROR_CODES.INVALID_RESPONSE,
        'The translation text is empty.'
      )
    }

    const currentTranslator = await getTranslatorForTranslation()
    try {
      const result = await currentTranslator.translate(value)
      if (typeof result !== 'string' || !result.trim()) {
        throw new ChromeTranslatorError(
          CHROME_TRANSLATOR_ERROR_CODES.INVALID_RESPONSE,
          'Translator.translate() did not return translated text.'
        )
      }
      return result
    } catch (error) {
      throw normalizeChromeTranslatorError(error, 'translate')
    }
  }

  async function destroy() {
    destroyed = true
    listeners.clear()
    availabilityPromise = null
    createPromise = null
    const currentTranslator = translator
    translator = null
    if (typeof currentTranslator?.destroy === 'function') {
      await currentTranslator.destroy()
    }
  }

  return {
    getState: currentState,
    subscribe(listener) {
      if (typeof listener !== 'function') {
        return () => {}
      }
      listeners.add(listener)
      listener(currentState())
      return () => listeners.delete(listener)
    },
    refreshAvailability,
    download,
    translate,
    destroy,
    getTranslator() {
      return translator
    }
  }
}

export const createChromeTranslator = createChromeTranslatorRuntime
