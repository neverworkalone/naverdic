import assert from 'node:assert/strict'
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'
import {after, before, test} from 'node:test'
import {JSDOM} from 'jsdom'
import {compileScript, parse} from '@vue/compiler-sfc'

import {
  APPEARANCE_DEFAULTS,
  FONT_SIZE_MAX_PT,
  FONT_SIZE_MIN_PT,
  changeFontSize,
  colorInputValue,
  normalizeHexColor,
  stepperFontSize
} from '../src/settings-appearance.mjs'
import {createDefaultSecretsV2, createDefaultSettingsV2} from '../src/settings-v2.mjs'
import {hasPendingSettingsChanges} from '../src/settings-v2-storage.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
let tempRoot
let dom
let mount
let flushPromises
let SettingsPage
let SettingsPreview
let makeReactive

async function createTextModule() {
  const modulePath = path.join(tempRoot, 'text.mjs')
  const enPath = JSON.stringify(path.join(projectRoot, 'src/_locales/en/messages.json'))
  const koPath = JSON.stringify(path.join(projectRoot, 'src/_locales/ko/messages.json'))
  await writeFile(modulePath, `
import {readFileSync} from 'node:fs'
const en = JSON.parse(readFileSync(${enPath}, 'utf8'))
const ko = JSON.parse(readFileSync(${koPath}, 'utf8'))
export function getText(id) {
  return ko[id]?.message || en[id]?.message || ''
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
  return pathToFileURL(modulePath).href
}

function createAppearanceDraft(popup = {}) {
  const draft = createDefaultSettingsV2()
  Object.assign(draft.popup, popup)
  return makeReactive(draft)
}

function mountAppearance(draft = createAppearanceDraft(), extraProps = {}) {
  return mount(SettingsPage, {
    props: {
      activePage: {id: 'appearance'},
      draft,
      draftSecrets: createDefaultSecretsV2(),
      draftRevision: 0,
      isLoading: false,
      isSaving: false,
      ...extraProps
    }
  })
}

before(async () => {
  installDom()
  tempRoot = await mkdtemp(path.join(projectRoot, '.tmp-naverdic-vue-tests-'))
  const textModuleUrl = await createTextModule()
  const translationSettingsUrl = await compileVueModule(
    'src/components/TranslationSettings.vue',
    {'/src/text.js': textModuleUrl}
  )
  const settingsPageUrl = await compileVueModule(
    'src/components/SettingsPage.vue',
    {
      '/src/text.js': textModuleUrl,
      '/src/components/TranslationSettings.vue': translationSettingsUrl
    }
  )
  const settingsPreviewUrl = await compileVueModule(
    'src/components/SettingsPreview.vue',
    {'/src/text.js': textModuleUrl}
  )
  makeReactive = (await import('vue')).reactive
  SettingsPage = (await import(settingsPageUrl + '?test=' + Date.now())).default
  SettingsPreview = (await import(settingsPreviewUrl + '?test=' + Date.now())).default
  const testUtils = await import('@vue/test-utils')
  mount = testUtils.mount
  flushPromises = testUtils.flushPromises
})

after(async () => {
  await rm(tempRoot, {recursive: true, force: true})
  dom?.window.close()
})

test('keeps appearance defaults and validates six-digit HEX colors', () => {
  assert.deepEqual(APPEARANCE_DEFAULTS, {
    backgroundColor: '#FFF59D',
    fontColor: '#000000',
    fontSizePt: 11
  })
  assert.equal(normalizeHexColor('#abcdef'), '#ABCDEF')
  assert.equal(normalizeHexColor('ABCDEF'), '#ABCDEF')
  assert.equal(normalizeHexColor('#abc'), null)
  assert.equal(normalizeHexColor('#12345g'), null)
  assert.equal(colorInputValue('legacy-css-color', '#FFF59D'), '#FFF59D')
})

test('renders the appearance defaults, scope guidance, and theme link', async () => {
  const wrapper = mountAppearance()
  await flushPromises()

  assert.equal(wrapper.get('[data-testid="settings-popup-background-color"]').element.value, '#FFF59D')
  assert.equal(wrapper.get('[data-testid="settings-popup-font-color"]').element.value, '#000000')
  assert.equal(wrapper.get('[data-testid="settings-popup-font-size"]').text(), '11 pt')
  assert.equal(
    wrapper.get('[data-testid="settings-popup-background-color-picker"]').element.parentElement.classList.contains('settings-color-control__picker-shell'),
    true
  )
  assert.equal(
    wrapper.get('[data-testid="settings-popup-font-color-picker"]').element.parentElement.classList.contains('settings-color-control__picker-shell'),
    true
  )
  assert.match(wrapper.get('[data-testid="settings-appearance-scope"]').text(), /적용 범위/)
  assert.match(wrapper.get('[data-testid="settings-appearance-scope"]').text(), /설정은 페이지 내 더블클릭 사전 팝업에 적용됩니다\./)
  assert.equal(wrapper.text().includes('사전 팝업과 번역 결과 팝업은 같은 너비로 표시됩니다.'), false)

  const link = wrapper.get('.settings-inline-link')
  assert.equal(link.attributes('href'), 'https://neverworkalone.github.io/naverdic/themes.html')
  assert.equal(link.attributes('target'), '_blank')
  assert.equal(link.attributes('rel'), 'noopener noreferrer')
  assert.equal(link.get('.settings-inline-link__icon').attributes('aria-hidden'), 'true')
  wrapper.unmount()
})

test('keeps stored appearance values and synchronizes color controls in both directions', async () => {
  const draft = createAppearanceDraft({backgroundColor: '#123456', fontColor: '#abcdef', fontSizePt: 17})
  const persisted = createAppearanceDraft({backgroundColor: '#123456', fontColor: '#abcdef', fontSizePt: 17})
  const persistedSecrets = createDefaultSecretsV2()
  const wrapper = mountAppearance(draft)
  await flushPromises()

  assert.equal(
    hasPendingSettingsChanges(
      {settings: persisted, secrets: persistedSecrets},
      {settings: draft, secrets: createDefaultSecretsV2()}
    ),
    false
  )

  assert.equal(draft.popup.backgroundColor, '#123456')
  assert.equal(draft.popup.fontColor, '#abcdef')
  assert.equal(wrapper.get('[data-testid="settings-popup-font-color"]').element.value, '#ABCDEF')
  assert.equal(wrapper.get('[data-testid="settings-popup-background-color-picker"]').element.value, '#123456')

  const backgroundInput = wrapper.get('[data-testid="settings-popup-background-color"]')
  await backgroundInput.setValue('#fedcba')
  assert.equal(draft.popup.backgroundColor, '#FEDCBA')
  assert.equal(backgroundInput.element.value, '#FEDCBA')
  assert.equal(
    hasPendingSettingsChanges(
      {settings: persisted, secrets: persistedSecrets},
      {settings: draft, secrets: createDefaultSecretsV2()}
    ),
    true
  )

  const fontPicker = wrapper.get('[data-testid="settings-popup-font-color-picker"]')
  await fontPicker.setValue('#445566')
  assert.equal(draft.popup.fontColor, '#445566')
  assert.equal(wrapper.get('[data-testid="settings-popup-font-color"]').element.value, '#445566')

  await backgroundInput.setValue('#12345')
  assert.equal(draft.popup.backgroundColor, '#FEDCBA')
  assert.equal(backgroundInput.attributes('aria-invalid'), 'true')
  assert.equal(wrapper.get('#settings-popup-background-color-error').attributes('role'), 'alert')
  wrapper.unmount()
})

test('steps font size by one point, respects bounds, and locks while saving', async () => {
  assert.equal(stepperFontSize('11'), 11)
  assert.equal(changeFontSize(FONT_SIZE_MIN_PT, -1), FONT_SIZE_MIN_PT)
  assert.equal(changeFontSize(FONT_SIZE_MAX_PT, 1), FONT_SIZE_MAX_PT)

  const draft = createAppearanceDraft()
  const wrapper = mountAppearance(draft)
  await flushPromises()

  const decrease = wrapper.get('[data-testid="settings-popup-font-size-decrease"]')
  const increase = wrapper.get('[data-testid="settings-popup-font-size-increase"]')
  assert.equal(decrease.attributes('aria-label'), '글자 크기 줄이기')
  assert.equal(increase.attributes('aria-label'), '글자 크기 늘리기')

  await increase.trigger('click')
  assert.equal(draft.popup.fontSizePt, 12)
  assert.equal(wrapper.get('[data-testid="settings-popup-font-size"]').text(), '12 pt')
  await decrease.trigger('click')
  assert.equal(draft.popup.fontSizePt, 11)

  draft.popup.fontSizePt = FONT_SIZE_MIN_PT
  await wrapper.vm.$nextTick()
  assert.equal(decrease.element.disabled, true)
  assert.equal(decrease.attributes('aria-disabled'), 'true')

  draft.popup.fontSizePt = FONT_SIZE_MAX_PT
  await wrapper.vm.$nextTick()
  assert.equal(increase.element.disabled, true)
  assert.equal(increase.attributes('aria-disabled'), 'true')

  await wrapper.setProps({isSaving: true})
  assert.equal(wrapper.get('[data-testid="settings-popup-background-color"]').element.disabled, true)
  assert.equal(decrease.element.disabled, true)
  assert.equal(increase.element.disabled, true)
  wrapper.unmount()
})

test('updates the live popup preview for appearance changes', async () => {
  const draft = createAppearanceDraft()
  const wrapper = mount(SettingsPreview, {
    props: {activePage: {id: 'appearance'}, draft}
  })
  const popup = wrapper.get('.settings-live-preview__popup')
  assert.equal(popup.element.style.backgroundColor, 'rgb(255, 245, 157)')
  assert.equal(popup.element.style.color, 'rgb(0, 0, 0)')
  assert.equal(popup.element.style.fontSize, '11pt')

  draft.popup.backgroundColor = '#123456'
  draft.popup.fontColor = '#FFFFFF'
  draft.popup.fontSizePt = 14
  await wrapper.vm.$nextTick()
  assert.equal(popup.element.style.backgroundColor, 'rgb(18, 52, 86)')
  assert.equal(popup.element.style.color, 'rgb(255, 255, 255)')
  assert.equal(popup.element.style.fontSize, '14pt')
  wrapper.unmount()
})
