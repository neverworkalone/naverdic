const TRIGGER_KEYS = ['none', 'ctrl', 'alt', 'ctrlalt']

/**
 * This table is the only source of truth for the v6.6 setting keys, defaults,
 * storage value kinds, and legacy form field names used by migration and the
 * content runtime adapter. The form names remain part of the exported schema
 * descriptor even though the old Options component is no longer shipped.
 */
const SETTING_DEFINITIONS = [
  {key: 'dclick', optionKey: 'DCLICK', formKey: 'dClick', kind: 'boolean', defaultValue: true},
  {key: 'dclick_trigger_key', optionKey: 'DCLICK_TRIGGER', formKey: 'dClickTrigger', kind: 'trigger', defaultValue: 'none'},
  {key: 'dclick_speed', optionKey: 'DCLICK_SPEED', formKey: 'dClickSpeed', kind: 'number', defaultValue: 400},
  {key: 'drag', optionKey: 'DRAG', formKey: 'drag', kind: 'boolean', defaultValue: true},
  {key: 'drag_trigger_key', optionKey: 'DRAG_TRIGGER', formKey: 'dragTrigger', kind: 'trigger', defaultValue: 'ctrl'},
  {key: 'translate', optionKey: 'TRANSLATE', formKey: 'translate', kind: 'boolean', defaultValue: false},
  {key: 'translate_trigger_key', optionKey: 'TRANSLATE_TRIGGER', formKey: 'translateTrigger', kind: 'trigger', defaultValue: 'ctrlalt'},
  {key: 'deepl_auth_key', optionKey: 'DEEPL_AUTH_KEY', formKey: 'deeplAuthKey', kind: 'string', defaultValue: ''},
  {key: 'popup_bgcolor', optionKey: 'POPUP_BG_COLOR', formKey: 'popupBGColor', kind: 'string', defaultValue: '#FFF59D'},
  {key: 'popup_fontcolor', optionKey: 'POPUP_FONT_COLOR', formKey: 'popupFontColor', kind: 'string', defaultValue: '#000000'},
  {key: 'popup_fontsize', optionKey: 'POPUP_FONT_SIZE', formKey: 'popupFontSize', kind: 'string', defaultValue: '11'},
  {key: 'use_deny_list', optionKey: 'USE_DENY_LIST', formKey: 'useDenyList', kind: 'boolean', defaultValue: false},
  {key: 'safe_urls', optionKey: 'SAFE_URLS', formKey: 'safeURLs', kind: 'nullable-string', defaultValue: null}
]

export const SETTINGS_SCHEMA = Object.freeze(
  SETTING_DEFINITIONS.map(definition => Object.freeze({...definition}))
)

export const STORAGE_DEFAULTS = Object.freeze(
  Object.fromEntries(SETTING_DEFINITIONS.map(({key, defaultValue}) => [key, defaultValue]))
)

// Keep the legacy option names available for callers that used content.js.
// Their values are derived from the same definition table above.
export const DEFAULT_OPTIONS = Object.freeze(
  Object.fromEntries(SETTING_DEFINITIONS.map(({optionKey, defaultValue}) => [optionKey, defaultValue]))
)

function getDefinition(key) {
  return SETTING_DEFINITIONS.find(definition => definition.key === key) || null
}

function normalizeBoolean(value, fallback) {
  if (typeof value === 'boolean') {
    return value
  }

  if (value === true || value === 1 || value === '1' || value === 'true') {
    return true
  }

  if (value === false || value === 0 || value === '0' || value === 'false') {
    return false
  }

  return fallback
}

function normalizeNumber(value, fallback) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fallback
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    // dclick_speed has historically been stored both as 400 and as '400'.
    // Validate numeric strings without migrating their existing representation.
    return Number.isFinite(parsed) ? value.trim() : fallback
  }

  return fallback
}

function normalizeString(value, fallback) {
  if (typeof value !== 'string') {
    return fallback
  }

  const normalized = value.trim()
  return normalized || fallback
}

function normalizeNullableString(value, fallback) {
  if (value === null) {
    return null
  }

  if (typeof value !== 'string') {
    return fallback
  }

  return value.trim()
}

function normalizeTrigger(value, fallback) {
  const normalized = normalizeString(value, '')
  return TRIGGER_KEYS.includes(normalized) ? normalized : fallback
}

function normalizeValue(definition, value) {
  switch (definition.kind) {
    case 'boolean':
      return normalizeBoolean(value, definition.defaultValue)
    case 'number':
      return normalizeNumber(value, definition.defaultValue)
    case 'trigger':
      return normalizeTrigger(value, definition.defaultValue)
    case 'nullable-string':
      return normalizeNullableString(value, definition.defaultValue)
    case 'string':
    default:
      return normalizeString(value, definition.defaultValue)
  }
}

export function normalizeSetting(key, value) {
  const definition = getDefinition(key)
  return definition ? normalizeValue(definition, value) : undefined
}

/**
 * Normalize only known settings and always return every known storage key.
 * Unknown keys are intentionally ignored so unrelated sync storage data is
 * neither interpreted nor overwritten by this contract.
 */
export function normalizeSettings(values) {
  const source = values && typeof values === 'object' ? values : {}

  return Object.fromEntries(SETTING_DEFINITIONS.map(definition => [
    definition.key,
    normalizeValue(definition, source[definition.key])
  ]))
}
