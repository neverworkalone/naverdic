import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {fileURLToPath} from 'node:url'

import {
  SETTINGS_MENU,
  SETTINGS_PAGE_IDS,
  SETTINGS_SCHEMA_VERSION,
  SETTINGS_SCHEMA_V2,
  SETTINGS_STORAGE,
  SETTINGS_V2_DEFAULTS,
  createDefaultSecretsV2,
  createDefaultSettingsV2,
  normalizeSecretsV2,
  normalizeSettingsV2
} from '../src/settings-v2.mjs'
import {
  LEGACY_SETTING_KEYS,
  V66_TO_V2_RULES,
  migrateV66ToV2
} from '../src/settings-migration-v2.mjs'
import {
  DEFAULT_PROVIDER_ID,
  PROVIDER_ADAPTERS,
  PROVIDER_AUTH_MODES,
  PROVIDER_EXECUTION_CONTEXTS,
  PROVIDER_KINDS,
  PROVIDER_SOURCES,
  getProviderPreset,
  isProviderDefinition,
  normalizeProviderDefinition
} from '../src/translation-provider.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

test('defines stable settings pages, ordering, and advanced actions', () => {
  assert.deepEqual(
    SETTINGS_MENU.map(item => item.id),
    ['dictionary', 'translation', 'popup', 'sites', 'advanced', 'help']
  )
  assert.deepEqual(
    SETTINGS_MENU.map(item => item.order),
    [10, 20, 30, 40, 50, 90]
  )

  const advanced = SETTINGS_MENU.find(item => item.id === SETTINGS_PAGE_IDS.ADVANCED)
  const help = SETTINGS_MENU.find(item => item.id === SETTINGS_PAGE_IDS.HELP)
  assert.deepEqual(advanced.actions, ['reset'])
  assert.equal(help.kind, 'external')
  assert.equal(help.external, true)
  assert.match(help.url, /^https:\/\//)
})

test('defines the v2 storage split and nested settings defaults', () => {
  assert.equal(SETTINGS_SCHEMA_VERSION, 2)
  assert.deepEqual(SETTINGS_STORAGE, {
    settings: {area: 'sync', key: 'naverdic.settings.v2'},
    secrets: {area: 'local', key: 'naverdic.secrets.v2'}
  })
  assert.equal(SETTINGS_V2_DEFAULTS.translation.providerId, DEFAULT_PROVIDER_ID)
  assert.equal(SETTINGS_V2_DEFAULTS.translation.targetLanguage, 'ko')
  assert.equal(SETTINGS_V2_DEFAULTS.popup.fontSizePt, 11)
  assert.ok(SETTINGS_SCHEMA_V2.some(field => field.path === 'customProviders'))
  assert.ok(SETTINGS_SCHEMA_V2.some(field => field.path === 'translation.targetLanguage'))
})

test('normalizes v2 values without accepting invalid enums or provider secrets', () => {
  const normalized = normalizeSettingsV2({
    schemaVersion: 99,
    interface: {language: 'fr'},
    dictionary: {
      doubleClick: {enabled: 'false', triggerKey: ' alt ', speedMs: '301.4'},
      drag: {enabled: '1', triggerKey: 'unsupported'}
    },
    popup: {backgroundColor: '  red  ', fontColor: '', fontSizePt: '-2'},
    sites: {denyListEnabled: 'true', denyList: ' https://www.Example.com/path, *.example.com '},
    translation: {
      enabled: 1,
      triggerKey: 'ctrlalt',
      providerId: 'Gemini/unsafe',
      targetLanguage: 'JA'
    },
    customProviders: {
      sample: {
        id: 'sample',
        name: 'Sample',
        kind: 'custom',
        apiKey: 'must-not-be-copied',
        endpoint: {url: 'https://example.com/translate', method: 'post'},
        auth: {
          mode: 'bearer',
          headerName: 'Authorization',
          prefix: 'Bearer ',
          secretRef: 'providers.sample.token'
        },
        request: {
          headers: {Accept: 'application/json'},
          bodyTemplate: {text: ['{{text}}'], target: '{{targetLanguage}}'},
          targetLanguagePath: 'target'
        },
        response: {textPath: 'data.text'}
      }
    }
  })

  assert.equal(normalized.schemaVersion, 2)
  assert.equal(normalized.interface.language, 'auto')
  assert.equal(normalized.dictionary.doubleClick.enabled, false)
  assert.equal(normalized.dictionary.doubleClick.triggerKey, 'alt')
  assert.equal(normalized.dictionary.doubleClick.speedMs, 301)
  assert.equal(normalized.dictionary.drag.enabled, true)
  assert.equal(normalized.dictionary.drag.triggerKey, 'ctrl')
  assert.equal(normalized.popup.backgroundColor, 'red')
  assert.equal(normalized.popup.fontColor, '#000000')
  assert.equal(normalized.popup.fontSizePt, 11)
  assert.deepEqual(normalized.sites.denyList, ['www.example.com', 'example.com'])
  assert.equal(normalized.translation.enabled, true)
  assert.equal(normalized.translation.providerId, 'deepl-free')
  assert.equal(normalized.translation.targetLanguage, 'ja')
  assert.equal(normalized.customProviders.sample.endpoint.method, 'POST')
  assert.equal(normalized.customProviders.sample.source, PROVIDER_SOURCES.CUSTOM)
  assert.equal(normalized.customProviders.sample.auth.secretRef, 'providers.sample.token')
  assert.equal('apiKey' in normalized.customProviders.sample, false)
  assert.equal('key' in normalized.customProviders.sample, false)

  const knownCustom = normalizeSettingsV2({
    translation: {providerId: 'sample'},
    customProviders: normalized.customProviders
  })
  assert.equal(knownCustom.translation.providerId, 'sample')
  assert.equal(
    normalizeSettingsV2({
      translation: {providerId: 'missing-provider'}
    }).translation.providerId,
    'deepl-free'
  )
})

test('creates independent default settings and local secret objects', () => {
  const settings = createDefaultSettingsV2()
  const secrets = createDefaultSecretsV2()
  settings.popup.backgroundColor = '#000000'
  secrets.providers.example = {apiKey: 'local-only'}

  assert.equal(SETTINGS_V2_DEFAULTS.popup.backgroundColor, '#FFF59D')
  assert.deepEqual(createDefaultSecretsV2(), {schemaVersion: 2, providers: {}})
})

test('provides normalized DeepL presets through the common provider model', () => {
  const provider = getProviderPreset('deepl-free')
  assert.equal(isProviderDefinition(provider), true)
  assert.equal(provider.kind, PROVIDER_KINDS.HTTP)
  assert.equal(provider.source, PROVIDER_SOURCES.PRESET)
  assert.equal(provider.endpoint.method, 'POST')
  assert.equal(provider.endpoint.url, 'https://api-free.deepl.com/v2/translate')
  assert.equal(provider.auth.mode, PROVIDER_AUTH_MODES.API_KEY)
  assert.equal(provider.auth.secretRef, 'providers.deepl-free.apiKey')
  assert.equal(provider.request.bodyTemplate.target_lang, '{{targetLanguage}}')
  assert.equal(provider.response.textPath, 'translations[0].text')
})

test('represents Chrome built-in Translator with a content-page execution boundary', () => {
  const provider = getProviderPreset('chrome-translator')

  assert.equal(isProviderDefinition(provider), true)
  assert.equal(provider.kind, PROVIDER_KINDS.BUILT_IN)
  assert.equal(provider.source, PROVIDER_SOURCES.PRESET)
  assert.equal(provider.endpoint, null)
  assert.equal(provider.execution.adapterId, PROVIDER_ADAPTERS.CHROME_TRANSLATOR)
  assert.equal(provider.execution.context, PROVIDER_EXECUTION_CONTEXTS.CONTENT_PAGE)
  assert.equal(provider.execution.globalName, 'Translator')
  assert.equal(provider.execution.requiresDocument, true)
  assert.equal(provider.execution.supportsWebWorker, false)
  assert.equal(provider.request.bodyTemplate, null)
  assert.equal(provider.auth.mode, PROVIDER_AUTH_MODES.NONE)

  assert.equal(
    normalizeSettingsV2({
      translation: {providerId: 'chrome-translator'}
    }).translation.providerId,
    'chrome-translator'
  )
})

test('normalizes a custom provider and drops credential-shaped input fields', () => {
  const provider = normalizeProviderDefinition({
    id: 'Custom API',
    name: 'Custom API',
    kind: 'custom',
    endpoint: {url: 'https://api.example.com/translate', method: 'patch'},
    auth: {mode: 'api-key', secretRef: 'providers.custom-api.apiKey'},
    request: {
      headers: [
        {name: 'Content-Type', value: 'application/json'},
        {
          name: 'Authorization',
          value: 'raw-secret',
          secretRef: 'providers.custom-api.apiKey'
        }
      ],
      bodyTemplate: {
        input: '{{text}}',
        apiKey: 'raw-secret',
        authorization: 'Bearer raw-secret',
        access_token: 'raw-secret',
        credentials: {token: 'raw-secret'},
        key: 'raw-secret',
        apikey: 'raw-secret',
        refreshToken: 'raw-secret'
      },
      textPath: 'input',
      targetLanguagePath: 'language'
    },
    response: {textPath: 'result.text'},
    key: 'do-not-persist',
    apiKey: 'do-not-persist',
    authorization: 'do-not-persist'
  })

  assert.equal(provider, null)

  const validProvider = normalizeProviderDefinition({
    id: 'custom-api',
    name: 'Custom API',
    kind: 'custom',
    endpoint: {url: 'https://api.example.com/translate', method: 'patch'},
    auth: {mode: 'api-key', secretRef: 'providers.custom-api.apiKey'},
    request: {
      headers: [
        {name: 'Content-Type', valueTemplate: 'application/json'},
        {
          name: 'Authorization',
          value: 'raw-secret',
          secretRef: 'providers.custom-api.apiKey'
        }
      ],
      bodyTemplate: {
        input: '{{text}}',
        apiKey: 'raw-secret',
        authorization: 'Bearer raw-secret',
        access_token: 'raw-secret',
        credentials: {token: 'raw-secret'},
        key: 'raw-secret',
        apikey: 'raw-secret',
        refreshToken: 'raw-secret'
      },
      textPath: 'input',
      targetLanguagePath: 'language'
    },
    response: {textPath: 'result.text'},
    key: 'do-not-persist',
    apiKey: 'do-not-persist',
    authorization: 'do-not-persist'
  })

  assert.equal(isProviderDefinition(validProvider), true)
  assert.equal(validProvider.endpoint.method, 'PATCH')
  assert.equal(validProvider.auth.secretRef, 'providers.custom-api.apiKey')
  assert.equal(validProvider.request.headers[0].valueTemplate, 'application/json')
  assert.deepEqual(validProvider.request.headers[1], {
    name: 'Authorization',
    valueTemplate: '{{secret}}',
    secretRef: 'providers.custom-api.apiKey'
  })
  assert.deepEqual(validProvider.request.bodyTemplate, {input: '{{text}}'})
  assert.equal('apiKey' in validProvider, false)
  assert.equal('key' in validProvider, false)
  assert.equal('authorization' in validProvider, false)
})

test('migrates every v6.6 setting and moves the DeepL key to local secrets', () => {
  const legacy = {
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
    safe_urls: ' https://www.Example.com/path, *.example.com; naver.com\n',
    unrelated_key: 'keep-outside-contract'
  }

  const result = migrateV66ToV2(legacy)

  assert.equal(result.schemaVersion, 2)
  assert.equal(result.sourceStorageArea, 'sync')
  assert.deepEqual(result.sourceKeys, LEGACY_SETTING_KEYS)
  assert.deepEqual(result.unknownKeys, ['unrelated_key'])
  assert.deepEqual(result.settings.dictionary, {
    doubleClick: {enabled: false, triggerKey: 'alt', speedMs: 300},
    drag: {enabled: false, triggerKey: 'ctrlalt'}
  })
  assert.deepEqual(result.settings.popup, {
    backgroundColor: '#123456',
    fontColor: '#ffffff',
    fontSizePt: 13
  })
  assert.deepEqual(result.settings.sites, {
    denyListEnabled: true,
    denyList: ['www.example.com', 'example.com', 'naver.com']
  })
  assert.deepEqual(result.settings.translation, {
    enabled: true,
    triggerKey: 'none',
    providerId: 'deepl-free',
    targetLanguage: 'ko'
  })
  assert.deepEqual(result.secrets, {
    schemaVersion: 2,
    providers: {'deepl-free': {apiKey: 'legacy-secret'}}
  })
  assert.equal('deepl_auth_key' in result.settings, false)
  assert.equal('deepl_auth_key' in result.secrets, false)
  assert.equal(legacy.deepl_auth_key, '  legacy-secret  ')
})

test('falls back only damaged v6.6 values while preserving valid values', () => {
  const result = migrateV66ToV2({
    dclick: 'damaged',
    dclick_speed: 'not-a-number',
    popup_fontsize: 0,
    translate_trigger_key: 'unsupported',
    popup_bgcolor: 'blue',
    safe_urls: 'example.com,example.com'
  })

  assert.equal(result.settings.dictionary.doubleClick.enabled, true)
  assert.equal(result.settings.dictionary.doubleClick.speedMs, 400)
  assert.equal(result.settings.popup.fontSizePt, 11)
  assert.equal(result.settings.translation.triggerKey, 'ctrlalt')
  assert.equal(result.settings.popup.backgroundColor, 'blue')
  assert.deepEqual(result.settings.sites.denyList, ['example.com'])
})

test('normalizes local secrets and never creates sync credential fields', () => {
  assert.deepEqual(normalizeSecretsV2({
    schemaVersion: 1,
    providers: {
      'deepl-free': {apiKey: '  secret  ', token: ''},
      empty: {apiKey: '  '},
      bad: 'not-an-object'
    },
    deepl_auth_key: 'legacy-secret'
  }), {
    schemaVersion: 2,
    providers: {'deepl-free': {apiKey: 'secret'}}
  })
})

test('publishes the shared Figma-derived token categories', () => {
  const tokens = fs.readFileSync(
    path.join(projectRoot, 'src/styles/tokens.css'),
    'utf8'
  )

  for (const token of [
    '--naverdic-color-surface-page',
    '--naverdic-color-border-popup',
    '--naverdic-space-2',
    '--naverdic-space-4',
    '--naverdic-space-6',
    '--naverdic-input-border-focus',
    '--naverdic-button-background-disabled',
    '--naverdic-card-background-selected'
  ]) {
    assert.match(tokens, new RegExp(`${token}:`))
  }

  assert.match(tokens, /--naverdic-color-surface-page:\s*#F5F6F8/)
  assert.match(tokens, /--naverdic-color-border-popup:\s*#E2E6EC/)
})

test('keeps the migration rule table complete with the v6.6 schema', () => {
  assert.deepEqual(Object.keys(V66_TO_V2_RULES).sort(), [...LEGACY_SETTING_KEYS].sort())
  assert.equal(V66_TO_V2_RULES.deepl_auth_key.transform, 'local-secret')
  assert.equal(V66_TO_V2_RULES.safe_urls.transform, 'domain-list')
})
