import {SETTINGS_V2_DEFAULTS} from './settings-v2.mjs'

export const APPEARANCE_DEFAULTS = Object.freeze({
  backgroundColor: SETTINGS_V2_DEFAULTS.popup.backgroundColor,
  fontColor: SETTINGS_V2_DEFAULTS.popup.fontColor,
  fontSizePt: SETTINGS_V2_DEFAULTS.popup.fontSizePt
})

// The persisted settings contract accepts every positive integer. The stepper
// keeps that contract intact while giving the UI a practical upper bound.
export const FONT_SIZE_MIN_PT = 1
export const FONT_SIZE_MAX_PT = 72

const HEX_COLOR_PATTERN = /^#?[0-9a-f]{6}$/i

export function normalizeHexColor(value) {
  if (typeof value !== 'string') {
    return null
  }

  const candidate = value.trim()
  if (!HEX_COLOR_PATTERN.test(candidate)) {
    return null
  }

  return `#${candidate.replace(/^#/, '').toUpperCase()}`
}

export function colorInputValue(value, fallback) {
  return normalizeHexColor(value) || normalizeHexColor(fallback) || '#000000'
}

export function stepperFontSize(value) {
  const candidate = Number(value)
  return Number.isFinite(candidate) && candidate > 0
    ? Math.round(candidate)
    : FONT_SIZE_MIN_PT
}

export function changeFontSize(value, delta) {
  const current = stepperFontSize(value)
  if (delta > 0) {
    return current >= FONT_SIZE_MAX_PT
      ? current
      : Math.min(FONT_SIZE_MAX_PT, current + 1)
  }

  if (delta < 0) {
    return current <= FONT_SIZE_MIN_PT
      ? current
      : Math.max(FONT_SIZE_MIN_PT, current - 1)
  }

  return current
}
