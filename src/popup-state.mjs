/**
 * Shared popup state contract for the content-script popup and toolbar popup.
 *
 * Rendering is deliberately kept out of this module so the content script can
 * use the same state model without pulling Vue into the page.
 */
export const POPUP_TYPES = Object.freeze({
  DICTIONARY: 'dictionary',
  TRANSLATION: 'translation'
})

export const POPUP_STATES = Object.freeze({
  IDLE: 'idle',
  LOADING: 'loading',
  RESULT: 'result',
  EMPTY: 'empty',
  ERROR: 'error'
})

function normalizeType(type) {
  return type === POPUP_TYPES.TRANSLATION
    ? POPUP_TYPES.TRANSLATION
    : POPUP_TYPES.DICTIONARY
}

export function normalizePopupData(type, data) {
  return normalizeType(type) === POPUP_TYPES.DICTIONARY
    ? (Array.isArray(data) ? data : [])
    : (typeof data === 'string' ? data : String(data ?? ''))
}

export function isPopupDataEmpty(type, data) {
  const normalized = normalizePopupData(type, data)
  return Array.isArray(normalized)
    ? normalized.length === 0
    : normalized.trim() === ''
}

/**
 * Convert a request coordinator result into the renderer-neutral popup state.
 * Stale/cancelled requests intentionally return null so an old response can
 * never replace a newer popup state.
 */
export function resolvePopupState(type, result = {}) {
  const normalizedType = normalizeType(type)

  if (result.status === 'success') {
    const data = normalizePopupData(normalizedType, result.data)
    return {
      state: isPopupDataEmpty(normalizedType, data)
        ? POPUP_STATES.EMPTY
        : POPUP_STATES.RESULT,
      data,
      error: null
    }
  }

  if (result.status === 'empty') {
    return {
      state: POPUP_STATES.EMPTY,
      data: normalizePopupData(normalizedType),
      error: null
    }
  }

  if (result.status === 'error') {
    return {
      state: POPUP_STATES.ERROR,
      data: normalizePopupData(normalizedType),
      error: result.error || null
    }
  }

  return null
}
