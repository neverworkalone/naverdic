import assert from 'node:assert/strict'
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'
import {after, before, test} from 'node:test'
import {JSDOM} from 'jsdom'
import {compileScript, parse} from '@vue/compiler-sfc'

import {createDefaultSecretsV2, createDefaultSettingsV2} from '../src/settings-v2.mjs'
import {canActivateTranslationProvider, getTranslationSettingsPanel, isTranslationConnectionLocked, TRANSLATION_SETTINGS_PANELS} from '../src/translation-settings-state.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
let tempRoot
let dom
let mount
let flushPromises
let TranslationSettings

async function createTextModule() {
  const modulePath = path.join(tempRoot, 'text.mjs')
  const enPath = JSON.stringify(path.join(projectRoot, 'src/_locales/en/messages.json'))
  const koPath = JSON.stringify(path.join(projectRoot, 'src/_locales/ko/messages.json'))
  await writeFile(modulePath, `
import {readFileSync} from 'node:fs'
const en = JSON.parse(readFileSync(${enPath}, 'utf8'))
const ko = JSON.parse(readFileSync(${koPath}, 'utf8'))
export function getText(id) {
  const locale = globalThis.navigator?.language?.toLowerCase().startsWith('ko') ? ko : en
  return locale[id]?.message || ''
}
`, 'utf8')
  return pathToFileURL(modulePath).href
}

function exposeDomGlobal(name, value) {
  Object.defineProperty(globalThis, name, {configurable: true, writable: true, value})
}

function installDom() {
  dom = new JSDOM('<!doctype html><html><body></body></html>', {url: 'https://naverdic.test/'})
  for (const name of ['window', 'document', 'navigator', 'Node', 'Element', 'HTMLElement', 'SVGElement', 'Event', 'CustomEvent', 'Text', 'Comment', 'Document', 'DocumentFragment', 'HTMLInputElement', 'HTMLButtonElement', 'HTMLSelectElement', 'MutationObserver']) {
    exposeDomGlobal(name, dom.window[name])
  }
  dom.window.scrollTo = () => {}
  dom.window.requestAnimationFrame = callback => setTimeout(callback, 0)
  exposeDomGlobal('requestAnimationFrame', dom.window.requestAnimationFrame)
  exposeDomGlobal('cancelAnimationFrame', clearTimeout)
}

function rewriteImports(content, replacements = {}) {
  for (const [specifier, replacement] of Object.entries(replacements)) {
    content = content.replaceAll(`from '${specifier}'`, `from '${replacement}'`).replaceAll(`from "${specifier}"`, `from "${replacement}"`)
  }
  const sourceUrl = `${pathToFileURL(path.join(projectRoot, 'src')).href}/`
  return content.replaceAll("from '/src/", `from '${sourceUrl}`).replaceAll('from "/src/', `from "${sourceUrl}`)
}

async function compileVueModule(relativePath, replacements = {}) {
  const filename = path.join(projectRoot, relativePath)
  const source = await readFile(filename, 'utf8')
  const {descriptor, errors} = parse(source, {filename})
  assert.equal(errors.length, 0)
  const compiled = compileScript(descriptor, {id: 'test-' + path.basename(relativePath), inlineTemplate: true})
  const modulePath = path.join(tempRoot, path.basename(relativePath, '.vue') + '.mjs')
  await writeFile(modulePath, rewriteImports(compiled.content, replacements), 'utf8')
  return (await import(pathToFileURL(modulePath).href + '?test=' + Date.now())).default
}

function createChromeRuntime(state = {}) {
  const currentState = {supported: true, availability: 'available', phase: 'available', progress: null, indeterminate: false, errorCode: null, errorName: '', errorMessage: '', ...state}
  let destroyCalls = 0
  return {
    getState: () => currentState,
    subscribe(listener) { listener(currentState); return () => {} },
    refreshAvailability: async () => currentState,
    download: async () => currentState,
    destroy: async () => { destroyCalls += 1 },
    get destroyCalls() { return destroyCalls }
  }
}

function createDraft(providerId = 'deepl-free') {
  const draft = createDefaultSettingsV2()
  draft.translation.enabled = true
  draft.translation.providerId = providerId
  return draft
}

before(async () => {
  installDom()
  tempRoot = await mkdtemp(path.join(projectRoot, '.tmp-naverdic-vue-tests-'))
  const textModuleUrl = await createTextModule()
  TranslationSettings = await compileVueModule('src/components/TranslationSettings.vue', {'/src/text.js': textModuleUrl})
  const testUtils = await import('@vue/test-utils')
  mount = testUtils.mount
  flushPromises = testUtils.flushPromises
})

after(async () => {
  await rm(tempRoot, {recursive: true, force: true})
  dom?.window.close()
})

