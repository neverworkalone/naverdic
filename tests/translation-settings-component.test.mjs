import assert from 'node:assert/strict'
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'
import {after, before, test} from 'node:test'
import {JSDOM} from 'jsdom'
import {compileScript, parse} from '@vue/compiler-sfc'

import {
  canActivateTranslationProvider,
  getTranslationSettingsPanel,
  hasPendingTranslationChanges,
  isTranslationConnectionLocked,
  TRANSLATION_SETTINGS_PANELS
} from '../src/translation-settings-state.mjs'
import {
  createDefaultSecretsV2,
  createDefaultSettingsV2
} from '../src/settings-v2.mjs'
import {normalizeProviderDefinition} from '../src/translation-provider.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
let tempRoot
let compiledModuleId = 0
let dom
let mount
let flushPromises
let TranslationSettings
let SettingsPage

async function createTextModule() {
  const modulePath = path.join(tempRoot, 'text.mjs')
  const enPath = JSON.stringify(path.join(projectRoot, 'src/_locales/en/messages.json'))
  const koPath = JSON.stringify(path.join(projectRoot, 'src/_locales/ko/messages.json'))
  await writeFile(modulePath, `
import {readFileSync} from 'node:fs'
const en = JSON.parse(readFileSync(${enPath}, 'utf8'))
const ko = JSON.parse(readFileSync(${koPath}, 'utf8'))

export function getText(textId, placeholder = null) {
  const locale = globalThis.navigator?.language?.toLowerCase().startsWith('ko') ? ko : en
  const entry = locale[textId]
  if (!entry?.message) return ''
  let message = entry.message
  Object.entries(entry.placeholders || {}).forEach(([name, definition]) => {
    const match = /^\\$(\\d+)\\$?$/.exec(definition.content || '')
    const index = match ? Number(match[1]) - 1 : -1
    const value = Array.isArray(placeholder) ? placeholder[index] : placeholder?.[name]
    message = message.replaceAll(\`$\${name}$\`, String(value ?? ''))
  })
  return message
}
`, 'utf8')
  return pathToFileURL(modulePath).href
}

function exposeDomGlobal(name, value) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value
  })
}

function installDom() {
  dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://naverdic.test/'
  })

  const windowGlobals = [
    'window',
    'document',
    'navigator',
    'Node',
    'Element',
    'HTMLElement',
    'SVGElement',
    'Event',
    'MouseEvent',
    'CustomEvent',
    'Text',
    'Comment',
    'Document',
    'DocumentFragment',
    'HTMLInputElement',
    'HTMLButtonElement',
    'HTMLSelectElement',
    'HTMLTextAreaElement',
    'MutationObserver'
  ]
  windowGlobals.forEach(name => exposeDomGlobal(name, dom.window[name]))
  dom.window.scrollTo = () => {}
  dom.window.requestAnimationFrame = callback => setTimeout(callback, 0)
  exposeDomGlobal('requestAnimationFrame', dom.window.requestAnimationFrame)
  exposeDomGlobal('cancelAnimationFrame', clearTimeout)
  exposeDomGlobal('getComputedStyle', dom.window.getComputedStyle.bind(dom.window))
}

function installChromePermissions({contains = true, request = false} = {}) {
  globalThis.chrome = {
    i18n: {
      getMessage() {
        return ''
      }
    },
    permissions: {
      contains(_details, callback) {
        callback?.(contains)
        return Promise.resolve(contains)
      },
      request(_details, callback) {
        callback?.(request)
        return Promise.resolve(request)
      }
    }
  }
}

function rewriteImports(content, replacements = {}) {
  for (const [specifier, replacement] of Object.entries(replacements)) {
    content = content
      .replaceAll(`from '${specifier}'`, `from '${replacement}'`)
      .replaceAll(`from \"${specifier}\"`, `from \"${replacement}\"`)
  }

  const sourceUrl = `${pathToFileURL(path.join(projectRoot, 'src')).href}/`
  return content
    .replaceAll("from '/src/", `from '${sourceUrl}`)
    .replaceAll('from \"/src/', `from \"${sourceUrl}`)
}

