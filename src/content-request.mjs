export const POPUP_REQUEST_STATUSES = Object.freeze({
  SUCCESS: 'success',
  EMPTY: 'empty',
  ERROR: 'error',
  STALE: 'stale',
  CANCELLED: 'cancelled'
})

export function createAbortError(reason = 'The popup request was cancelled.') {
  const error = new Error(reason)
  error.name = 'AbortError'
  error.code = 'ABORTED'
  return error
}

export function isAbortError(error) {
  return error?.name === 'AbortError' || error?.code === 'ABORTED'
}

function isEmpty(value) {
  if (Array.isArray(value)) {
    return value.length === 0
  }

  return typeof value !== 'string' || value.trim() === ''
}

/**
 * Run one popup request at a time. Abort is used where the underlying API
 * supports it; the request id remains the final guard for Chrome runtime and
 * Translator promises that cannot be cancelled after dispatch.
 */
export function createPopupRequestCoordinator() {
  let revision = 0
  let activeController = null

  function isCurrent(requestId) {
    return requestId === revision
  }

  function cancel(reason = 'The popup request was cancelled.') {
    revision += 1
    activeController?.abort(reason)
    activeController = null
  }

  async function run(task) {
    const requestId = revision + 1
    revision = requestId
    activeController?.abort('A newer popup request superseded this request.')

    const controller = typeof AbortController === 'function'
      ? new AbortController()
      : {signal: {aborted: false}, abort() { this.signal.aborted = true }}
    activeController = controller

    try {
      const value = await task({
        signal: controller.signal,
        requestId
      })

      if (!isCurrent(requestId) || controller.signal.aborted) {
        return {status: POPUP_REQUEST_STATUSES.STALE, requestId}
      }

      return {
        status: isEmpty(value)
          ? POPUP_REQUEST_STATUSES.EMPTY
          : POPUP_REQUEST_STATUSES.SUCCESS,
        data: value,
        requestId
      }
    } catch (error) {
      if (!isCurrent(requestId) || controller.signal.aborted || isAbortError(error)) {
        return {
          status: isCurrent(requestId)
            ? POPUP_REQUEST_STATUSES.CANCELLED
            : POPUP_REQUEST_STATUSES.STALE,
          error,
          requestId
        }
      }

      return {
        status: POPUP_REQUEST_STATUSES.ERROR,
        error,
        requestId
      }
    } finally {
      if (isCurrent(requestId)) {
        activeController = null
      }
    }
  }

  return {
    run,
    cancel,
    isCurrent,
    get revision() {
      return revision
    }
  }
}
