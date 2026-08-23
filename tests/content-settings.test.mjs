import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createContentSettingsLifecycle,
  normalizeContentRuntimeSettings
} from '../src/content-settings.mjs'
import {
  SETTINGS_STORAGE,
  createDefaultSecretsV2,
  createDefaultSettingsV2
} from '../src/settings-v2.mjs'

class FakeStorage {
  constructor(syncValues = {}, localValues = {}) {
    this.syncValues = syncValues
    this.localValues = localValues
    this.listeners = new Set()
    this.onChanged = {
      addListener: listener => this.listeners.add(listener),
      removeListener: listener => this.listeners.delete(listener)
    }
    this.sync = {
      get: (_keys, callback) => callback(this.syncValues)
    }
    this.local = {
      get: (_keys, callback) => callback(this.localValues)
    }
  }

  emit(changes, areaName = 'sync') {
    this.listeners.forEach(listener => listener(changes, areaName))
  }
}

test('maps v7 Chrome settings to content runtime without exposing unrelated local credentials', () => {
  const settings = createDefaultSettingsV2()
  settings.translation.providerId = 'chrome-translator'
  settings.translation.enabled = true
  const secrets = createDefaultSecretsV2()
  secrets.providers['deepl-free'] = {apiKey: 'deep-secret'}

  const runtime = normalizeContentRuntimeSettings({settings, secrets})
  assert.equal(runtime.translationProvider.id, 'chrome-translator')
  assert.equal(runtime.translationCredential, '')
  assert.equal(runtime.translationTargetLanguage, 'ko')
  assert.equal(runtime.deepl_auth_key, '')
  assert.equal(JSON.stringify(runtime).includes('deep-secret'), false)
})

test('reads split sync/local envelopes and follows provider changes once per lifecycle', async () => {
  const settings = createDefaultSettingsV2()
  settings.translation.providerId = 'deepl-free'
  const secrets = createDefaultSecretsV2()
  secrets.providers['deepl-free'] = {apiKey: 'local-only-key'}
  const storage = new FakeStorage({[SETTINGS_STORAGE.settings.key]: settings}, {
    [SETTINGS_STORAGE.secrets.key]: secrets
  })
  const applied = []
  const lifecycle = createContentSettingsLifecycle({
    storage,
    onApply: value => applied.push(value)
  })

  lifecycle.start()
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(applied.length, 1)
  assert.equal(applied[0].translationProvider.id, 'deepl-free')
  assert.equal(applied[0].translationCredential, 'local-only-key')
  assert.equal(storage.listeners.size, 1)

  const next = createDefaultSettingsV2()
  next.translation.providerId = 'chrome-translator'
  storage.syncValues[SETTINGS_STORAGE.settings.key] = next
  storage.emit({[SETTINGS_STORAGE.settings.key]: {newValue: next}})
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(applied.at(-1).translationProvider.id, 'chrome-translator')
  assert.equal(applied.at(-1).translationCredential, '')

  lifecycle.stop()
  assert.equal(storage.listeners.size, 0)
})

test('passes the selected Gemini model through the content provider definition', () => {
  const settings = createDefaultSettingsV2()
  settings.translation.providerId = 'gemini'
  settings.translation.geminiModel = 'gemini-2.5-flash'
  const runtime = normalizeContentRuntimeSettings({settings, secrets: createDefaultSecretsV2()})

  assert.equal(runtime.translationProvider.model, 'gemini-2.5-flash')
  assert.match(runtime.translationProvider.endpoint.url, /models\/gemini-2\.5-flash:generateContent$/)
})
