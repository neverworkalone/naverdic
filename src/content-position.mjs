const DEFAULT_POPUP_MARGIN = 10
const DEFAULT_POPUP_GAP = 12
const DEFAULT_POPUP_WIDTH = 360

function finiteNumber(value, fallback = 0) {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

function positiveNumber(value, fallback = 0) {
  const normalized = finiteNumber(value, fallback)
  return normalized > 0 ? normalized : fallback
}

function clamp(value, minimum, maximum) {
  if (maximum < minimum) {
    return minimum
  }

  return Math.min(Math.max(value, minimum), maximum)
}

export function normalizeRect(value = {}) {
  const left = finiteNumber(value.left)
  const top = finiteNumber(value.top)
  const width = Math.max(0, finiteNumber(value.width, finiteNumber(value.right) - left))
  const height = Math.max(0, finiteNumber(value.height, finiteNumber(value.bottom) - top))
  const right = finiteNumber(value.right, left + width)
  const bottom = finiteNumber(value.bottom, top + height)

  return {
    left,
    top,
    right: Math.max(left, right),
    bottom: Math.max(top, bottom),
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top)
  }
}

/**
 * Convert the layout/visual viewport into document coordinates. Content
 * scripts run independently in every frame, so the supplied window is always
 * the frame whose selection owns the popup.
 */
export function getDocumentViewport(windowLike = globalThis.window) {
  const visualViewport = windowLike?.visualViewport
  const scrollX = finiteNumber(windowLike?.scrollX, finiteNumber(windowLike?.pageXOffset))
  const scrollY = finiteNumber(windowLike?.scrollY, finiteNumber(windowLike?.pageYOffset))
  const visualLeft = finiteNumber(visualViewport?.offsetLeft)
  const visualTop = finiteNumber(visualViewport?.offsetTop)
  const width = positiveNumber(
    visualViewport?.width,
    positiveNumber(windowLike?.innerWidth)
  )
  const height = positiveNumber(
    visualViewport?.height,
    positiveNumber(windowLike?.innerHeight)
  )
  const left = scrollX + visualLeft
  const top = scrollY + visualTop

  return {
    left,
    top,
    right: left + width,
    bottom: top + height,
    width,
    height,
    scrollX,
    scrollY,
    visualLeft,
    visualTop
  }
}

export function getDocumentScrollOffset(windowLike = globalThis.window) {
  return {
    x: finiteNumber(windowLike?.scrollX, finiteNumber(windowLike?.pageXOffset)),
    y: finiteNumber(windowLike?.scrollY, finiteNumber(windowLike?.pageYOffset))
  }
}

function toDocumentRect(rect, windowLike) {
  const normalized = normalizeRect(rect)
  if (rect?.coordinateSpace === 'document') {
    return normalized
  }

  const offset = getDocumentScrollOffset(windowLike)
  return {
    ...normalized,
    left: normalized.left + offset.x,
    right: normalized.right + offset.x,
    top: normalized.top + offset.y,
    bottom: normalized.bottom + offset.y
  }
}

export function getSelectionRect(selection) {
  if (!selection || !selection.rangeCount) {
    return null
  }

  try {
    const range = selection.getRangeAt(0)
    const rect = range?.getBoundingClientRect?.()
    if (!rect) {
      return null
    }

    return normalizeRect(rect)
  } catch (_error) {
    return null
  }
}

export function getEventRect(event = {}) {
  const hasClientCoordinates = (
    typeof event.clientX === 'number' && Number.isFinite(event.clientX) &&
    typeof event.clientY === 'number' && Number.isFinite(event.clientY)
  )
  const x = finiteNumber(event.clientX, finiteNumber(event.pageX))
  const y = finiteNumber(event.clientY, finiteNumber(event.pageY))

  return {
    left: x,
    top: y,
    right: x,
    bottom: y,
    width: 0,
    height: 0,
    coordinateSpace: hasClientCoordinates ? 'viewport' : 'document'
  }
}

/**
 * Keep a live range callback when possible. A Range's client rect changes as
 * its frame scrolls or zooms; the event rect is retained as a safe fallback
 * when the selection disappears before a reposition pass.
 */
export function createPopupAnchor({selection, event, window: windowLike} = {}) {
  const fallback = toDocumentRect(getEventRect(event), windowLike)

  return {
    getRect() {
      const selectionRect = getSelectionRect(selection)
      return selectionRect
        ? toDocumentRect(selectionRect, windowLike)
        : fallback
    },
    fallback
  }
}

function candidateOverflow(candidate, viewport, margin) {
  return (
    Math.max(0, viewport.left + margin - candidate.left) +
    Math.max(0, candidate.left + candidate.width - (viewport.right - margin)) +
    Math.max(0, viewport.top + margin - candidate.top) +
    Math.max(0, candidate.top + candidate.height - (viewport.bottom - margin))
  )
}