async function compileVueModule(relativePath, replacements = {}) {
  const filename = path.join(projectRoot, relativePath)
  const source = await readFile(filename, 'utf8')
  const {descriptor, errors} = parse(source, {filename})
  assert.equal(errors.length, 0, `failed to parse ${relativePath}`)
  const compiled = compileScript(descriptor, {
    id: `test-${compiledModuleId}`,
    inlineTemplate: true
  })
  const content = rewriteImports(compiled.content, replacements)
  const modulePath = path.join(
    tempRoot,
    `${compiledModuleId++}-${path.basename(relativePath, '.vue')}.mjs`
  )
  await writeFile(modulePath, content, 'utf8')
  const imported = await import(`${pathToFileURL(modulePath).href}?test=${compiledModuleId}`)
  return {component: imported.default, modulePath}
}

function createChromeRuntime(state = {}) {
  const currentState = {
    supported: true,
    availability: 'available',
    phase: 'available',
    progress: null,
    indeterminate: false,
    errorCode: null,
    errorName: '',
    errorMessage: '',
    ...state
  }
  return {
    getState: () => currentState,
    subscribe(listener) {
      listener(currentState)
      return () => {}
    },
    refreshAvailability: async () => currentState,
    download: async () => currentState,
    destroy: async () => {}
  }
}

function createCustomProvider() {
  return normalizeProviderDefinition({
    id: 'custom-api',
    name: 'Custom API',
    kind: 'http',
    source: 'custom',
    endpoint: {
      url: 'https://api.example.test/translate',
      method: 'POST'
    },
    auth: {mode: 'none'},
    request: {
      headers: [{name: 'Content-Type', valueTemplate: 'application/json'}],
      bodyTemplate: {text: '{{text}}'},
      textPath: 'text',
      targetLanguagePath: 'target_lang'
    },
    response: {textPath: 'text'}
  })
}

function createDraft(providerId, customProvider = null) {
  const draft = createDefaultSettingsV2()
  draft.translation.enabled = true
  draft.translation.providerId = providerId
  if (customProvider) {
    draft.customProviders = {[customProvider.id]: customProvider}
  }
  return draft
}

before(async () => {
  installDom()
  installChromePermissions({contains: true})
  // Keep generated modules below the workspace so Node can resolve the
  // repository's Vue package from their location without a custom loader.
  tempRoot = await mkdtemp(path.join(projectRoot, '.tmp-naverdic-vue-tests-'))
  const textModuleUrl = await createTextModule()
  const translationModule = await compileVueModule('src/components/TranslationSettings.vue', {
    '/src/text.js': textModuleUrl
  })
  TranslationSettings = translationModule.component
  const settingsPageModule = await compileVueModule(
    'src/components/SettingsPage.vue',
    {
      '/src/components/TranslationSettings.vue': pathToFileURL(translationModule.modulePath).href,
      '/src/text.js': textModuleUrl
    }
  )
  SettingsPage = settingsPageModule.component
  const testUtils = await import('@vue/test-utils')
  mount = testUtils.mount
  flushPromises = testUtils.flushPromises
})

after(async () => {
  await rm(tempRoot, {recursive: true, force: true})
  dom?.window.close()
})

test('provider panels expose the correct controls when mounted', async () => {
  const chromeWrapper = mount(TranslationSettings, {
    props: {
      draft: createDraft('chrome-translator'),
      draftSecrets: createDefaultSecretsV2(),
      translatorRuntime: createChromeRuntime()
    }
  })
  await flushPromises()
  assert.ok(chromeWrapper.find('[data-testid="settings-translation-form"]').exists())
  assert.match(chromeWrapper.text(), /en → ko/)
  assert.equal(chromeWrapper.find('[data-testid="settings-translation-preset-api-key"]').exists(), false)
  assert.equal(chromeWrapper.find('[data-testid="settings-translation-test"]').exists(), false)
  chromeWrapper.unmount()

  const deepLSecrets = createDefaultSecretsV2()
  deepLSecrets.providers['deepl-free'] = {apiKey: 'test-key'}
  const deepLWrapper = mount(TranslationSettings, {
    props: {
      draft: createDraft('deepl-free'),
      draftSecrets: deepLSecrets
    }
  })
  await flushPromises()
  assert.ok(deepLWrapper.find('[data-testid="settings-translation-preset-api-key"]').exists())
  assert.ok(deepLWrapper.find('[data-testid="settings-translation-test"]').exists())
  deepLWrapper.unmount()

  const customProvider = createCustomProvider()
  const customWrapper = mount(TranslationSettings, {
    props: {
      draft: createDraft(customProvider.id, customProvider),
      draftSecrets: createDefaultSecretsV2()
    }
  })
  await flushPromises()
  assert.ok(customWrapper.find('[data-testid="settings-translation-custom-editor"]').exists())
  assert.ok(customWrapper.find('[data-testid="settings-custom-name"]').exists())
  assert.ok(customWrapper.find('[data-testid="settings-custom-test"]').exists())
  customWrapper.unmount()
})

