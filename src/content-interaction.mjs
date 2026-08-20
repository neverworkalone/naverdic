const DEFAULT_SELECTION_DISTANCE = 8

export function getNavigatorPlatform(navigatorLike) {
  const currentNavigator = navigatorLike === undefined
    ? (typeof navigator === 'undefined' ? null : navigator)
    : navigatorLike

  return currentNavigator?.userAgentData?.platform || currentNavigator?.platform || ''
}

export function isMacPlatform(platform = getNavigatorPlatform()) {
  return /mac/i.test(String(platform))
}

export function getTriggerLabels(platform = getNavigatorPlatform()) {
  return isMacPlatform(platform)
    ? {ctrl: 'cmd', alt: 'option'}
    : {ctrl: 'ctrl', alt: 'alt'}
}

/**
 * Normalize text copied from a Selection without destroying meaningful line
 * breaks. Non-breaking spaces and zero-width characters are common in page
 * text, but should not make an otherwise empty selection look non-empty.
 */
export function normalizeSelectionText(value) {
  if (value === null || value === undefined) {
    return ''
  }

  return String(value)
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\u00A0/g, ' ')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => line.replace(/[\t\f\v ]+/g, ' ').trim())
    .join('\n')
    .trim()
}

export function getSelectionText(selection) {
  if (!selection || !selection.rangeCount) {
    return ''
  }

  let value = ''

  if (
    typeof selection.toString === 'function' &&
    selection.toString !== Object.prototype.toString
  ) {
    try {
      value = selection.toString()
    } catch (_error) {
      // Continue with the range fallback below.
    }
  }

  try {
    if (!value) {
      const range = selection.getRangeAt(0)
      value = range?.cloneContents?.().textContent || ''
    }
  } catch (_error) {
    // A selection can disappear between mouseup and getRangeAt(). Treat it
    // as empty rather than allowing the event handler to throw.
  }

  return normalizeSelectionText(value)
}

export function getDictionaryQuery(value) {
  const text = normalizeSelectionText(value)

  if (!text || !/^[A-Za-z]/.test(text)) {
    return ''
  }

  // Keep the existing dictionary behaviour: a short English phrase may be
  // searched, while a dragged paragraph belongs to translation instead.
  if (text.split(/\s+/).length >= 6) {
    return ''
  }

  // Dictionary queries are single search strings; keep paragraph line breaks
  // for translation, but turn them into ordinary spaces for lookup.
  return text.replace(/\s+/g, ' ').toLowerCase()
}

/**
 * Check the modifier combination configured by the user.
 *
 * "ctrl" means Ctrl on Windows/Linux and Command on macOS. Unknown values
 * intentionally fall back to "none", matching the option defaults.
 */
export function checkTrigger(event = {}, key = 'none', platform = getNavigatorPlatform()) {
  const ctrlPressed = Boolean(event?.ctrlKey)
  const metaPressed = Boolean(event?.metaKey)
  const altPressed = Boolean(event?.altKey)
  const mac = isMacPlatform(platform)
  const primaryPressed = mac ? metaPressed : ctrlPressed
  const secondaryControlPressed = mac ? ctrlPressed : metaPressed

  switch (key) {
    case 'ctrl':
      return primaryPressed && !secondaryControlPressed && !altPressed
    case 'alt':
      return altPressed && !ctrlPressed && !metaPressed
    case 'ctrlalt':
      return primaryPressed && !secondaryControlPressed && altPressed
    case 'none':
    default:
      return !ctrlPressed && !metaPressed && !altPressed
  }
}