function compareCandidates(left, right) {
  for (const index of [0, 1, 2, 3]) {
    if (left.score[index] !== right.score[index]) {
      return left.score[index] - right.score[index]
    }
  }

  return 0
}

/**
 * Place a popup around an anchor using all four quadrants. The returned
 * coordinates are document coordinates suitable for an absolutely positioned
 * element, while the viewport boundaries include scroll and visual viewport
 * offsets. Long content is constrained to the available side of the anchor.
 */
export function calculatePopupPosition({
  anchorRect,
  popupSize = {},
  viewport = getDocumentViewport(),
  margin = DEFAULT_POPUP_MARGIN,
  gap = DEFAULT_POPUP_GAP,
  preferredVertical = 'below'
} = {}) {
  const anchor = normalizeRect(anchorRect)
  const normalizedViewport = normalizeRect(viewport)
  const viewportWidth = Math.max(1, normalizedViewport.right - normalizedViewport.left)
  const viewportHeight = Math.max(1, normalizedViewport.bottom - normalizedViewport.top)
  const normalizedMargin = Math.max(0, finiteNumber(margin, DEFAULT_POPUP_MARGIN))
  const normalizedGap = Math.max(0, finiteNumber(gap, DEFAULT_POPUP_GAP))
  const availableWidth = Math.max(1, viewportWidth - normalizedMargin * 2)
  const width = Math.min(
    positiveNumber(popupSize.width, DEFAULT_POPUP_WIDTH),
    availableWidth
  )
  const height = Math.max(0, finiteNumber(popupSize.height))

  const belowAvailable = Math.max(
    0,
    normalizedViewport.bottom - anchor.bottom - normalizedGap - normalizedMargin
  )
  const aboveAvailable = Math.max(
    0,
    anchor.top - normalizedViewport.top - normalizedGap - normalizedMargin
  )

  let verticalPreference
  if (height > 0 && belowAvailable < height && aboveAvailable >= height) {
    verticalPreference = 'above'
  } else if (height > 0 && aboveAvailable < height && belowAvailable >= height) {
    verticalPreference = 'below'
  } else if (height > 0 && belowAvailable !== aboveAvailable) {
    verticalPreference = belowAvailable > aboveAvailable ? 'below' : 'above'
  } else {
    verticalPreference = preferredVertical === 'above' ? 'above' : 'below'
  }

  const verticalOrder = verticalPreference === 'above'
    ? ['above', 'below']
    : ['below', 'above']
  const horizontalOrder = ['right', 'left']
  const candidates = []

  verticalOrder.forEach((vertical, verticalIndex) => {
    horizontalOrder.forEach((horizontal, horizontalIndex) => {
      const top = vertical === 'below'
        ? anchor.bottom + normalizedGap
        : anchor.top - height - normalizedGap
      const left = horizontal === 'right'
        ? anchor.left
        : anchor.right - width
      const candidate = {
        top,
        left,
        width,
        height,
        vertical,
        horizontal
      }
      const overflow = candidateOverflow(candidate, normalizedViewport, normalizedMargin)
      candidates.push({
        candidate,
        score: [overflow > 0 ? 1 : 0, overflow, verticalIndex, horizontalIndex]
      })
    })
  })

  candidates.sort(compareCandidates)
  const selected = candidates[0]?.candidate || {
    top: normalizedViewport.top + normalizedMargin,
    left: normalizedViewport.left + normalizedMargin,
    width,
    height,
    vertical: verticalPreference,
    horizontal: 'right'
  }

  const minLeft = normalizedViewport.left + normalizedMargin
  const maxLeft = normalizedViewport.right - normalizedMargin - width
  const maxAvailableHeight = Math.max(1, viewportHeight - normalizedMargin * 2)
  const verticalAvailable = selected.vertical === 'above'
    ? aboveAvailable
    : belowAvailable
  const largestSideAvailable = Math.max(belowAvailable, aboveAvailable)
  const needsScrollableViewport = height > largestSideAvailable
  const maxHeight = Math.min(
    maxAvailableHeight,
    needsScrollableViewport
      ? maxAvailableHeight
      : Math.max(1, verticalAvailable || maxAvailableHeight)
  )
  const minTop = normalizedViewport.top + normalizedMargin
  const maxTop = normalizedViewport.bottom - normalizedMargin - Math.min(height || maxHeight, maxAvailableHeight)

  return {
    left: clamp(selected.left, minLeft, maxLeft),
    top: clamp(selected.top, minTop, Math.max(minTop, maxTop)),
    width,
    maxHeight,
    vertical: selected.vertical,
    horizontal: selected.horizontal,
    direction: `${selected.vertical}-${selected.horizontal}`,
    viewport: normalizedViewport
  }
}

export const POPUP_POSITION_DEFAULTS = Object.freeze({
  margin: DEFAULT_POPUP_MARGIN,
  gap: DEFAULT_POPUP_GAP,
  width: DEFAULT_POPUP_WIDTH
})