test('connection controls lock during a mounted request and denied Custom access cannot activate', async () => {
  const previousFetch = globalThis.fetch
  let resolveFetch
  globalThis.fetch = () => new Promise(resolve => {
    resolveFetch = resolve
  })

  const secrets = createDefaultSecretsV2()
  secrets.providers['deepl-free'] = {apiKey: 'test-key'}
  const deepLWrapper = mount(TranslationSettings, {
    props: {
      draft: createDraft('deepl-free'),
      draftSecrets: secrets
    }
  })
  await deepLWrapper.get('[data-testid="settings-translation-test"]').trigger('click')
  await flushPromises()
  assert.equal(deepLWrapper.get('[data-testid="settings-translation-preset-api-key"]').attributes('disabled'), '')
  assert.equal(deepLWrapper.get('[data-testid="settings-translation-test"]').attributes('disabled'), '')
  resolveFetch({
    ok: true,
    json: async () => ({translations: [{text: 'ok'}]})
  })
  await flushPromises()
  deepLWrapper.unmount()
  globalThis.fetch = previousFetch

  installChromePermissions({contains: false, request: false})
  const customProvider = createCustomProvider()
  const customDraft = createDraft('deepl-free', customProvider)
  const deniedWrapper = mount(TranslationSettings, {
    props: {
      draft: customDraft,
      draftSecrets: createDefaultSecretsV2()
    }
  })
  await deniedWrapper.get('[data-provider-id="custom-api"]').trigger('click')
  await flushPromises()
  await deniedWrapper.get('[data-testid="settings-custom-test"]').trigger('click')
  await flushPromises()
  const activateButton = deniedWrapper.get('[data-testid="settings-translation-activate"]')
  assert.equal(activateButton.attributes('disabled'), '')
  deniedWrapper.unmount()
  installChromePermissions({contains: true})
})

test('Custom edits survive the SettingsPage menu round-trip and keep the dirty callback active', async () => {
  const customProvider = createCustomProvider()
  const draft = createDraft(customProvider.id, customProvider)
  const pendingValues = []
  const wrapper = mount(SettingsPage, {
    props: {
      activePage: {id: 'translation-service'},
      draft,
      draftSecrets: createDefaultSecretsV2(),
      translationPendingChange: value => pendingValues.push(value)
    }
  })
  await flushPromises()

  const nameInput = wrapper.get('[data-testid="settings-custom-name"]')
  await nameInput.setValue('Edited Custom API')
  await flushPromises()
  assert.equal(pendingValues.at(-1), true)

  await wrapper.setProps({activePage: {id: 'appearance'}})
  await flushPromises()
  assert.equal(wrapper.find('[data-testid="settings-custom-name"]').exists(), false)

  await wrapper.setProps({activePage: {id: 'translation-service'}})
  await flushPromises()
  assert.equal(wrapper.get('[data-testid="settings-custom-name"]').element.value, 'Edited Custom API')
  assert.equal(pendingValues.at(-1), true)
  wrapper.unmount()
})

test('translation settings state helpers keep provider activation and global dirty rules explicit', () => {
  assert.equal(
    getTranslationSettingsPanel('chrome-translator'),
    TRANSLATION_SETTINGS_PANELS.CHROME
  )
  assert.equal(
    getTranslationSettingsPanel('deepl-free'),
    TRANSLATION_SETTINGS_PANELS.PRESET
  )
  assert.equal(
    getTranslationSettingsPanel('my-api', {'my-api': {source: 'custom'}}),
    TRANSLATION_SETTINGS_PANELS.CUSTOM
  )
  assert.equal(isTranslationConnectionLocked({connectionStatus: 'testing'}), true)
  assert.equal(isTranslationConnectionLocked({connectionStatus: 'success'}), false)
  assert.equal(isTranslationConnectionLocked({globallyDisabled: true}), true)

  const base = {
    panel: TRANSLATION_SETTINGS_PANELS.CUSTOM,
    connectionStatus: 'success',
    connectionMatches: true
  }
  assert.equal(canActivateTranslationProvider(base), false)
  assert.equal(canActivateTranslationProvider({...base, permissionAllowed: true}), true)
  assert.equal(hasPendingTranslationChanges(false, false), false)
  assert.equal(hasPendingTranslationChanges(false, true), true)
  assert.equal(hasPendingTranslationChanges(true, false), true)
})
