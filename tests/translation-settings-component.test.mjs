import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {fileURLToPath} from 'node:url'

import {
  canActivateTranslationProvider,
  getTranslationSettingsPanel,
  hasPendingTranslationChanges,
  isTranslationConnectionLocked,
  TRANSLATION_SETTINGS_PANELS
} from '../src/translation-settings-state.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const translationSettings = fs.readFileSync(
  path.join(projectRoot, 'src/components/TranslationSettings.vue'),
  'utf8'
)
const settingsShell = fs.readFileSync(
  path.join(projectRoot, 'src/components/SettingsShell.vue'),
  'utf8'
)
const settingsPage = fs.readFileSync(
  path.join(projectRoot, 'src/components/SettingsPage.vue'),
  'utf8'
)
const optionsApp = fs.readFileSync(
  path.join(projectRoot, 'src/options/App.vue'),
  'utf8'
)
const contentScript = fs.readFileSync(
  path.join(projectRoot, 'src/content.js'),
  'utf8'
)

test('switching providers selects the matching detail panel', () => {
  assert.equal(
    getTranslationSettingsPanel('chrome-translator'),
    TRANSLATION_SETTINGS_PANELS.CHROME
  )
  assert.equal(
    getTranslationSettingsPanel('deepl-free'),
    TRANSLATION_SETTINGS_PANELS.PRESET
  )
  assert.equal(
    getTranslationSettingsPanel('my-api', {
      'my-api': {source: 'custom'}
    }),
    TRANSLATION_SETTINGS_PANELS.CUSTOM
  )
  assert.match(translationSettings, /v-if="selectedIsChrome"/)
  assert.match(translationSettings, /v-else-if="selectedPresetId"/)
  assert.match(translationSettings, /<form v-else class="translation-custom-editor"/)
})

test('connection-test controls are locked while a request is in flight', () => {
  assert.equal(isTranslationConnectionLocked({connectionStatus: 'testing'}), true)
  assert.equal(isTranslationConnectionLocked({connectionStatus: 'success'}), false)
  assert.equal(isTranslationConnectionLocked({globallyDisabled: true}), true)
  assert.ok((translationSettings.match(/connectionControlsDisabled\(/g) || []).length >= 4)
  assert.match(translationSettings, /data-testid="settings-custom-test"/)
  assert.match(translationSettings, /data-testid="settings-translation-test"/)
})

test('Custom activation remains blocked when host permission is denied', () => {
  const base = {
    panel: TRANSLATION_SETTINGS_PANELS.CUSTOM,
    connectionStatus: 'success',
    connectionMatches: true
  }
  assert.equal(canActivateTranslationProvider(base), false)
  assert.equal(canActivateTranslationProvider({
    ...base,
    permissionAllowed: true
  }), true)
  assert.match(translationSettings, /permissionStates\[selectedProviderId\] === 'allowed'/)
  assert.match(translationSettings, /canActivateSelected\(\)/)
})

test('Custom editor dirty state reaches the global save and unload boundary', () => {
  assert.equal(hasPendingTranslationChanges(false, false), false)
  assert.equal(hasPendingTranslationChanges(false, true), true)
  assert.equal(hasPendingTranslationChanges(true, false), true)
  assert.match(translationSettings, /onPendingChange/)
  assert.match(translationSettings, /props\.onPendingChange\?\.\(next\)/)
  assert.match(settingsShell, /translationEditorDirty/)
  assert.match(settingsShell, /hasPendingTranslationChanges\(/)
  assert.match(settingsShell, /shouldWarnBeforeUnload\(hasPendingChanges\.value\)/)
  assert.match(settingsPage, /on-pending-change="translationPendingChange"/)
  assert.match(optionsApp, /translation-pending-change="translationPendingChange"/)
})

test('content translation waits for availability before installing the mouseup path', () => {
  assert.match(contentScript, /prepareChromeTranslatorRuntime\(\)\.refreshAvailability/)
  assert.match(contentScript, /finally\(bindInteractionController\)/)
  assert.match(contentScript, /Translator\.create\(\) before its first await/)
})
