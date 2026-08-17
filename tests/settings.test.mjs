import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DEFAULT_OPTIONS,
  createOptionForm,
  getDefaultSettings,
  normalizeSetting,
  normalizeSettings,
  optionFormFromSettings,
  SETTINGS_SCHEMA,
  settingsFromOptionForm,
  STORAGE_DEFAULTS
} from '../src/settings.mjs'
import { loadSettings, saveSettings } from '../src/settings-storage.mjs'

class FakeSyncStorage {
  constructor(items = {}) {
    this.items = {...items}
    this.getCalls = []
    this.setCalls = []
  }

  get(defaults, callback) {
    this.getCalls.push({...defaults})
    callback({...defaults, ...this.items})
  }

  set(values, callback) {
    this.setCalls.push({...values})
    this.items = {...this.items, ...values}
    callback?.()
  }
}

function settingDefaultsFromSchema(field) {
  return Object.fromEntries(SETTINGS_SCHEMA.map(definition => [
    definition[field],
    definition.defaultValue
  ]))
}

test('derives storage and legacy defaults from one settings schema', () => {
  assert.deepEqual(STORAGE_DEFAULTS, settingDefaultsFromSchema('key'))
  assert.deepEqual(DEFAULT_OPTIONS, settingDefaultsFromSchema('optionKey'))
  assert.deepEqual(getDefaultSettings(), STORAGE_DEFAULTS)
})

test('normalizes setting types and falls back damaged values', () => {
  assert.deepEqual(normalizeSettings({
    dclick: 'false',
    dclick_trigger_key: ' alt ',
    dclick_speed: '300',
    drag: 'damaged',
    drag_trigger_key: 'unsupported',
    translate: 1,
    translate_trigger_key: null,
    deepl_auth_key: '  secret  ',
    popup_bgcolor: '  red  ',
    popup_fontcolor: '',
    popup_fontsize: 15,
    use_deny_list: '0',
    safe_urls: ' example.com, naver.com '
  }), {
    dclick: false,
    dclick_trigger_key: 'alt',
    dclick_speed: '300',
    drag: true,
    drag_trigger_key: 'ctrl',
    translate: true,
    translate_trigger_key: 'ctrlalt',
    deepl_auth_key: 'secret',
    popup_bgcolor: 'red',
    popup_fontcolor: '#000000',
    popup_fontsize: '11',
    use_deny_list: false,
    safe_urls: 'example.com, naver.com'
  })

  assert.equal(normalizeSetting('dclick_speed', 'not-a-number'), 400)
  assert.equal(normalizeSetting('dclick', 'not-a-boolean'), true)
  assert.equal(normalizeSetting('safe_urls', ''), '')
  assert.equal(normalizeSetting('unknown_key', 'value'), undefined)
})

test('keeps existing valid storage values compatible', () => {
  const existing = {
    ...STORAGE_DEFAULTS,
    dclick: false,
    dclick_speed: '500',
    popup_fontsize: '13',
    safe_urls: null
  }

  const normalized = normalizeSettings(existing)
  assert.equal(normalized.dclick, false)
  assert.equal(normalized.dclick_speed, '500')
  assert.equal(normalized.popup_fontsize, '13')
  assert.equal(normalized.safe_urls, null)
})

test('maps the shared storage contract to the existing Options form shape', () => {
  const defaults = createOptionForm()
  assert.equal(defaults.dClick, true)
  assert.equal(defaults.dClickSpeed, 400)
  assert.equal(defaults.safeURLs, null)

  const form = optionFormFromSettings({
    ...STORAGE_DEFAULTS,
    dclick: false,
    dclick_speed: '300',
    popup_bgcolor: 'red'
  })
  assert.equal(form.dClick, false)
  assert.equal(form.dClickSpeed, '300')
  assert.equal(form.popupBGColor, 'red')

  const storageValues = settingsFromOptionForm({
    ...defaults,
    dClick: false,
    dClickSpeed: '200',
    useDenyList: true,
    safeURLs: 'example.com'
  })
  assert.equal(storageValues.dclick, false)
  assert.equal(storageValues.dclick_speed, '200')
  assert.equal(storageValues.use_deny_list, true)
  assert.equal(storageValues.safe_urls, 'example.com')
})

test('loads normalized settings without writing defaults back', () => {
  const syncStorage = new FakeSyncStorage({
    dclick: 'invalid',
    dclick_speed: '300',
    popup_fontsize: ' 15 '
  })
  const loaded = []

  loadSettings({sync: syncStorage}, items => loaded.push(items))

  assert.equal(syncStorage.getCalls.length, 1)
  assert.deepEqual(syncStorage.getCalls[0], STORAGE_DEFAULTS)
  assert.equal(loaded.length, 1)
  assert.equal(loaded[0].dclick, true)
  assert.equal(loaded[0].dclick_speed, '300')
  assert.equal(loaded[0].popup_fontsize, '15')
  assert.equal(syncStorage.setCalls.length, 0)
})

test('saves only known normalized settings and preserves unrelated storage keys', () => {
  const syncStorage = new FakeSyncStorage({legacy_key: 'keep-me'})
  let callbackCalled = false

  const normalized = saveSettings({sync: syncStorage}, {
    ...STORAGE_DEFAULTS,
    dclick: 'false',
    dclick_speed: 'not-a-number',
    unknown_key: 'ignore-me'
  }, () => {
    callbackCalled = true
  })

  assert.equal(callbackCalled, true)
  assert.equal(normalized.dclick, false)
  assert.equal(normalized.dclick_speed, 400)
  assert.equal(syncStorage.setCalls.length, 1)
  assert.deepEqual(syncStorage.setCalls[0], normalized)
  assert.equal(syncStorage.items.legacy_key, 'keep-me')
  assert.equal(syncStorage.setCalls[0].unknown_key, undefined)
})
