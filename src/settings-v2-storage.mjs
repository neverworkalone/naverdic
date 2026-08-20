import {
  SETTINGS_STORAGE,
  createDefaultSecretsV2,
  createDefaultSettingsV2,
  hasSettingsV2Envelope,
  hasSecretsV2Envelope,
  normalizeSecretsV2,
  normalizeSettingsV2
} from './settings-v2.mjs'
import {
  LEGACY_SECRET_KEYS,
  LEGACY_SETTING_KEYS,
  migrateV66ToV2
} from './settings-migration-v2.mjs'

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function stableSerialize(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableSerialize).join(',')}]`
  }

  if (isRecord(value)) {
    return `{${Object.keys(value).sort().map(key => (
      `${JSON.stringify(key)}:${stableSerialize(value[key])}`
    )).join(',')}}`
  }

  return JSON.stringify(value)
}

function valuesEqual(left, right) {
  return stableSerialize(left) === stableSerialize(right)
}

export function hasPendingSettingsChanges(persisted, draft) {
  return !valuesEqual(persisted?.settings, draft?.settings) ||
    !valuesEqual(persisted?.secrets, draft?.secrets)
}

export function shouldWarnBeforeUnload(hasPendingChanges) {
  return Boolean(hasPendingChanges)
}

function getLastError() {
  const lastError = globalThis.chrome?.runtime?.lastError
  return lastError?.message ? new Error(lastError.message) : null
}

function readStorageArea(area, keys) {
  if (!area?.get) {
    return Promise.resolve({})
  }

  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (callback, value) => {
      if (settled) {
        return
      }
      settled = true
      callback(value)
    }
    const callback = values => {
      const lastError = getLastError()
      if (lastError) {
        finish(reject, lastError)
        return
      }
      finish(resolve, isRecord(values) ? values : {})
    }

    try {
      const result = area.get(keys, callback)
      if (result && typeof result.then === 'function') {
        result.then(callback).catch(error => finish(reject, error))
      }
    } catch (error) {
      finish(reject, error)
    }
  })
}

function writeStorageArea(area, values) {
  if (!area?.set) {
    return Promise.resolve()
  }

  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (callback, value) => {
      if (settled) {
        return
      }
      settled = true
      callback(value)
    }
    const callback = () => {
      const lastError = getLastError()
      if (lastError) {
        finish(reject, lastError)
        return
      }
      finish(resolve)
    }

    try {
      const result = area.set(values, callback)
      if (result && typeof result.then === 'function') {
        result.then(() => callback()).catch(error => finish(reject, error))
      }
    } catch (error) {
      finish(reject, error)
    }
  })
}

function removeStorageArea(area, keys) {
  if (!area?.remove) {
    return Promise.resolve()
  }

  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (callback, value) => {
      if (settled) {
        return
      }
      settled = true
      callback(value)
    }
    const callback = () => {
      const lastError = getLastError()
      if (lastError) {
        finish(reject, lastError)
        return
      }
      finish(resolve)
    }

    try {
      const result = area.remove(keys, callback)
      if (result && typeof result.then === 'function') {
        result.then(() => callback()).catch(error => finish(reject, error))
      }
    } catch (error) {
      finish(reject, error)
    }
  })
}

function mergeSecrets(localSecrets, migratedSecrets) {
  const local = normalizeSecretsV2(localSecrets)
  const migrated = normalizeSecretsV2(migratedSecrets)
  const merged = createDefaultSecretsV2()

  Object.entries(migrated.providers).forEach(([providerId, credentials]) => {
    merged.providers[providerId] = {...credentials}
  })
  Object.entries(local.providers).forEach(([providerId, credentials]) => {
    merged.providers[providerId] = {
      ...merged.providers[providerId],
      ...credentials
    }
  })

  return normalizeSecretsV2(merged)
}

function getStorageAreas(storage) {
  return {
    sync: storage?.sync || null,
    local: storage?.local || null
  }
}

/**
 * Read v7 envelopes and legacy v6.6 keys without changing either storage
 * area. Individual invalid v2 fields are normalized to their own defaults.
 */
export async function loadSettingsV2(storage) {
  const areas = getStorageAreas(storage)
  const syncKeys = [SETTINGS_STORAGE.settings.key, ...LEGACY_SETTING_KEYS]
  const [syncValues, localValues] = await Promise.all([
    readStorageArea(areas.sync, syncKeys),
    readStorageArea(areas.local, [SETTINGS_STORAGE.secrets.key])
  ])

  const storedSettings = syncValues[SETTINGS_STORAGE.settings.key]
  const hasV2Settings = hasSettingsV2Envelope(storedSettings)
  const legacyMigration = migrateV66ToV2(syncValues)
  const settings = hasV2Settings
    ? normalizeSettingsV2(storedSettings)
    : legacyMigration.settings
  const storedSecrets = localValues[SETTINGS_STORAGE.secrets.key]
  const hasV2Secrets = hasSecretsV2Envelope(storedSecrets)
  const secrets = hasV2Secrets
    ? normalizeSecretsV2(storedSecrets)
    : mergeSecrets(storedSecrets, legacyMigration.secrets)
  const hasSyncStorage = Boolean(areas.sync?.get || areas.sync?.set)
  const hasLocalStorage = Boolean(areas.local?.get || areas.local?.set)
  const storageAvailable = hasSyncStorage || hasLocalStorage
  const legacySecretKeys = LEGACY_SECRET_KEYS.filter(key => hasOwn(syncValues, key))

  const settingsNeedNormalization = !hasV2Settings || !valuesEqual(storedSettings, settings)
  const secretsNeedNormalization = !hasV2Secrets ||
    !valuesEqual(storedSecrets, secrets)
  const migrationNeeded = storageAvailable && (
    settingsNeedNormalization ||
    secretsNeedNormalization ||
    legacySecretKeys.length > 0
  )

  return {
    settings,
    secrets,
    hasV2Settings,
    hasV2Secrets,
    migratedFromV66: !hasV2Settings && legacyMigration.sourceKeys.length > 0,
    migrationNeeded,
    storageAvailable,
    legacySecretKeys,
    sourceKeys: legacyMigration.sourceKeys,
    unknownKeys: legacyMigration.unknownKeys
  }
}

/**
 * Persist only the v7 envelopes. Settings are sync-safe; credentials are
 * always sent to local storage and never included in the sync payload.
 */
export async function saveSettingsV2(storage, values = {}) {
  const areas = getStorageAreas(storage)
  const settings = normalizeSettingsV2(values.settings)
  const secrets = normalizeSecretsV2(values.secrets)

  await writeStorageArea(areas.sync, {
    [SETTINGS_STORAGE.settings.key]: settings
  })
  await writeStorageArea(areas.local, {
    [SETTINGS_STORAGE.secrets.key]: secrets
  })
  await removeStorageArea(areas.sync, LEGACY_SECRET_KEYS)

  return {settings, secrets}
}

export const persistSettingsV2 = saveSettingsV2

export async function migrateAndPersistSettingsV2(storage) {
  const loaded = await loadSettingsV2(storage)
  if (!loaded.migrationNeeded) {
    return loaded
  }

  const saved = await saveSettingsV2(storage, loaded)
  return {
    ...loaded,
    ...saved,
    migrationNeeded: false
  }
}

export function createEmptySettingsV2State() {
  return {
    settings: createDefaultSettingsV2(),
    secrets: createDefaultSecretsV2()
  }
}
