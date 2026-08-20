import assert from 'node:assert/strict'
import test from 'node:test'

import {
  SETTINGS_STORAGE,
  SETTINGS_V2_DEFAULTS
} from '../src/settings-v2.mjs'
import {
  hasPendingSettingsChanges,
  loadSettingsV2,
  migrateAndPersistSettingsV2,
  saveSettingsV2,
  shouldWarnBeforeUnload
} from '../src/settings-v2-storage.mjs'

class FakeStorageArea {
  constructor(items = {}, options = {}) {
    this.items = {...items}
    this.getCalls = []
    this.setCalls = []
    this.removeCalls = []
    this.failGet = options.failGet || null
    this.failSet = options.failSet || null
    this.failRemove = options.failRemove || null
  }

  get(keys, callback) {
    this.getCalls.push(keys)
    if (this.failGet) {
      throw this.failGet
    }

    const requestedKeys = Array.isArray(keys)
      ? keys
      : typeof keys === 'string'
        ? [keys]
        : Object.keys(this.items)
    const values = Object.fromEntries(requestedKeys
      .filter(key => Object.prototype.hasOwnProperty.call(this.items, key))
      .map(key => [key, this.items[key]]))
    callback(values)
  }

  set(values, callback) {
    this.setCalls.push({...values})
    if (this.failSet) {
      throw this.failSet
    }

    Object.assign(this.items, values)
    callback?.()
  }

  remove(keys, callback) {
    this.removeCalls.push(Array.isArray(keys) ? [...keys] : [keys])
    if (this.failRemove) {
      throw this.failRemove
    }

    const keysToRemove = Array.isArray(keys) ? keys : [keys]
    keysToRemove.forEach(key => delete this.items[key])
    callback?.()
  }
}

function createStorage(syncItems = {}, localItems = {}, options = {}) {
  return {
    sync: new FakeStorageArea(syncItems, options.sync),
    local: new FakeStorageArea(localItems, options.local)
  }
}

const legacyValues = {
  dclick: 'false',
  dclick_trigger_key: ' alt ',
  dclick_speed: '300',
  drag: 0,
  drag_trigger_key: 'ctrlalt',
  translate: 'true',
  translate_trigger_key: 'none',
  deepl_auth_key: '  legacy-secret  ',
  popup_bgcolor: ' #123456 ',
  popup_fontcolor: ' #ffffff ',
  popup_fontsize: '13',
  use_deny_list: true,
  safe_urls: ' https://www.Example.com/path, *.example.com; naver.com\n'
}

test('loads v6.6 values into a draft without writing during the read', async () => {
  const storage = createStorage(legacyValues)

  const loaded = await loadSettingsV2(storage)

  assert.equal(loaded.hasV2Settings, false)
  assert.equal(loaded.migratedFromV66, true)
  assert.equal(loaded.migrationNeeded, true)
  assert.equal(loaded.settings.dictionary.doubleClick.enabled, false)
  assert.equal(loaded.settings.dictionary.doubleClick.speedMs, 300)
  assert.equal(loaded.settings.sites.denyList[0], 'www.example.com')
  assert.deepEqual(loaded.secrets.providers['deepl-free'], {
    apiKey: 'legacy-secret'
  })
  assert.equal(storage.sync.setCalls.length, 0)
  assert.equal(storage.local.setCalls.length, 0)
})

test('persists the v6.6 migration into separate v2 sync and local envelopes', async () => {
  const storage = createStorage({
    ...legacyValues,
    unrelated_key: 'keep-me'
  })

  const migrated = await migrateAndPersistSettingsV2(storage)
  const settingsKey = SETTINGS_STORAGE.settings.key
  const secretsKey = SETTINGS_STORAGE.secrets.key

  assert.equal(migrated.migrationNeeded, false)
  assert.equal(storage.sync.setCalls.length, 1)
  assert.equal(storage.local.setCalls.length, 1)
  assert.deepEqual(storage.sync.removeCalls, [['deepl_auth_key']])
  assert.deepEqual(Object.keys(storage.sync.setCalls[0]), [settingsKey])
  assert.deepEqual(Object.keys(storage.local.setCalls[0]), [secretsKey])
  assert.equal(storage.sync.items.unrelated_key, 'keep-me')
  assert.equal('deepl_auth_key' in storage.sync.items, false)
  assert.equal(
    storage.sync.items[settingsKey].translation.providerId,
    'deepl-free'
  )
  assert.deepEqual(
    storage.local.items[secretsKey].providers['deepl-free'],
    {apiKey: 'legacy-secret'}
  )
})

test('does not resurrect a deleted credential from legacy sync storage', async () => {
  const settingsKey = SETTINGS_STORAGE.settings.key
  const secretsKey = SETTINGS_STORAGE.secrets.key
  const storage = createStorage({
    [settingsKey]: SETTINGS_V2_DEFAULTS,
    deepl_auth_key: '  stale-secret  ',
    unrelated_key: 'keep-me'
  }, {
    [secretsKey]: {
      schemaVersion: 2,
      providers: {}
    }
  })

  const loaded = await loadSettingsV2(storage)

  assert.equal(loaded.hasV2Secrets, true)
  assert.deepEqual(loaded.secrets.providers, {})
  assert.equal(loaded.migrationNeeded, true)
  assert.deepEqual(loaded.legacySecretKeys, ['deepl_auth_key'])

  await migrateAndPersistSettingsV2(storage)

  assert.deepEqual(storage.local.items[secretsKey].providers, {})
  assert.equal('deepl_auth_key' in storage.sync.items, false)
  assert.equal(storage.sync.items.unrelated_key, 'keep-me')
})

