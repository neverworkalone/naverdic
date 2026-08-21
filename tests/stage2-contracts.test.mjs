import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {fileURLToPath} from 'node:url'

import {
  SETTINGS_MENU,
  SETTINGS_NAVIGATION,
  SETTINGS_PAGE_IDS,
  SETTINGS_SCHEMA_VERSION,
  SETTINGS_SCHEMA_V2,
  SETTINGS_STORAGE,
  SETTINGS_V2_DEFAULTS,
  createDefaultSecretsV2,
  createDefaultSettingsV2,
  createInitialSettingsV2,
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

function assertLocaleMessages(locale, keys) {
  for (const key of keys) {
    assert.equal(typeof locale[key]?.message, 'string')
    assert.notEqual(locale[key].message.trim(), '')
  }
}

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

test('maps the finalized Figma navigation to stable settings sections', () => {
  assert.deepEqual(
    SETTINGS_NAVIGATION.map(item => item.id),
    ['appearance', 'double-click', 'behavior', 'translation-service', 'blocked-sites', 'advanced', 'help']
  )
  assert.equal(
    SETTINGS_NAVIGATION.find(item => item.id === 'double-click').pageId,
    SETTINGS_PAGE_IDS.DICTIONARY
  )
  assert.equal(
    SETTINGS_NAVIGATION.find(item => item.id === 'behavior').pageId,
    SETTINGS_PAGE_IDS.DICTIONARY
  )
  const doubleClick = SETTINGS_NAVIGATION.find(item => item.id === 'double-click')
  const drag = SETTINGS_NAVIGATION.find(item => item.id === 'behavior')
  assert.equal(doubleClick.previewTitleKey, 'SETTINGS_PREVIEW_DOUBLE_CLICK_TITLE')
  assert.equal(doubleClick.previewDescriptionKey, 'SETTINGS_PREVIEW_DOUBLE_CLICK_DESCRIPTION')
  assert.equal(drag.previewTitleKey, 'SETTINGS_PREVIEW_DRAG_TITLE')
  assert.equal(drag.previewDescriptionKey, 'SETTINGS_PREVIEW_DRAG_DESCRIPTION')

  const help = SETTINGS_NAVIGATION.find(item => item.id === 'help')
  const advanced = SETTINGS_NAVIGATION.find(item => item.id === 'advanced')
  assert.equal(help.kind, 'page')
  assert.equal(help.external, undefined)
  assert.match(help.url, /^https:\/\//)
  assert.deepEqual(advanced.actions, ['reset'])
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
  assert.equal(SETTINGS_V2_DEFAULTS.dictionary.drag.triggerKey, 'ctrl')
  assert.equal(createInitialSettingsV2().dictionary.drag.triggerKey, 'none')
  assert.equal(SETTINGS_SCHEMA_V2.some(field => field.path === 'customProviders'), false)
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
  assert.equal('customProviders' in normalized, false)
  assert.deepEqual(normalizeSecretsV2({
    providers: {
      sample: {token: 'legacy-custom-secret'},
      'deepl-free': {apiKey: 'deepl-secret'}
    }
  }), {
    schemaVersion: 2,
    providers: {'deepl-free': {apiKey: 'deepl-secret'}}
  })

  const legacyCustom = normalizeSettingsV2({
    translation: {providerId: 'sample'},
    customProviders: {sample: {id: 'sample', source: 'custom'}}
  })
  assert.equal(legacyCustom.translation.providerId, 'deepl-free')
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

test('keeps the official Chrome Translator display name and translation panel boundary', () => {
  const ko = JSON.parse(fs.readFileSync(path.join(projectRoot, 'src/_locales/ko/messages.json'), 'utf8'))
  const en = JSON.parse(fs.readFileSync(path.join(projectRoot, 'src/_locales/en/messages.json'), 'utf8'))
  assertLocaleMessages(ko, [
    'SETTINGS_TRANSLATION_CHROME_NAME',
    'SETTINGS_SECTION_POPUP_APPEARANCE',
    'SETTINGS_SECTION_POPUP_APPEARANCE_DESCRIPTION',
    'SETTINGS_NAV_BEHAVIOR',
    'SETTINGS_PAGE_BEHAVIOR_TITLE',
    'SETTINGS_PAGE_BEHAVIOR_DESCRIPTION',
    'SETTINGS_SECTION_DOUBLE_CLICK',
    'SETTINGS_SECTION_DOUBLE_CLICK_DESCRIPTION',
    'SETTINGS_FIELD_DOUBLE_CLICK_ENABLED',
    'SETTINGS_FIELD_TRIGGER_KEY',
    'SETTINGS_FIELD_DOUBLE_CLICK_TRIGGER_HINT',
    'SETTINGS_FIELD_DOUBLE_CLICK_SPEED',
    'SETTINGS_FIELD_DOUBLE_CLICK_SPEED_HINT',
    'SETTINGS_SHELL_PREVIEW_TITLE',
    'SETTINGS_SHELL_PREVIEW_DESCRIPTION',
    'SETTINGS_PREVIEW_DOUBLE_CLICK_TITLE',
    'SETTINGS_PREVIEW_DOUBLE_CLICK_DESCRIPTION',
    'SETTINGS_PREVIEW_DRAG_TITLE',
    'SETTINGS_PREVIEW_DRAG_DESCRIPTION',
    'SETTINGS_PREVIEW_FLOW_LABEL',
    'SETTINGS_PREVIEW_DOUBLE_CLICK_STEP_1',
    'SETTINGS_PREVIEW_DOUBLE_CLICK_STEP_2',
    'SETTINGS_PREVIEW_DOUBLE_CLICK_STEP_3',
    'SETTINGS_PREVIEW_DOUBLE_CLICK_STEP_1_DESCRIPTION',
    'SETTINGS_PREVIEW_DOUBLE_CLICK_STEP_2_DESCRIPTION',
    'SETTINGS_PREVIEW_DOUBLE_CLICK_STEP_3_DESCRIPTION',
    'SETTINGS_SECTION_DRAG',
    'SETTINGS_SECTION_DRAG_DESCRIPTION',
    'SETTINGS_FIELD_DRAG_ENABLED',
    'SETTINGS_FIELD_DRAG_TRIGGER_HINT',
    'SETTINGS_PREVIEW_DRAG_STEP_1',
    'SETTINGS_PREVIEW_DRAG_STEP_1_DESCRIPTION',
    'SETTINGS_PREVIEW_DRAG_STEP_2',
    'SETTINGS_PREVIEW_DRAG_STEP_2_DESCRIPTION',
    'SETTINGS_PREVIEW_DRAG_STEP_3',
    'SETTINGS_PREVIEW_DRAG_STEP_3_DESCRIPTION',
    'SETTINGS_PREVIEW_DRAG_STEP_4',
    'SETTINGS_PREVIEW_DRAG_STEP_4_DESCRIPTION'
  ])
  assert.equal(en.SETTINGS_TRANSLATION_CHROME_NAME.message.includes('Translator API'), true)
  assert.equal(
    en.SETTINGS_FIELD_DOUBLE_CLICK_SPEED_HINT.message,
    'Longer intervals recognize slower double-clicks.'
  )

  const shell = fs.readFileSync(path.join(projectRoot, 'src/components/SettingsShell.vue'), 'utf8')
  assert.match(shell, /settings-shell--double-click/)
  assert.match(shell, /\.settings-shell--double-click \{[\s\S]*width: min\(1200px, 100%\)/)
  assert.match(shell, /\.settings-shell--double-click \{[\s\S]*margin: 16px auto/)
  assert.match(shell, /\.settings-shell--double-click \{[\s\S]*border: 1px solid var\(--naverdic-settings-border\)/)
  assert.match(shell, /\.settings-shell--double-click \{[\s\S]*border-radius: var\(--naverdic-settings-radius\)/)
  assert.match(shell, /\.settings-shell--double-click \{[\s\S]*box-shadow: var\(--naverdic-settings-shadow\)/)
  assert.match(shell, /settings-content--translation/)
  assert.match(shell, /settings-content--double-click/)
  assert.match(shell, /settings-shell--drag/)
  assert.match(shell, /\.settings-shell--drag \{[\s\S]*margin: 16px auto/)
  assert.match(shell, /\.settings-shell--drag \{[\s\S]*border: 1px solid var\(--naverdic-settings-border\)/)
  assert.match(shell, /\.settings-shell--drag \{[\s\S]*border-radius: var\(--naverdic-settings-radius\)/)
  assert.match(shell, /\.settings-shell--drag \{[\s\S]*box-shadow: var\(--naverdic-settings-shadow\)/)
  assert.equal(shell.includes('.settings-shell--double-click .settings-header'), false)
  assert.equal(shell.includes('.settings-shell--drag .settings-header'), false)
  assert.match(shell, /settings-content--drag/)
  assert.match(shell, /currentNavigation\.previewTitleKey/)
  assert.match(shell, /currentNavigation\.previewDescriptionKey/)
  assert.match(shell, /grid-template-columns: 556px 300px;\s*gap: 28px/)
  assert.match(shell, /currentNavigation\.id !== 'translation-service'/)

  const appearancePage = fs.readFileSync(path.join(projectRoot, 'src/components/SettingsPage.vue'), 'utf8')
  assert.match(appearancePage, /settings-appearance-guidance/)
  assert.match(appearancePage, /\.settings-page\[data-page-id='appearance'\] \{[\s\S]*margin-top: 18px/)
  assert.match(appearancePage, /\.settings-appearance-guidance \{[\s\S]*border: 1px solid var\(--naverdic-settings-border\)/)
  assert.match(appearancePage, /\.settings-inline-link:hover \.settings-inline-link__label \{[\s\S]*text-decoration: underline/)
  assert.equal(appearancePage.includes('.settings-inline-link:hover {'), false)
  assert.match(appearancePage, /settings-double-click-card/)
  assert.match(appearancePage, /\.settings-double-click-card \{[\s\S]*height: 316px/)
  assert.match(appearancePage, /\.settings-double-click-divider--heading \{\s*top: 89px/)
  assert.match(appearancePage, /\.settings-double-click-divider--toggle \{\s*top: 149px/)
  assert.match(appearancePage, /\.settings-double-click-divider--trigger \{\s*top: 221px/)
  assert.match(appearancePage, /\.settings-double-click-divider--speed \{\s*top: 293px/)
  assert.match(appearancePage, /\.settings-double-click-select \{[\s\S]*width: 240px/)
  assert.match(appearancePage, /settings-drag-card/)
  assert.match(appearancePage, /\.settings-drag-card \{[\s\S]*height: 244px/)
  assert.match(appearancePage, /\.settings-drag-divider--heading \{\s*top: 89px/)
  assert.match(appearancePage, /\.settings-drag-divider--toggle \{\s*top: 149px/)
  assert.match(appearancePage, /\.settings-drag-divider--trigger \{\s*top: 221px/)
  assert.match(appearancePage, /\.settings-drag-select \{[\s\S]*width: 240px/)
  assert.equal(appearancePage.includes('settings-behavior-form'), false)

  const preview = fs.readFileSync(path.join(projectRoot, 'src/components/SettingsPreview.vue'), 'utf8')
  assert.match(preview, /settings-live-preview--appearance/)
  assert.match(preview, /\.settings-live-preview--appearance \{ margin-top: 18px; \}/)
  assert.match(preview, /settings-live-preview--double-click/)
  assert.match(preview, /\.settings-live-preview--double-click \{ height: 260px; min-height: 260px; \}/)
  assert.match(preview, /\.settings-guide-preview--double-click \{ height: 258px; min-height: 258px; \}/)
  assert.match(preview, /\.settings-guide-preview--double-click li:nth-child\(1\) \{ top: 75px; \}/)
  assert.match(preview, /\.settings-guide-preview--double-click li:nth-child\(2\) \{ top: 135px; \}/)
  assert.match(preview, /\.settings-guide-preview--double-click li:nth-child\(3\) \{ top: 195px; \}/)
  assert.match(preview, /\.settings-guide-preview--double-click li p strong \{ color: #344054; font-size: 13px; font-weight: 700; line-height: 20px; \}/)
  assert.match(preview, /\.settings-guide-preview--double-click li p span \{ color: var\(--naverdic-settings-text-muted\); font-size: 11px; line-height: 18px; \}/)
  assert.match(preview, /settings-live-preview--drag/)
  assert.match(preview, /\.settings-live-preview--drag \{ height: 308px; min-height: 308px; \}/)
  assert.match(preview, /\.settings-guide-preview--drag \{ height: 306px; min-height: 306px; \}/)
  assert.match(preview, /\.settings-guide-preview--drag li:nth-child\(1\) \{ top: 23px; \}/)
  assert.match(preview, /\.settings-guide-preview--drag li:nth-child\(4\) \{ top: 245px; \}/)
  assert.equal(preview.includes('SETTINGS_PREVIEW_BEHAVIOR_STEP_'), false)
})

test('rejects legacy custom provider definitions', () => {
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

  assert.equal(validProvider, null)
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
  assert.equal(result.settings.dictionary.drag.triggerKey, 'none')
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
    '--naverdic-card-background-selected',
    '--naverdic-settings-chip-border'
  ]) {
    assert.match(tokens, new RegExp(`${token}:`))
  }

  assert.match(tokens, /--naverdic-color-surface-page:\s*#F5F6F8/)
  assert.match(tokens, /--naverdic-color-border-popup:\s*#E2E6EC/)
  assert.match(tokens, /--naverdic-settings-chip-border:\s*#CBD7E5/)
})

test('keeps the migration rule table complete with the v6.6 schema', () => {
  assert.deepEqual(Object.keys(V66_TO_V2_RULES).sort(), [...LEGACY_SETTING_KEYS].sort())
  assert.equal(V66_TO_V2_RULES.deepl_auth_key.transform, 'local-secret')
  assert.equal(V66_TO_V2_RULES.safe_urls.transform, 'domain-list')
})
