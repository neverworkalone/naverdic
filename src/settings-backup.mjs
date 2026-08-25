import {
  SETTINGS_SCHEMA_VERSION,
  createInitialSettingsV2,
  normalizeSecretsV2,
  normalizeSettingsV2
} from './settings-v2.mjs'

export const SETTINGS_BACKUP_FORMAT_VERSION = 1
export const SETTINGS_BACKUP_FILE_NAME = 'naverdic-settings-backup.json'

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function normalizeImportedSettings(value) {
  const normalized = normalizeSettingsV2(value)
  const drag = isRecord(value?.dictionary?.drag) ? value.dictionary.drag : null

  if (!drag || !hasOwn(drag, 'triggerKey')) {
    normalized.dictionary.drag.triggerKey = createInitialSettingsV2().dictionary.drag.triggerKey
  }

  return normalized
}

export function createSettingsBackup(settings, secrets, exportedAt = new Date().toISOString()) {
  return {
    formatVersion: SETTINGS_BACKUP_FORMAT_VERSION,
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    exportedAt,
    settings: normalizeImportedSettings(settings),
    secrets: normalizeSecretsV2(secrets)
  }
}

export function serializeSettingsBackup(settings, secrets, exportedAt = new Date().toISOString()) {
  return JSON.stringify(createSettingsBackup(settings, secrets, exportedAt), null, 2)
}

export function parseSettingsBackup(value) {
  let parsed = value

  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value)
    } catch (_error) {
      throw new TypeError('The settings backup is not valid JSON.')
    }
  }

  if (!isRecord(parsed) || !isRecord(parsed.settings)) {
    throw new TypeError('The settings backup must contain a settings object.')
  }

  if (hasOwn(parsed, 'formatVersion') && parsed.formatVersion !== SETTINGS_BACKUP_FORMAT_VERSION) {
    throw new TypeError('The settings backup format is not supported.')
  }

  if (hasOwn(parsed, 'schemaVersion') && parsed.schemaVersion !== SETTINGS_SCHEMA_VERSION) {
    throw new TypeError('The settings schema is not supported.')
  }

  if (hasOwn(parsed, 'secrets') && !isRecord(parsed.secrets)) {
    throw new TypeError('The settings backup secrets must be an object.')
  }

  return {
    settings: normalizeImportedSettings(parsed.settings),
    secrets: normalizeSecretsV2(parsed.secrets)
  }
}
