import {
  getDefaultSettings,
  normalizeSettings,
  STORAGE_DEFAULTS
} from './settings.mjs'

function getSyncStorage(storage) {
  return storage?.sync || storage || null
}

/**
 * Load the complete settings contract. Missing or malformed values are
 * normalized before the callback sees them; the read itself never writes
 * defaults back, so existing users are not migrated or reset on load.
 */
export function loadSettings(storage, onLoad) {
  const syncStorage = getSyncStorage(storage)

  if (!syncStorage?.get) {
    onLoad?.(getDefaultSettings())
    return
  }

  syncStorage.get(STORAGE_DEFAULTS, items => {
    onLoad?.(normalizeSettings(items))
  })
}

/**
 * Save only the known settings using the same normalization contract as
 * loadSettings. Chrome storage.set merges this payload, preserving unrelated
 * keys owned by other extension features or older versions.
 */
export function saveSettings(storage, values, onSaved) {
  const syncStorage = getSyncStorage(storage)
  const normalized = normalizeSettings(values)

  if (!syncStorage?.set) {
    onSaved?.()
    return normalized
  }

  syncStorage.set(normalized, onSaved)
  return normalized
}
