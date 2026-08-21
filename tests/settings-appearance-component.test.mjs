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
import {
  createDefaultSecretsV2,
  createDefaultSettingsV2,
  createInitialSettingsV2
} from '../src/settings-v2.mjs'
import {createSettingsBackup} from '../src/settings-backup.mjs'
import {hasPendingSettingsChanges} from '../src/settings-v2-storage.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
let tempRoot
let dom
let mount
let flushPromises
let SettingsPage
let SettingsPreview
let SettingsShell
let makeReactive
let koMessages

function koText(key) {
  return koMessages[key].message
}

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

function createDoubleClickDraft(doubleClick = {}) {
  const draft = createDefaultSettingsV2()
  Object.assign(draft.dictionary.doubleClick, doubleClick)
  return makeReactive(draft)
}

function mountDoubleClick(draft = createDoubleClickDraft(), extraProps = {}) {
  return mount(SettingsPage, {
    props: {
      activePage: {id: 'double-click'},
      draft,
      draftSecrets: createDefaultSecretsV2(),
      draftRevision: 0,
      isLoading: false,
      isSaving: false,
      ...extraProps
    }
  })
}

function createDragDraft(drag = {}) {
  const draft = createInitialSettingsV2()
  Object.assign(draft.dictionary.drag, drag)
  return makeReactive(draft)
}

function mountDrag(draft = createDragDraft(), extraProps = {}) {
  return mount(SettingsPage, {
    props: {
      activePage: {id: 'behavior'},
      draft,
      draftSecrets: createDefaultSecretsV2(),
      draftRevision: 0,
      isLoading: false,
      isSaving: false,
      ...extraProps
    }
  })
}

function createBlockedSitesDraft(sites = {}) {
  const draft = createDefaultSettingsV2()
  Object.assign(draft.sites, sites)
  return makeReactive(draft)
}

function mountBlockedSites(draft = createBlockedSitesDraft(), extraProps = {}) {
  return mount(SettingsPage, {
    props: {
      activePage: {id: 'blocked-sites'},
      draft,
      draftSecrets: createDefaultSecretsV2(),
      draftRevision: 0,
      isLoading: false,
      isSaving: false,
      ...extraProps
    }
  })
}

function createAdvancedDraft() {
  return makeReactive(createInitialSettingsV2())
}

