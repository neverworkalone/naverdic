import {
  SETTINGS_SCHEMA,
  normalizeSetting,
  normalizeSettings
} from './settings.mjs'
import {
  DEFAULT_PROVIDER_ID
} from './translation-provider.mjs'
import {
  SETTINGS_SCHEMA_VERSION,
  SETTINGS_STORAGE,
  createDefaultSecretsV2,
  createInitialSettingsV2,
  normalizeDomainList,
  normalizeSecretsV2,
  normalizeSettingsV2
} from './settings-v2.mjs'

export const V66_STORAGE_AREA = 'sync'

export const LEGACY_SECRET_KEYS = Object.freeze([
  'deepl_auth_key'
])

export const LEGACY_SETTING_KEYS = Object.freeze(
  SETTINGS_SCHEMA.map(definition => definition.key)
)

/**
 * A reviewable, machine-readable description of every v6.6 -> v7 mapping.
 * `transform` names the conversion performed by migrateV66ToV2; it is not
 * executable configuration and therefore cannot contain credentials.
 */
export const V66_TO_V2_RULES = Object.freeze({
  dclick: Object.freeze({target: 'dictionary.doubleClick.enabled', transform: 'boolean'}),
  dclick_trigger_key: Object.freeze({target: 'dictionary.doubleClick.triggerKey', transform: 'trigger'}),
  dclick_speed: Object.freeze({target: 'dictionary.doubleClick.speedMs', transform: 'positive-integer'}),
  drag: Object.freeze({target: 'dictionary.drag.enabled', transform: 'boolean'}),
  drag_trigger_key: Object.freeze({target: 'dictionary.drag.triggerKey', transform: 'trigger'}),
  translate: Object.freeze({target: 'translation.enabled', transform: 'boolean'}),
  translate_trigger_key: Object.freeze({target: 'translation.triggerKey', transform: 'trigger'}),
  deepl_auth_key: Object.freeze({target: 'secrets.providers.deepl-free.apiKey', transform: 'local-secret'}),
  popup_bgcolor: Object.freeze({target: 'popup.backgroundColor', transform: 'non-empty-string'}),
  popup_fontcolor: Object.freeze({target: 'popup.fontColor', transform: 'non-empty-string'}),
  popup_fontsize: Object.freeze({target: 'popup.fontSizePt', transform: 'positive-integer'}),
  use_deny_list: Object.freeze({target: 'sites.denyListEnabled', transform: 'boolean'}),
  safe_urls: Object.freeze({target: 'sites.denyList', transform: 'domain-list'})
})

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function finiteNumber(value, fallback) {
  const candidate = typeof value === 'string' && value.trim()
    ? Number(value.trim())
    : value
  return typeof candidate === 'number' && Number.isFinite(candidate)
    ? candidate
    : fallback
}

/**
 * Convert the flat v6.6 storage shape into the v7 settings and secrets
 * envelopes. The source object is never mutated and legacy keys are never
 * copied into the v7 sync envelope.
 */
export function migrateV66ToV2(values) {
  const source = isRecord(values) ? values : {}
  const legacy = normalizeSettings(source)
  const settings = createInitialSettingsV2()
  const secrets = createDefaultSecretsV2()

  settings.dictionary.doubleClick.enabled = legacy.dclick
  settings.dictionary.doubleClick.triggerKey = legacy.dclick_trigger_key
  settings.dictionary.doubleClick.speedMs = finiteNumber(
    legacy.dclick_speed,
    settings.dictionary.doubleClick.speedMs
  )
  settings.dictionary.drag.enabled = legacy.drag
  if (hasOwn(source, 'drag_trigger_key')) {
    settings.dictionary.drag.triggerKey = legacy.drag_trigger_key
  }
  settings.translation.enabled = legacy.translate
  settings.translation.triggerKey = legacy.translate_trigger_key
  settings.translation.providerId = DEFAULT_PROVIDER_ID
  settings.popup.backgroundColor = legacy.popup_bgcolor
  settings.popup.fontColor = legacy.popup_fontcolor
  settings.popup.fontSizePt = finiteNumber(
    legacy.popup_fontsize,
    settings.popup.fontSizePt
  )
  settings.sites.denyListEnabled = legacy.use_deny_list
  settings.sites.denyList = normalizeDomainList(legacy.safe_urls)

  const apiKey = normalizeSetting('deepl_auth_key', legacy.deepl_auth_key)
  if (apiKey) {
    secrets.providers[DEFAULT_PROVIDER_ID] = {apiKey}
  }

  const sourceKeys = LEGACY_SETTING_KEYS.filter(key => hasOwn(source, key))
  const unknownKeys = Object.keys(source).filter(key => !V66_TO_V2_RULES[key])

  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    sourceStorageArea: V66_STORAGE_AREA,
    sourceKeys,
    unknownKeys,
    settings: normalizeSettingsV2(settings),
    secrets: normalizeSecretsV2(secrets),
    storage: SETTINGS_STORAGE
  }
}

export const migrateLegacySettings = migrateV66ToV2

export function hasV66Settings(values) {
  if (!isRecord(values)) {
    return false
  }

  return LEGACY_SETTING_KEYS.some(key => hasOwn(values, key))
}