test('renders exactly the three supported services and separates selected from active', async () => {
  const wrapper = mount(TranslationSettings, {
    props: {draft: createDraft('deepl-free'), draftSecrets: createDefaultSecretsV2()}
  })
  await flushPromises()
  assert.equal(wrapper.findAll('.translation-service-row').length, 3)
  assert.equal(wrapper.findAll('.translation-service-row__icon').length, 0)
  assert.equal(wrapper.text().includes('Custom API'), false)
  assert.equal(wrapper.get('[data-provider-id="deepl"]').classes('translation-service-row--active'), true)
  await wrapper.get('[data-provider-id="gemini"]').trigger('click')
  assert.equal(wrapper.get('[data-provider-id="gemini"]').classes('translation-service-row--selected'), true)
  assert.equal(wrapper.get('[data-provider-id="gemini"]').classes('translation-service-row--active'), false)
  assert.equal(wrapper.get('[data-provider-id="deepl"]').classes('translation-service-row--active'), true)
  wrapper.unmount()
})

test('keeps Chrome free of API controls and exposes the fixed language pair', async () => {
  const wrapper = mount(TranslationSettings, {
    props: {draft: createDraft('chrome-translator'), draftSecrets: createDefaultSecretsV2(), translatorRuntime: createChromeRuntime()}
  })
  await flushPromises()
  assert.match(wrapper.text(), /en → ko/)
  assert.equal(wrapper.find('[data-testid="settings-translation-preset-api-key"]').exists(), false)
  assert.equal(wrapper.find('[data-testid="settings-translation-test"]').exists(), false)
  assert.equal(wrapper.find('[data-testid="settings-translation-delete-key"]').exists(), false)
  wrapper.unmount()
})

test('renders translation defaults and updates the feature controls in the draft', async () => {
  const draft = createDraft('chrome-translator')
  const wrapper = mount(TranslationSettings, {
    props: {draft, draftSecrets: createDefaultSecretsV2(), translatorRuntime: createChromeRuntime()}
  })
  await flushPromises()
  assert.equal(wrapper.get('[data-testid="settings-translation-enabled"]').element.checked, true)
  assert.equal(wrapper.get('[data-testid="settings-translation-trigger"]').element.value, 'ctrl')
  assert.equal(wrapper.findAll('[data-testid="settings-translation-trigger"] option').length, 4)
  await wrapper.get('[data-testid="settings-translation-trigger"]').setValue('ctrlalt')
  assert.equal(draft.translation.triggerKey, 'ctrlalt')
  await wrapper.get('[data-testid="settings-translation-enabled"]').setValue(false)
  assert.equal(draft.translation.enabled, false)
  wrapper.unmount()
})

test('locks DeepL controls while a connection test is in flight and clears stale target-language results', async () => {
  const previousFetch = globalThis.fetch
  let resolveFetch
  globalThis.fetch = () => new Promise(resolve => { resolveFetch = resolve })
  const secrets = createDefaultSecretsV2()
  secrets.providers['deepl-free'] = {apiKey: 'test-key'}
  const wrapper = mount(TranslationSettings, {props: {draft: createDraft(), draftSecrets: secrets}})
  await wrapper.get('[data-testid="settings-translation-test"]').trigger('click')
  await flushPromises()
  assert.equal(wrapper.get('[data-testid="settings-translation-preset-api-key"]').attributes('disabled'), '')
  assert.equal(wrapper.get('[data-testid="settings-translation-test"]').attributes('disabled'), '')
  const changedDraft = createDraft()
  changedDraft.translation.targetLanguage = 'ja'
  await wrapper.setProps({draft: changedDraft})
  await flushPromises()
  assert.equal(wrapper.get('[data-testid="settings-translation-test"]').attributes('disabled'), undefined)
  resolveFetch({ok: true, json: async () => ({translations: [{text: 'ok'}]})})
  await flushPromises()
  assert.equal(wrapper.find('[data-testid="settings-translation-test-result"]').exists(), false)
  wrapper.unmount()
  globalThis.fetch = previousFetch
})

test('invalidates a successful Gemini connection test when the model changes', async () => {
  const previousFetch = globalThis.fetch
  globalThis.fetch = async () => ({ok: true, json: async () => ({candidates: [{content: {parts: [{text: 'ok'}]}}]})})
  const secrets = createDefaultSecretsV2()
  secrets.providers.gemini = {apiKey: 'test-key'}
  const wrapper = mount(TranslationSettings, {props: {draft: createDraft(), draftSecrets: secrets}})
  await wrapper.get('[data-provider-id="gemini"]').trigger('click')
  await wrapper.get('[data-testid="settings-translation-test"]').trigger('click')
  await flushPromises()
  assert.match(wrapper.get('[data-testid="settings-translation-test-result"]').text(), /Connection test succeeded/)
  const changedDraft = createDraft()
  changedDraft.translation.geminiModel = 'gemini-2.5-flash'
  await wrapper.setProps({draft: changedDraft})
  await flushPromises()
  assert.equal(wrapper.find('[data-testid="settings-translation-test-result"]').exists(), false)
  assert.equal(wrapper.get('[data-testid="settings-translation-activate"]').attributes('disabled'), '')
  wrapper.unmount()
  globalThis.fetch = previousFetch
})