for (const [label, invalidEnvelope] of [
  ['null', null],
  ['an array', []],
  ['a wrong schema version', {schemaVersion: 1, providers: {}}]
]) {
  test(`recovers a legacy credential from ${label} local secrets`, async () => {
    const settingsKey = SETTINGS_STORAGE.settings.key
    const secretsKey = SETTINGS_STORAGE.secrets.key
    const storage = createStorage({
      [settingsKey]: SETTINGS_V2_DEFAULTS,
      deepl_auth_key: '  recoverable-secret  '
    }, {
      [secretsKey]: invalidEnvelope
    })

    const loaded = await loadSettingsV2(storage)

    assert.equal(loaded.hasV2Secrets, false)
    assert.equal(loaded.secrets.providers['deepl-free'].apiKey, 'recoverable-secret')
    assert.equal(loaded.migrationNeeded, true)

    await migrateAndPersistSettingsV2(storage)

    assert.equal(
      storage.local.items[secretsKey].providers['deepl-free'].apiKey,
      'recoverable-secret'
    )
    assert.equal('deepl_auth_key' in storage.sync.items, false)
  })
}

test('normalizes only invalid v2 fields and schedules the corrected envelope', async () => {
  const storage = createStorage({
    [SETTINGS_STORAGE.settings.key]: {
      schemaVersion: 2,
      interface: {language: 'fr'},
      popup: {
        backgroundColor: '  red  ',
        fontColor: '',
        fontSizePt: '-2'
      },
      translation: {
        providerId: 'missing-provider',
        targetLanguage: 'ja'
      }
    }
  }, {
    [SETTINGS_STORAGE.secrets.key]: {
      schemaVersion: 2,
      providers: {}
    }
  })

  const loaded = await loadSettingsV2(storage)

  assert.equal(loaded.hasV2Settings, true)
  assert.equal(loaded.settings.interface.language, 'auto')
  assert.equal(loaded.settings.popup.backgroundColor, 'red')
  assert.equal(loaded.settings.popup.fontColor, SETTINGS_V2_DEFAULTS.popup.fontColor)
  assert.equal(loaded.settings.popup.fontSizePt, SETTINGS_V2_DEFAULTS.popup.fontSizePt)
  assert.equal(loaded.settings.translation.providerId, 'deepl-free')
  assert.equal(loaded.settings.translation.targetLanguage, 'ja')
  assert.equal(loaded.migrationNeeded, true)

  await migrateAndPersistSettingsV2(storage)
  assert.equal(
    storage.sync.items[SETTINGS_STORAGE.settings.key].interface.language,
    'auto'
  )
  assert.equal(storage.sync.setCalls.length, 1)
})

test('keeps API credentials out of sync when saving v2 settings', async () => {
  const storage = createStorage({legacy_key: 'keep-me'})
  const result = await saveSettingsV2(storage, {
    settings: {
      ...SETTINGS_V2_DEFAULTS,
      translation: {
        ...SETTINGS_V2_DEFAULTS.translation,
        enabled: true
      }
    },
    secrets: {
      schemaVersion: 2,
      providers: {
        'deepl-free': {apiKey: 'local-only-secret'}
      }
    }
  })

  const syncPayload = storage.sync.setCalls[0]
  const localPayload = storage.local.setCalls[0]
  assert.equal(storage.sync.items.legacy_key, 'keep-me')
  assert.equal('apiKey' in syncPayload, false)
  assert.equal('deepl_auth_key' in syncPayload, false)
  assert.equal(
    localPayload[SETTINGS_STORAGE.secrets.key].providers['deepl-free'].apiKey,
    'local-only-secret'
  )
  assert.equal(result.settings.translation.enabled, true)
})

test('surfaces sync and local write failures to the caller', async () => {
  const syncFailure = createStorage({}, {}, {
    sync: {failSet: new Error('sync unavailable')}
  })
  await assert.rejects(
    saveSettingsV2(syncFailure, {}),
    /sync unavailable/
  )

  const localFailure = createStorage({}, {}, {
    local: {failSet: new Error('local unavailable')}
  })
  await assert.rejects(
    saveSettingsV2(localFailure, {}),
    /local unavailable/
  )
  assert.equal(localFailure.sync.setCalls.length, 1)
  assert.equal(localFailure.sync.removeCalls.length, 0)
})

test('reports legacy cleanup failures after local credentials are persisted', async () => {
  const storage = createStorage({
    deepl_auth_key: 'legacy-secret'
  }, {}, {
    sync: {failRemove: new Error('legacy cleanup unavailable')}
  })

  await assert.rejects(
    saveSettingsV2(storage, {
      secrets: {
        schemaVersion: 2,
        providers: {
          'deepl-free': {apiKey: 'local-secret'}
        }
      }
    }),
    /legacy cleanup unavailable/
  )
  assert.equal(
    storage.local.items[SETTINGS_STORAGE.secrets.key].providers['deepl-free'].apiKey,
    'local-secret'
  )
  assert.equal(storage.sync.items.deepl_auth_key, 'legacy-secret')
})

test('tracks draft changes separately from persisted settings for unload warnings', () => {
  const persisted = {
    settings: {popup: {fontSizePt: 11}},
    secrets: {providers: {}}
  }
  const draft = {
    settings: {popup: {fontSizePt: 11}},
    secrets: {providers: {}}
  }

  assert.equal(hasPendingSettingsChanges(persisted, draft), false)
  assert.equal(shouldWarnBeforeUnload(false), false)

  draft.settings.popup.fontSizePt = 14
  assert.equal(hasPendingSettingsChanges(persisted, draft), true)
  assert.equal(shouldWarnBeforeUnload(true), true)
})