function mountAdvanced(draft = createAdvancedDraft(), extraProps = {}) {
  return mount(SettingsPage, {
    props: {
      activePage: {id: 'advanced'},
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
  koMessages = JSON.parse(await readFile(path.join(projectRoot, 'src/_locales/ko/messages.json'), 'utf8'))
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
  const settingsShellUrl = await compileVueModule(
    'src/components/SettingsShell.vue',
    {
      '/src/text.js': textModuleUrl,
      '/src/components/SettingsPreview.vue': settingsPreviewUrl
    }
  )
  makeReactive = (await import('vue')).reactive
  SettingsPage = (await import(settingsPageUrl + '?test=' + Date.now())).default
  SettingsPreview = (await import(settingsPreviewUrl + '?test=' + Date.now())).default
  SettingsShell = (await import(settingsShellUrl + '?test=' + Date.now())).default
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
  const scopeText = wrapper.get('[data-testid="settings-appearance-scope"]').text()
  assert.equal(scopeText.includes(koText('SETTINGS_APPEARANCE_SCOPE_TITLE')), true)
  assert.equal(scopeText.includes(koText('SETTINGS_APPEARANCE_SCOPE_DESCRIPTION')), true)

  const link = wrapper.get('.settings-inline-link')
  assert.equal(link.attributes('href'), 'https://neverworkalone.github.io/naverdic/themes.html')
  assert.equal(link.attributes('target'), '_blank')
  assert.equal(link.attributes('rel'), 'noopener noreferrer')
  assert.equal(link.get('.settings-inline-link__label').text(), koText('SETTINGS_POPUP_THEME_GUIDE'))
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
  assert.equal(decrease.attributes('aria-label'), koText('SETTINGS_FIELD_FONT_SIZE_DECREASE'))
  assert.equal(increase.attributes('aria-label'), koText('SETTINGS_FIELD_FONT_SIZE_INCREASE'))

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
  assert.equal(wrapper.classes().includes('settings-live-preview--appearance'), true)
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

test('renders double-click defaults and locale-backed control options', async () => {
  const wrapper = mountDoubleClick()
  await flushPromises()

  const form = wrapper.get('[data-testid="settings-double-click-form"]')
  const enabled = wrapper.get('[data-testid="settings-double-click-enabled"]').element
  const trigger = wrapper.get('[data-testid="settings-double-click-trigger"]').element
  const speed = wrapper.get('[data-testid="settings-double-click-speed"]').element

  assert.equal(enabled.checked, true)
  assert.equal(trigger.value, 'none')
  assert.deepEqual(
    [...trigger.options].map(option => option.value),
    ['none', 'ctrl', 'alt', 'ctrlalt']
  )
  assert.equal(speed.value, '400')
  assert.deepEqual(
    [...speed.options].map(option => Number(option.value)),
    [200, 300, 400, 500]
  )
  assert.equal(
    speed.options[2].textContent,
    `${koText('DCLICK_SPEED_SLOW')} · 400ms`
  )
  assert.equal(form.findAll('.settings-double-click-divider').length, 4)
  assert.equal(
    form.get('label[for="settings-double-click-trigger"]').text(),
    koText('SETTINGS_FIELD_TRIGGER_KEY')
  )
  assert.equal(
    form.get('label[for="settings-double-click-speed"]').text(),
    koText('SETTINGS_FIELD_DOUBLE_CLICK_SPEED')
  )
  assert.equal(form.text().includes(koText('SETTINGS_FIELD_DOUBLE_CLICK_SPEED_HINT')), true)
  wrapper.unmount()
})

test('updates double-click draft values and reports dirty state', async () => {
  const draft = createDoubleClickDraft()
  const persisted = createDoubleClickDraft()
  const wrapper = mountDoubleClick(draft)
  await flushPromises()

  assert.equal(
    hasPendingSettingsChanges(
      {settings: persisted, secrets: createDefaultSecretsV2()},
      {settings: draft, secrets: createDefaultSecretsV2()}
    ),
    false
  )

  await wrapper.get('[data-testid="settings-double-click-enabled"]').setValue(false)
  await wrapper.get('[data-testid="settings-double-click-trigger"]').setValue('ctrlalt')
  await wrapper.get('[data-testid="settings-double-click-speed"]').setValue('200')

  assert.equal(draft.dictionary.doubleClick.enabled, false)
  assert.equal(draft.dictionary.doubleClick.triggerKey, 'ctrlalt')
  assert.equal(draft.dictionary.doubleClick.speedMs, 200)
  assert.equal(
    hasPendingSettingsChanges(
      {settings: persisted, secrets: createDefaultSecretsV2()},
      {settings: draft, secrets: createDefaultSecretsV2()}
    ),
    true
  )

  Object.assign(draft.dictionary.doubleClick, createDefaultSettingsV2().dictionary.doubleClick)
  await wrapper.setProps({draftRevision: 1})
  await wrapper.vm.$nextTick()
  assert.equal(wrapper.get('[data-testid="settings-double-click-enabled"]').element.checked, true)
  assert.equal(wrapper.get('[data-testid="settings-double-click-trigger"]').element.value, 'none')
  assert.equal(wrapper.get('[data-testid="settings-double-click-speed"]').element.value, '400')
  wrapper.unmount()
})

test('locks every double-click control while loading or saving', async () => {
  const wrapper = mountDoubleClick()
  await flushPromises()

  await wrapper.setProps({isLoading: true})
  assert.equal(wrapper.get('[data-testid="settings-double-click-enabled"]').element.disabled, true)
  assert.equal(wrapper.get('[data-testid="settings-double-click-trigger"]').element.disabled, true)
  assert.equal(wrapper.get('[data-testid="settings-double-click-speed"]').element.disabled, true)

  await wrapper.setProps({isLoading: false, isSaving: true})
  assert.equal(wrapper.get('[data-testid="settings-double-click-enabled"]').element.disabled, true)
  assert.equal(wrapper.get('[data-testid="settings-double-click-trigger"]').element.disabled, true)
  assert.equal(wrapper.get('[data-testid="settings-double-click-speed"]').element.disabled, true)
  wrapper.unmount()
})

test('renders drag defaults, locale-backed controls, and only drag settings', async () => {
  const wrapper = mountDrag()
  await flushPromises()

  const form = wrapper.get('[data-testid="settings-drag-form"]')
  const enabled = wrapper.get('[data-testid="settings-drag-enabled"]').element
  const trigger = wrapper.get('[data-testid="settings-drag-trigger"]').element

  assert.equal(enabled.checked, true)
  assert.equal(trigger.value, 'none')
  assert.deepEqual(
    [...trigger.options].map(option => option.value),
    ['none', 'ctrl', 'alt', 'ctrlalt']
  )
  assert.equal(trigger.options[0].textContent, koText('DRAG'))
  assert.equal(
    form.get('label[for="settings-drag-trigger"]').text(),
    koText('SETTINGS_FIELD_TRIGGER_KEY')
  )
  assert.equal(form.text().includes(koText('SETTINGS_FIELD_DRAG_TRIGGER_HINT')), true)
  assert.equal(form.findAll('.settings-drag-divider').length, 3)
  assert.equal(form.find('[data-testid="settings-double-click-enabled"]').exists(), false)
  assert.equal(form.find('[data-testid="settings-double-click-speed"]').exists(), false)
  wrapper.unmount()
})

test('updates drag draft values, reports dirty state, and resets from the revision', async () => {
  const draft = createDragDraft()
  const persisted = createDragDraft()
  const wrapper = mountDrag(draft)
  await flushPromises()

  assert.equal(
    hasPendingSettingsChanges(
      {settings: persisted, secrets: createDefaultSecretsV2()},
      {settings: draft, secrets: createDefaultSecretsV2()}
    ),
    false
  )

  await wrapper.get('[data-testid="settings-drag-enabled"]').setValue(false)
  for (const triggerKey of ['none', 'ctrl', 'alt', 'ctrlalt']) {
    await wrapper.get('[data-testid="settings-drag-trigger"]').setValue(triggerKey)
    assert.equal(draft.dictionary.drag.triggerKey, triggerKey)
  }

  assert.equal(draft.dictionary.drag.enabled, false)
  assert.equal(
    hasPendingSettingsChanges(
      {settings: persisted, secrets: createDefaultSecretsV2()},
      {settings: draft, secrets: createDefaultSecretsV2()}
    ),
    true
  )

  Object.assign(draft.dictionary.drag, createInitialSettingsV2().dictionary.drag)
  await wrapper.setProps({draftRevision: 1})
  await wrapper.vm.$nextTick()
  assert.equal(wrapper.get('[data-testid="settings-drag-enabled"]').element.checked, true)
  assert.equal(wrapper.get('[data-testid="settings-drag-trigger"]').element.value, 'none')
  wrapper.unmount()
})

test('locks every drag control while loading or saving', async () => {
  const wrapper = mountDrag()
  await flushPromises()

  await wrapper.setProps({isLoading: true})
  assert.equal(wrapper.get('[data-testid="settings-drag-enabled"]').element.disabled, true)
  assert.equal(wrapper.get('[data-testid="settings-drag-trigger"]').element.disabled, true)

  await wrapper.setProps({isLoading: false, isSaving: true})
  assert.equal(wrapper.get('[data-testid="settings-drag-enabled"]').element.disabled, true)
  assert.equal(wrapper.get('[data-testid="settings-drag-trigger"]').element.disabled, true)
  wrapper.unmount()
})

test('renders the blocked-sites form without a duplicated page heading', async () => {
  const wrapper = mountBlockedSites()
  await flushPromises()

  const form = wrapper.get('[data-testid="settings-blocked-sites-form"]')
  const enabled = wrapper.get('[data-testid="settings-blocked-sites-enabled"]').element
  const input = wrapper.get('[data-testid="settings-blocked-sites-input"]')

  assert.equal(enabled.checked, false)
  assert.equal(input.element.value, '')
  assert.equal(form.get('label[for="settings-blocked-sites-input"]').text(), koText('SETTINGS_FIELD_BLOCKED_SITES'))
  assert.equal(form.find('.settings-card__heading').exists(), false)
  assert.equal(form.findAll('.settings-blocked-sites-divider').length, 2)
  assert.equal(form.text().includes(koText('SETTINGS_BLOCKED_SITES_REGISTERED')), true)
  assert.equal(koMessages.SETTINGS_BLOCKED_SITES_NORMALIZED, undefined)
  wrapper.unmount()
})

test('updates the blocked-sites draft from newline, comma, and semicolon input', async () => {
  const draft = createBlockedSitesDraft()
  const persisted = createBlockedSitesDraft()
  const wrapper = mountBlockedSites(draft)
  await flushPromises()

  const input = wrapper.get('[data-testid="settings-blocked-sites-input"]')
  await input.setValue('https://www.Example.com/path, *.example.com;bad value')

  assert.deepEqual(draft.sites.denyList, ['www.example.com', 'example.com'])
  assert.equal(wrapper.findAll('[data-testid="settings-blocked-sites-normalized"] .settings-domain-chip').length, 2)
  assert.equal(wrapper.get('[data-testid="settings-blocked-sites-error"]').exists(), true)
  assert.equal(
    hasPendingSettingsChanges(
      {settings: persisted, secrets: createDefaultSecretsV2()},
      {settings: draft, secrets: createDefaultSecretsV2()}
    ),
    true
  )

  draft.sites.denyList = ['saved.example.com']
  await wrapper.setProps({draftRevision: 1})
  await wrapper.vm.$nextTick()
  assert.equal(input.element.value, 'saved.example.com')
  assert.equal(wrapper.findAll('[data-testid="settings-blocked-sites-normalized"] .settings-domain-chip').length, 1)
  wrapper.unmount()
})

test('locks blocked-sites controls while loading or saving', async () => {
  const wrapper = mountBlockedSites()
  await flushPromises()

  await wrapper.setProps({isLoading: true})
  assert.equal(wrapper.get('[data-testid="settings-blocked-sites-enabled"]').element.disabled, true)
  assert.equal(wrapper.get('[data-testid="settings-blocked-sites-input"]').element.disabled, true)

  await wrapper.setProps({isLoading: false, isSaving: true})
  assert.equal(wrapper.get('[data-testid="settings-blocked-sites-enabled"]').element.disabled, true)
  assert.equal(wrapper.get('[data-testid="settings-blocked-sites-input"]').element.disabled, true)
  wrapper.unmount()
})

test('renders advanced data controls with Figma card rhythm and locale-backed labels', async () => {
  const wrapper = mountAdvanced()
  await flushPromises()

  const card = wrapper.get('[data-testid="settings-advanced-data-card"]')
  assert.equal(card.findAll('.settings-advanced-divider').length, 3)
  assert.equal(card.find('.settings-advanced-divider--heading').exists(), true)
  assert.equal(card.text().includes(koText('SETTINGS_ADVANCED_DATA_TITLE')), true)
  assert.equal(card.text().includes(koText('SETTINGS_ADVANCED_EXPORT_TITLE')), true)
  assert.equal(card.text().includes(koText('SETTINGS_ADVANCED_IMPORT_TITLE')), true)
  assert.equal(wrapper.get('[data-testid="settings-advanced-export"]').text(), koText('SETTINGS_ADVANCED_EXPORT_BUTTON'))
  assert.equal(wrapper.get('[data-testid="settings-advanced-import"]').text(), koText('SETTINGS_ADVANCED_IMPORT_BUTTON'))

  const fileInput = wrapper.get('[data-testid="settings-advanced-file-input"]')
  assert.equal(fileInput.attributes('type'), 'file')
  assert.equal(card.get('label[for="settings-advanced-file-input"]').text(), koText('SETTINGS_ADVANCED_IMPORT_FILE_LABEL'))
  wrapper.unmount()
})

test('exports persisted settings and imports into draft without committing storage', async () => {
  const draft = createAdvancedDraft()
  const draftSecrets = createDefaultSecretsV2()
  const persisted = createInitialSettingsV2()
  persisted.popup.backgroundColor = '#123456'
  const persistedSecrets = createDefaultSecretsV2()
  persistedSecrets.providers['deepl-free'] = {apiKey: 'persisted-local-key'}
  let downloadedPayload = ''
  let downloadedName = ''
  const originalBlob = globalThis.Blob
  const originalUrl = globalThis.URL
  const originalAnchorClick = dom.window.HTMLAnchorElement.prototype.click

  class MockBlob {
    constructor(parts, options) {
      downloadedPayload = parts.join('')
      this.type = options.type
    }
  }

  exposeDomGlobal('Blob', MockBlob)
  exposeDomGlobal('URL', {
    createObjectURL: () => 'blob:settings-backup',
    revokeObjectURL: () => {}
  })
  dom.window.HTMLAnchorElement.prototype.click = function () {
    downloadedName = this.download
  }

  const revisionCalls = []
  const wrapper = mountAdvanced(draft, {
    draftSecrets,
    persistedSettings: persisted,
    persistedSecrets,
    onDraftRevision: () => revisionCalls.push(true)
  })
  await flushPromises()

  await wrapper.get('[data-testid="settings-advanced-export"]').trigger('click')
  const exported = JSON.parse(downloadedPayload)
  assert.equal(downloadedName, 'naverdic-settings-backup.json')
  assert.equal(exported.settings.popup.backgroundColor, '#123456')
  assert.equal(exported.secrets.providers['deepl-free'].apiKey, 'persisted-local-key')

  const importedSettings = createInitialSettingsV2()
  importedSettings.popup.backgroundColor = '#654321'
  importedSettings.dictionary.doubleClick.speedMs = 200
  const importedSecrets = createDefaultSecretsV2()
  importedSecrets.providers.gemini = {apiKey: 'imported-local-key'}
  const input = wrapper.get('[data-testid="settings-advanced-file-input"]').element
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: [{text: async () => JSON.stringify(createSettingsBackup(importedSettings, importedSecrets))}]
  })
  input.dispatchEvent(new dom.window.Event('change', {bubbles: true}))
  await flushPromises()

  assert.equal(draft.popup.backgroundColor, '#654321')
  assert.equal(draft.dictionary.doubleClick.speedMs, 200)
  assert.equal(draftSecrets.providers.gemini.apiKey, 'imported-local-key')
  assert.equal(revisionCalls.length, 1)
  assert.equal(
    hasPendingSettingsChanges(
      {settings: persisted, secrets: persistedSecrets},
      {settings: draft, secrets: draftSecrets}
    ),
    true
  )
  assert.equal(wrapper.find('[data-testid="settings-advanced-import-error"]').exists(), false)

  dom.window.HTMLAnchorElement.prototype.click = originalAnchorClick
  exposeDomGlobal('Blob', originalBlob)
  exposeDomGlobal('URL', originalUrl)
  wrapper.unmount()
})

test('rejects invalid imports, preserves draft values, and locks advanced controls', async () => {
  const draft = createAdvancedDraft()
  const wrapper = mountAdvanced(draft)
  await flushPromises()

  const input = wrapper.get('[data-testid="settings-advanced-file-input"]').element
  Object.defineProperty(input, 'files', {
    configurable: true,
    value: [{text: async () => '{invalid'}]
  })
  input.dispatchEvent(new dom.window.Event('change', {bubbles: true}))
  await flushPromises()

  assert.equal(wrapper.get('[data-testid="settings-advanced-import-error"]').text(), koText('SETTINGS_ADVANCED_IMPORT_ERROR'))
  assert.equal(draft.popup.backgroundColor, '#FFF59D')

  await wrapper.setProps({isLoading: true})
  assert.equal(wrapper.get('[data-testid="settings-advanced-export"]').element.disabled, true)
  assert.equal(wrapper.get('[data-testid="settings-advanced-import"]').element.disabled, true)
  assert.equal(wrapper.get('[data-testid="settings-advanced-file-input"]').element.disabled, true)
  await wrapper.setProps({isLoading: false, isSaving: true})
  assert.equal(wrapper.get('[data-testid="settings-advanced-export"]').element.disabled, true)
  assert.equal(wrapper.get('[data-testid="settings-advanced-import"]').element.disabled, true)
  wrapper.unmount()
})

test('renders the double-click flow without leaking into other previews', () => {
  const doubleClick = createDoubleClickDraft()
  const wrapper = mount(SettingsPreview, {
    props: {activePage: {id: 'double-click'}, draft: doubleClick}
  })

  assert.equal(wrapper.classes().includes('settings-live-preview--double-click'), true)
  assert.equal(wrapper.get('.settings-guide-preview').classes().includes('settings-guide-preview--double-click'), true)
  assert.equal(wrapper.find('.settings-guide-preview__eyebrow').exists(), false)
  assert.equal(wrapper.findAll('.settings-guide-preview li').length, 4)
  assert.equal(wrapper.findAll('.settings-guide-preview--double-click li p > strong').length, 4)
  assert.equal(wrapper.findAll('.settings-guide-preview--double-click li p > span').length, 4)
  for (const step of [1, 2, 3, 4]) {
    assert.equal(wrapper.text().includes(koText(`SETTINGS_PREVIEW_DOUBLE_CLICK_STEP_${step}`)), true)
    assert.equal(
      wrapper.text().includes(koText(`SETTINGS_PREVIEW_DOUBLE_CLICK_STEP_${step}_DESCRIPTION`)),
      true
    )
  }
  wrapper.unmount()

  const behavior = mount(SettingsPreview, {
    props: {activePage: {id: 'behavior'}, draft: createDoubleClickDraft()}
  })
  assert.equal(behavior.classes().includes('settings-live-preview--double-click'), false)
  assert.equal(behavior.classes().includes('settings-live-preview--drag'), true)
  assert.equal(behavior.get('.settings-guide-preview').classes().includes('settings-guide-preview--double-click'), false)
  assert.equal(behavior.get('.settings-guide-preview').classes().includes('settings-guide-preview--drag'), true)
  assert.equal(behavior.find('.settings-guide-preview__eyebrow').exists(), false)
  assert.equal(behavior.findAll('.settings-guide-preview li').length, 4)
  assert.equal(behavior.findAll('.settings-guide-preview--drag li p > strong').length, 4)
  assert.equal(behavior.findAll('.settings-guide-preview--drag li p > span').length, 4)
  for (const step of [1, 2, 3, 4]) {
    assert.equal(behavior.text().includes(koText(`SETTINGS_PREVIEW_DRAG_STEP_${step}`)), true)
    assert.equal(
      behavior.text().includes(koText(`SETTINGS_PREVIEW_DRAG_STEP_${step}_DESCRIPTION`)),
      true
    )
  }
  assert.equal(behavior.text().includes(koText('SETTINGS_PREVIEW_DOUBLE_CLICK_STEP_1')), false)
  assert.equal(behavior.text().includes(koText('SETTINGS_PREVIEW_DOUBLE_CLICK_STEP_1_DESCRIPTION')), false)
  behavior.unmount()
})

test('renders the blocked-sites guide with locale-backed steps and note', () => {
  const wrapper = mount(SettingsPreview, {
    props: {activePage: {id: 'blocked-sites'}, draft: createBlockedSitesDraft({denyList: ['example.com']})}
  })

  assert.equal(wrapper.classes().includes('settings-live-preview--blocked-sites'), true)
  assert.equal(wrapper.get('.settings-guide-preview').classes().includes('settings-guide-preview--blocked-sites'), true)
  assert.equal(wrapper.findAll('.settings-guide-preview--blocked-sites li').length, 3)
  assert.equal(wrapper.findAll('.settings-guide-preview--blocked-sites li p > strong').length, 3)
  assert.equal(wrapper.findAll('.settings-guide-preview--blocked-sites li p > span').length, 3)
  assert.equal(wrapper.find('.settings-guide-preview__note').exists(), true)
  for (const step of [1, 2, 3]) {
    assert.equal(wrapper.text().includes(koText(`SETTINGS_PREVIEW_BLOCKED_SITES_STEP_${step}`)), true)
    assert.equal(
      wrapper.text().includes(koText(`SETTINGS_PREVIEW_BLOCKED_SITES_STEP_${step}_DESCRIPTION`)),
      true
    )
  }
  assert.equal(wrapper.text().includes(koText('SETTINGS_PREVIEW_BLOCKED_SITES_NOTE')), true)
  wrapper.unmount()
})

test('renders the advanced danger reset card and invokes the existing reset flow', async () => {
  let resetCalls = 0
  const wrapper = mount(SettingsPreview, {
    props: {
      activePage: {id: 'advanced'},
      draft: createAdvancedDraft(),
      resetDraft: () => { resetCalls += 1 }
    }
  })

  assert.equal(wrapper.classes().includes('settings-live-preview--advanced'), true)
  assert.equal(wrapper.get('[data-testid="settings-advanced-reset-card"]').text().includes(koText('SETTINGS_ADVANCED_DANGER_BADGE')), true)
  assert.equal(wrapper.get('[data-testid="settings-advanced-reset-card"]').text().includes(koText('SETTINGS_ADVANCED_RESET_DESCRIPTION')), true)
  const reset = wrapper.get('[data-testid="settings-advanced-reset"]')
  assert.equal(reset.attributes('aria-label'), koText('SETTINGS_ADVANCED_RESET_BUTTON'))
  await reset.trigger('click')
  assert.equal(resetCalls, 1)
  await wrapper.setProps({isSaving: true})
  assert.equal(reset.element.disabled, true)
  wrapper.unmount()
})

test('renders help as a bottom external link without changing the active page', async () => {
  const wrapper = mount(SettingsShell)
  await flushPromises()

  const help = wrapper.get('[data-navigation-id="help"]')
  assert.equal(help.element.tagName, 'A')
  assert.equal(help.attributes('href'), 'https://neverworkalone.github.io/naverdic/')
  assert.equal(help.attributes('target'), '_blank')
  assert.equal(help.attributes('rel'), 'noopener noreferrer')
  assert.equal(help.attributes('aria-current'), undefined)
  assert.equal(help.classes().includes('settings-navigation__item--help'), true)
  assert.equal(help.get('.settings-navigation__external-icon').attributes('aria-hidden'), 'true')
  assert.equal(wrapper.vm.activeNavigationId, 'appearance')

  await help.trigger('click')
  assert.equal(wrapper.vm.activeNavigationId, 'appearance')
  wrapper.unmount()
})
