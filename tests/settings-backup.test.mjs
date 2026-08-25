import assert from 'node:assert/strict'
import test from 'node:test'

import {
  SETTINGS_BACKUP_FILE_NAME,
  createSettingsBackup,
  parseSettingsBackup,
  serializeSettingsBackup
} from '../src/settings-backup.mjs'
import {
  createDefaultSecretsV2,
  createInitialSettingsV2
} from '../src/settings-v2.mjs'

test('creates a portable backup with settings and local secrets', () => {
  const settings = createInitialSettingsV2()
  settings.dictionary.doubleClick.speedMs = 300
  settings.sites.denyList = ['example.com']
  const secrets = createDefaultSecretsV2()
  secrets.providers['deepl-free'] = {apiKey: 'local-key'}

  const backup = createSettingsBackup(settings, secrets, '2026-08-21T00:00:00.000Z')
  const serialized = serializeSettingsBackup(settings, secrets, '2026-08-21T00:00:00.000Z')

  assert.equal(SETTINGS_BACKUP_FILE_NAME, 'naverdic-settings-backup.json')
  assert.equal(backup.schemaVersion, 2)
  assert.equal(backup.formatVersion, 1)
  assert.equal(backup.exportedAt, '2026-08-21T00:00:00.000Z')
  assert.equal(backup.settings.dictionary.doubleClick.speedMs, 300)
  assert.deepEqual(backup.secrets.providers['deepl-free'], {apiKey: 'local-key'})
  assert.equal('providers' in backup.settings, false)
  assert.deepEqual(JSON.parse(serialized), backup)
})

test('parses and normalizes a backup without changing the current schema contract', () => {
  const parsed = parseSettingsBackup(JSON.stringify({
    formatVersion: 1,
    schemaVersion: 2,
    settings: {
      popup: {backgroundColor: '#abcdef'},
      dictionary: {doubleClick: {speedMs: '300'}, drag: {enabled: false}}
    },
    secrets: {
      providers: {'deepl-free': {apiKey: 'local-key'}}
    }
  }))

  assert.equal(parsed.settings.popup.backgroundColor, '#abcdef')
  assert.equal(parsed.settings.dictionary.doubleClick.speedMs, 300)
  assert.equal(parsed.settings.dictionary.drag.enabled, false)
  assert.equal(parsed.settings.dictionary.drag.triggerKey, 'alt')
  assert.deepEqual(parsed.secrets.providers['deepl-free'], {apiKey: 'local-key'})
})

test('rejects malformed or unsupported backups before applying them', () => {
  assert.throws(() => parseSettingsBackup('{'), /valid JSON/)
  assert.throws(() => parseSettingsBackup('{}'), /settings object/)
  assert.throws(() => parseSettingsBackup({formatVersion: 2, settings: {}}), /format is not supported/)
  assert.throws(() => parseSettingsBackup({schemaVersion: 1, settings: {}}), /schema is not supported/)
  assert.throws(() => parseSettingsBackup({settings: {}, secrets: []}), /secrets must be an object/)
})