test('fetches and stores compatible Gemini model choices without exposing the API key', async () => {
  const previousFetch = globalThis.fetch
  let request
  globalThis.fetch = async (url, options) => {
    request = {url, options}
    return {
      ok: true,
      json: async () => ({models: [
        {name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent']},
        {name: 'models/gemini-embedding', supportedGenerationMethods: ['embedContent']}
      ]})
    }
  }
  const secrets = createDefaultSecretsV2()
  secrets.providers.gemini = {apiKey: 'private-key'}
  const draft = createDraft('gemini')
  const wrapper = mount(TranslationSettings, {props: {draft, draftSecrets: secrets}})
  await wrapper.get('[data-testid="settings-translation-gemini-model-fetch"]').trigger('click')
  await flushPromises()
  assert.equal(request.url, 'https://generativelanguage.googleapis.com/v1beta/models')
  assert.equal(request.options.headers['x-goog-api-key'], 'private-key')
  assert.deepEqual([...wrapper.get('[data-testid="settings-translation-gemini-model"]').element.options].map(option => option.value), ['gemini-3.5-flash', 'gemini-2.5-flash'])
  assert.equal(wrapper.text().includes('private-key'), false)
  wrapper.unmount()
  globalThis.fetch = previousFetch
})

test('locks translation controls while loading and saving', async () => {
  const wrapper = mount(TranslationSettings, {
    props: {draft: createDraft(), draftSecrets: createDefaultSecretsV2(), isLoading: true}
  })
  assert.equal(wrapper.get('[data-testid="settings-translation-enabled"]').attributes('disabled'), '')
  assert.equal(wrapper.get('[data-testid="settings-translation-trigger"]').attributes('disabled'), '')
  assert.equal(wrapper.get('[data-provider-id="gemini"]').attributes('disabled'), '')
  wrapper.unmount()
})

test('clears an in-flight connection test when settings are reset or saved', async () => {
  const previousFetch = globalThis.fetch
  let resolveFetch
  globalThis.fetch = () => new Promise(resolve => { resolveFetch = resolve })
  const secrets = createDefaultSecretsV2()
  secrets.providers['deepl-free'] = {apiKey: 'test-key'}
  const wrapper = mount(TranslationSettings, {props: {draft: createDraft(), draftSecrets: secrets}})
  await wrapper.get('[data-testid="settings-translation-test"]').trigger('click')
  await flushPromises()
  assert.equal(wrapper.get('[data-testid="settings-translation-test"]').attributes('disabled'), '')
  await wrapper.setProps({draftRevision: 1})
  await flushPromises()
  assert.equal(wrapper.get('[data-testid="settings-translation-test"]').attributes('disabled'), undefined)
  resolveFetch({ok: true, json: async () => ({translations: [{text: 'ok'}]})})
  await flushPromises()
  assert.equal(wrapper.find('[data-testid="settings-translation-test-result"]').exists(), false)
  wrapper.unmount()
  globalThis.fetch = previousFetch
})

test('destroys the Chrome runtime when switching away from the provider', async () => {
  const runtime = createChromeRuntime()
  const wrapper = mount(TranslationSettings, {props: {draft: createDraft(), draftSecrets: createDefaultSecretsV2(), translatorRuntime: runtime}})
  await wrapper.get('[data-provider-id="chrome-translator"]').trigger('click')
  await flushPromises()
  await wrapper.get('[data-provider-id="deepl"]').trigger('click')
  await flushPromises()
  assert.equal(runtime.destroyCalls, 1)
  wrapper.unmount()
})

test('falls back safely when an old custom provider id reaches the component', async () => {
  const wrapper = mount(TranslationSettings, {props: {draft: createDraft('legacy-custom-api'), draftSecrets: createDefaultSecretsV2()}})
  await flushPromises()
  assert.equal(wrapper.get('[data-provider-id="deepl"]').classes('translation-service-row--active'), true)
  assert.equal(wrapper.find('[data-provider-id="legacy-custom-api"]').exists(), false)
  wrapper.unmount()
})

test('keeps the translation state helpers limited to built-in panels', () => {
  assert.equal(getTranslationSettingsPanel('chrome-translator'), TRANSLATION_SETTINGS_PANELS.CHROME)
  assert.equal(getTranslationSettingsPanel('deepl-free'), TRANSLATION_SETTINGS_PANELS.PRESET)
  assert.equal(getTranslationSettingsPanel('legacy-custom'), TRANSLATION_SETTINGS_PANELS.UNKNOWN)
  assert.equal(isTranslationConnectionLocked({connectionStatus: 'testing'}), true)
  assert.equal(canActivateTranslationProvider({panel: TRANSLATION_SETTINGS_PANELS.PRESET, hasCredential: true, connectionStatus: 'success', connectionMatches: true}), true)
  assert.equal(canActivateTranslationProvider({panel: TRANSLATION_SETTINGS_PANELS.UNKNOWN, connectionStatus: 'success'}), false)
})