function normalizeHost(value) {
  if (value === null || value === undefined) {
    return ''
  }

  let candidate = String(value).trim().toLowerCase()
  if (!candidate) {
    return ''
  }

  candidate = candidate.replace(/^\*\./, '')

  try {
    const url = /^[a-z][a-z\d+.-]*:\/\//i.test(candidate)
      ? new URL(candidate)
      : new URL(`http://${candidate}`)
    return url.hostname.toLowerCase().replace(/^\.+|\.+$/g, '')
  } catch (_error) {
    // Keep malformed entries harmless and useful as simple host names.
    return candidate
      .split(/[/?#]/, 1)[0]
      .replace(/:\d+$/, '')
      .replace(/^\.+|\.+$/g, '')
  }
}

export function normalizeDenyList(value) {
  const entries = Array.isArray(value)
    ? value
    : String(value ?? '').split(/[,;\r\n]+/)

  return entries
    .map(normalizeHost)
    .filter(Boolean)
}

/**
 * Return true for an exact host match or a subdomain match. Using a label
 * boundary avoids accidentally denying `not-example.com` for `example.com`.
 */
export function isDeniedSite(host, denyList, enabled = true) {
  if (!enabled) {
    return false
  }

  const currentHost = normalizeHost(host)
  if (!currentHost) {
    return false
  }

  return normalizeDenyList(denyList).some(entry => (
    currentHost === entry || currentHost.endsWith(`.${entry}`)
  ))
}

function getCoordinate(event, primary, fallback) {
  const value = event?.[primary]
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }

  const fallbackValue = event?.[fallback]
  return typeof fallbackValue === 'number' && Number.isFinite(fallbackValue)
    ? fallbackValue
    : 0
}

/**
 * Attach the mouse interaction for one document/frame.
 *
 * The returned destroy() function is deliberately part of the API. A content
 * script can then replace its configuration without ever stacking handlers
 * on the same document.
 */
export function createInteractionController(options, dependencies = {}) {
  const config = options || {}
  const target = dependencies.target
  const openPopup = dependencies.openPopup || (() => {})
  const removePopup = dependencies.removePopup || (() => {})
  const triggerMatches = dependencies.checkTrigger || checkTrigger
  const selectionDistance = dependencies.selectionDistance ?? DEFAULT_SELECTION_DISTANCE

  if (!target || typeof target.addEventListener !== 'function') {
    return { destroy() {} }
  }

  let mouseDown = false
  let moved = false
  let startX = 0
  let startY = 0
  let clickCount = 0
  let clickTimeout = null
  let destroyed = false

  function resetClickSequence() {
    clickCount = 0
    if (clickTimeout !== null) {
      clearTimeout(clickTimeout)
      clickTimeout = null
    }
  }

  function resetPointer() {
    mouseDown = false
    moved = false
  }

  function onMouseDown(event) {
    if (event.button !== undefined && event.button !== 0) {
      return
    }

    mouseDown = true
    moved = false
    startX = getCoordinate(event, 'clientX', 'pageX')
    startY = getCoordinate(event, 'clientY', 'pageY')
  }

  function onMouseMove(event) {
    if (!mouseDown) {
      return
    }

    const currentX = getCoordinate(event, 'clientX', 'pageX')
    const currentY = getCoordinate(event, 'clientY', 'pageY')
    const distance = Math.hypot(currentX - startX, currentY - startY)

    if (distance > selectionDistance) {
      moved = true
    }
  }

  function onMouseUp(event) {
    if (!mouseDown) {
      return
    }

    const wasMoved = moved
    resetPointer()

    if (wasMoved) {
      resetClickSequence()

      if (config.drag && triggerMatches(event, config.drag_trigger_key)) {
        removePopup()
        openPopup(event)
      } else if (config.translate && triggerMatches(event, config.translate_trigger_key)) {
        removePopup()
        openPopup(
          event,
          config.translationRequest || config.deepl_auth_key,
          'translate'
        )
      } else {
        removePopup()
      }
      return
    }

    if (!config.dclick || !triggerMatches(event, config.dclick_trigger_key)) {
      resetClickSequence()
      removePopup()
      return
    }

    removePopup()
    clickCount += 1

    if (clickCount === 1) {
      clickTimeout = setTimeout(() => {
        clickCount = 0
        clickTimeout = null
      }, Number(config.dclick_speed) || 0)
      return
    }

    resetClickSequence()
    openPopup(event)
  }

  target.addEventListener('mousedown', onMouseDown)
  target.addEventListener('mousemove', onMouseMove)
  target.addEventListener('mouseup', onMouseUp)

  return {
    destroy() {
      if (destroyed) {
        return
      }

      destroyed = true
      target.removeEventListener?.('mousedown', onMouseDown)
      target.removeEventListener?.('mousemove', onMouseMove)
      target.removeEventListener?.('mouseup', onMouseUp)
      resetPointer()
      resetClickSequence()
    }
  }
}
