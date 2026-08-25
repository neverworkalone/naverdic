import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DEFAULT_OPTIONS,
  normalizeSetting,
  normalizeSettings,
  SETTINGS_SCHEMA,
  STORAGE_DEFAULTS
} from '../src/settings.mjs'

function settingDefaultsFromSchema(field) {
  return Object.fromEntries(SETTINGS_SCHEMA.map(definition => [
    definition[field],
    definition.defaultValue
  ]))
}

test('derives storage and legacy defaults from one settings schema', () => {
  assert.deepEqual(STORAGE_DEFAULTS, settingDefaultsFromSchema('key'))
  assert.deepEqual(DEFAULT_OPTIONS, settingDefaultsFromSchema('optionKey'))
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
