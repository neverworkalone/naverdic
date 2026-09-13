import assert from 'node:assert/strict'
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'
import {after, before, test} from 'node:test'
import {JSDOM} from 'jsdom'
import {compileScript, parse} from '@vue/compiler-sfc'
import {MESSAGE_ACTIONS} from '../src/messaging.mjs'
import {
  addRecentSearch,
  RECENT_SEARCH_STORAGE
} from '../src/recent-search.mjs'
import {normalizeSettingsV2, SETTINGS_STORAGE} from '../src/settings-v2.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
let tempRoot
let dom
let mount
let flushPromises
let Popup
let requests
let previousChrome

function exposeDomGlobal(name, value) {
  Object.defineProperty(globalThis, name, {configurable: true, writable: true, value})
}

function installDom() {
  dom = new JSDOM('<!doctype html><html><body></body></html>', {
    url: 'https://naverdic.test/'
  })
  for (const name of [
    'window', 'document', 'navigator', 'Node', 'Element', 'HTMLElement',
    'SVGElement', 'Event', 'CustomEvent', 'Text', 'Comment', 'Document',
    'DocumentFragment', 'HTMLInputElement', 'HTMLButtonElement',
    'HTMLFormElement', 'HTMLAudioElement', 'MutationObserver'
  ]) {
    exposeDomGlobal(name, dom.window[name])
  }
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

function rewriteImports(content, replacements = {}) {
  for (const [specifier, replacement] of Object.entries(replacements)) {
    content = content
      .replaceAll(`from '${specifier}'`, `from '${replacement}'`)
      .replaceAll(`from "${specifier}"`, `from "${replacement}"`)
  }
  const sourceUrl = `${pathToFileURL(path.join(projectRoot, 'src')).href}/`
  return content
    .replaceAll("from '/src/", `from '${sourceUrl}`)
    .replaceAll('from "/src/', `from "${sourceUrl}`)
}

async function compileVueModule(relativePath, replacements = {}) {
  const filename = path.join(projectRoot, relativePath)
  const source = await readFile(filename, 'utf8')
  const {descriptor, errors} = parse(source, {filename})
  assert.equal(errors.length, 0)
  const compiled = compileScript(descriptor, {
    id: 'toolbar-test-' + path.basename(relativePath),
    inlineTemplate: true
  })
  const modulePath = path.join(
    tempRoot,
    path.basename(relativePath, '.vue') + '-' + Math.random().toString(36).slice(2) + '.mjs'
  )
  await writeFile(modulePath, rewriteImports(compiled.content, replacements), 'utf8')
  return pathToFileURL(modulePath).href
}

function dictionaryResponse(word, meaning = 'meaning') {
  return {
    searchResultMap: {
      searchResultListMap: {
        WORD: {
          items: [{
            handleEntry: word,
            meansCollector: [{
              partOfSpeech: 'noun',
              means: [{order: '1', value: meaning}]
            }]
          }]
        }
      }
    }
  }
}

function dictionaryResponseForItems(items) {
  return {
    searchResultMap: {
      searchResultListMap: {
        WORD: {
          items: items.map(item => ({
            handleEntry: item.word,
            meansCollector: [{
              partOfSpeech: 'noun',
              means: [{order: '1', value: item.meaning}]
            }]
          }))
        }
      }
    }
  }
}

function koreanDictionaryResponse() {
  return {
    searchResultMap: {
      searchResultListMap: {
        WORD: {
          items: [
            {
              handleEntry: '',
              expEntry: '<strong>복수</strong>',
              meansCollector: [{
                partOfSpeech: '',
                means: [{
                  order: '',
                  value: '[명사] revenge, vengeance, [동사] (formal) avenge (oneself on sb), (formal) revenge oneself on sb, take revenge[vengeance] on sb, pay sb back for sth, get back at sb'
                }]
              }]
            },
            {
              handleEntry: '',
              expEntry: '<strong>복수</strong>',
              meansCollector: [{
                partOfSpeech: '',
                means: [{order: '', value: '(둘 이상의 수) the plural ((abb.)pl.)'}]
              }]
            },
            {
              handleEntry: '',
              expEntry: '<strong>복수</strong>의 칼[칼날]을 갈다',
              meansCollector: [{
                partOfSpeech: '',
                means: [{order: '', value: 'sharpen the sword of[the sword blade of] revenge'}]
              }]
            },
            {
              handleEntry: '',
              expEntry: '<strong>복수</strong>의',
              meansCollector: [{
                partOfSpeech: '',
                means: [{order: '', value: 'plural'}]
              }]
            },
            {
              handleEntry: '',
              expEntry: '단수와 <strong>복수</strong>',
              meansCollector: [{
                partOfSpeech: '',
                means: [{order: '', value: 'the singular (number) and the plural (number)'}]
              }]
            }
          ]
        }
      }
    }
  }
}

function respond(index, response) {
  requests[index]?.callback(response)
}

class PopupStorageArea {
  constructor(items = {}) {
    this.items = {...items}
    this.getCalls = []
    this.setCalls = []
    this.removeCalls = []
  }

  get(keys, callback) {
    this.getCalls.push(keys)
    const requestedKeys = Array.isArray(keys) ? keys : [keys]
    callback(Object.fromEntries(requestedKeys
      .filter(key => Object.prototype.hasOwnProperty.call(this.items, key))
      .map(key => [key, this.items[key]])))
  }

  set(values, callback) {
    this.setCalls.push({...values})
    Object.assign(this.items, values)
    callback?.()
  }

  remove(keys, callback) {
    const requestedKeys = Array.isArray(keys) ? keys : [keys]
    this.removeCalls.push([...requestedKeys])
    requestedKeys.forEach(key => delete this.items[key])
    callback?.()
  }
}

class DeferredPopupStorageArea extends PopupStorageArea {
  constructor(items = {}) {
    super(items)
    this.pendingGets = []
  }

  get(keys, callback) {
    this.getCalls.push(keys)
    const requestedKeys = Array.isArray(keys) ? keys : [keys]
    const values = Object.fromEntries(requestedKeys
      .filter(key => Object.prototype.hasOwnProperty.call(this.items, key))
      .map(key => [key, this.items[key]]))
    this.pendingGets.push({callback, values})
  }

  resolveNextGet() {
    const pending = this.pendingGets.shift()
    pending?.callback(pending.values)
  }
}

function createPopupStorage({enabled = false, searches = [], sync: providedSync = null} = {}) {
  const listeners = new Set()
  const sync = providedSync || new PopupStorageArea({
    [SETTINGS_STORAGE.settings.key]: {
      schemaVersion: 2,
      recentSearch: {enabled}
    }
  })
  const local = new PopupStorageArea(searches.length
    ? {[RECENT_SEARCH_STORAGE.key]: searches}
    : {})

  return {
    sync,
    local,
    onChanged: {
      addListener(listener) {
        listeners.add(listener)
      },
      removeListener(listener) {
        listeners.delete(listener)
      }
    },
    updateSettings(changes) {
      const oldValue = sync.items[SETTINGS_STORAGE.settings.key]
      const newValue = {...oldValue, ...changes}
      sync.items[SETTINGS_STORAGE.settings.key] = newValue
      for (const listener of listeners) {
        listener({
          [SETTINGS_STORAGE.settings.key]: {oldValue, newValue}
        }, 'sync')
      }
    },
    updateRecentSearchSetting(nextEnabled) {
      this.updateSettings({
        recentSearch: {
          ...sync.items[SETTINGS_STORAGE.settings.key].recentSearch,
          enabled: nextEnabled
        }
      })
    }
  }
}

function sameSearches(left, right) {
  return left.length === right.length && left.every((entry, index) => entry === right[index])
}

function respondToRecentSearchRequest(request, storage, callback) {
  if (request.operation === 'clear') {
    if (!storage?.local?.remove) {
      callback({ok: true, data: []})
      return
    }
    storage.local.remove(RECENT_SEARCH_STORAGE.key, () => {
      callback({ok: true, data: []})
    })
    return
  }

  const enabled = normalizeSettingsV2(
    storage?.sync?.items?.[SETTINGS_STORAGE.settings.key]
  ).recentSearch.enabled
  const current = storage?.local?.items?.[RECENT_SEARCH_STORAGE.key] || []
  const next = enabled ? addRecentSearch(current, request.term) : []
  if (enabled && !sameSearches(current, next)) {
    storage.local.set({[RECENT_SEARCH_STORAGE.key]: next}, () => {
      callback({ok: true, data: next})
    })
    return
  }

  callback({ok: true, data: next})
}

function mountPopup({storage = null} = {}) {
  requests = []
  globalThis.chrome = {
    i18n: {getMessage: () => ''},
    runtime: {
      sendMessage: (request, callback) => {
        if (request.action === MESSAGE_ACTIONS.RECENT_SEARCH) {
          respondToRecentSearchRequest(request, storage, callback)
          return
        }
        requests.push({request, callback})
      }
    },
    ...(storage ? {storage} : {})
  }
  return mount(Popup)
}

before(async () => {
  installDom()
  previousChrome = globalThis.chrome
  tempRoot = await mkdtemp(path.join(projectRoot, '.tmp-naverdic-toolbar-tests-'))
  const textModuleUrl = await createTextModule()
  const dictionaryResultUrl = await compileVueModule(
    'src/components/DictionaryResult.vue',
    {'/src/text.js': textModuleUrl}
  )
  const popupUrl = await compileVueModule(
    'src/components/Popup.vue',
    {
      '/src/components/DictionaryResult.vue': dictionaryResultUrl,
      '/src/text.js': textModuleUrl
    }
  )
  Popup = (await import(popupUrl + '?test=' + Date.now())).default
  const testUtils = await import('@vue/test-utils')
  mount = testUtils.mount
  flushPromises = testUtils.flushPromises
})

after(async () => {
  globalThis.chrome = previousChrome
  await rm(tempRoot, {recursive: true, force: true})
  dom?.window.close()
})

test('matches the v7 toolbar shell and renders a dictionary result', async () => {
  const wrapper = mountPopup()
  const shell = wrapper.get('.naverdic-popup-shell')
  assert.equal(shell.attributes('data-state'), 'idle')
  assert.equal(wrapper.get('.naverdic-popup-search__input').attributes('placeholder'), '단어를 입력하세요')
  assert.equal(wrapper.get('.naverdic-popup-search__button').text(), '검색')
  assert.equal(wrapper.get('.naverdic-popup-footer a').attributes('href'), 'options.html')

  await wrapper.get('.naverdic-popup-search__input').setValue('test')
  await wrapper.get('.naverdic-popup-search').trigger('submit')
  assert.equal(shell.attributes('data-state'), 'loading')
  assert.equal(shell.attributes('aria-busy'), 'true')
  assert.equal(wrapper.find('.naverdic-popup-status').exists(), false)
  assert.equal(requests.length, 1)
  assert.equal(requests[0].request.action, 'endic')
  assert.match(requests[0].request.url, /query=test$/)

  respond(0, {ok: true, data: dictionaryResponse('test', '시험, 테스트')})
  await flushPromises()

  assert.equal(shell.attributes('data-state'), 'result')
  assert.equal(shell.attributes('aria-busy'), 'false')
  assert.equal(wrapper.get('.dictionary-result__word').text(), 'test')
  assert.equal(wrapper.get('.dictionary-result__meaning').text(), '1. 시험, 테스트')
  assert.equal(wrapper.find('.dictionary-result__audio-button').exists(), false)
  assert.equal(wrapper.get('.naverdic-popup-body .naverdic-popup-footer').exists(), true)
  wrapper.unmount()
})

test('keeps recent searches completely absent when the opt-in setting is off', async () => {
  const storage = createPopupStorage()
  const wrapper = mountPopup({storage})
  await flushPromises()

  assert.equal(wrapper.find('[data-testid="popup-recent-search"]').exists(), false)

  await wrapper.get('.naverdic-popup-search__input').setValue('test')
  await wrapper.get('.naverdic-popup-search').trigger('submit')
  respond(0, {ok: true, data: dictionaryResponse('test')})
  await flushPromises()

  assert.equal(storage.local.setCalls.length, 0)
  assert.equal(RECENT_SEARCH_STORAGE.key in storage.local.items, false)
  wrapper.unmount()
})

test('renders up to 20 stored recent words in the Figma-aligned two-column panel', async () => {
  const searches = [
    'elaborate', 'subtle', 'beneath', 'reckon', 'linger', 'ambiguous',
    'reluctant', 'glimpse', 'weary', 'obscure', 'tremble', 'hollow',
    'murmur', 'faint', 'peculiar', 'stumble', 'solemn', 'drift',
    'scarce', 'intricate'
  ]
  const wrapper = mountPopup({storage: createPopupStorage({enabled: true, searches})})
  await flushPromises()

  const panel = wrapper.get('[data-testid="popup-recent-search"]')
  assert.equal(panel.get('.naverdic-popup-recent__title').text(), '최근 검색')
  assert.equal(panel.get('[data-testid="popup-recent-search-clear"]').text(), '지우기')
  assert.equal(panel.get('.naverdic-popup-recent__grid').classes('naverdic-popup-recent__grid'), true)
  assert.equal(panel.findAll('[data-testid="popup-recent-search-item"]').length, 20)
  assert.deepEqual(
    panel.findAll('[data-testid="popup-recent-search-item"]').slice(0, 4).map(item => item.text()),
    ['elaborate', 'subtle', 'beneath', 'reckon']
  )
  assert.equal(wrapper.get('.naverdic-popup-footer').exists(), true)
  wrapper.unmount()
})

test('records only valid toolbar words, moves duplicates to the front, and clears on request', async () => {
  const storage = createPopupStorage({enabled: true})
  const wrapper = mountPopup({storage})
  await flushPromises()

  const input = wrapper.get('.naverdic-popup-search__input')
  const form = wrapper.get('.naverdic-popup-search')
  await input.setValue('Hello')
  await form.trigger('submit')
  respond(0, {ok: true, data: dictionaryResponse('hello')})
  await flushPromises()
  await input.setValue('복수')
  await form.trigger('submit')
  respond(1, {ok: true, data: dictionaryResponse('복수')})
  await flushPromises()
  await input.setValue('hello world')
  await form.trigger('submit')
  respond(2, {ok: true, data: dictionaryResponse('hello world')})
  await flushPromises()
  await input.setValue("can't")
  await form.trigger('submit')
  respond(3, {ok: true, data: dictionaryResponse("can't")})
  await flushPromises()
  await input.setValue('HELLO')
  await form.trigger('submit')
  respond(4, {ok: true, data: dictionaryResponse('hello')})
  await flushPromises()

  assert.deepEqual(storage.local.items[RECENT_SEARCH_STORAGE.key], ['hello', "can't"])

  await input.setValue('')
  await form.trigger('submit')
  await flushPromises()
  await wrapper.get('[data-testid="popup-recent-search-clear"]').trigger('click')
  await flushPromises()
  assert.equal(RECENT_SEARCH_STORAGE.key in storage.local.items, false)
  assert.equal(wrapper.find('[data-testid="popup-recent-search"]').exists(), false)
  wrapper.unmount()
})

test('hides and stops recording immediately when the saved setting changes to off', async () => {
  const storage = createPopupStorage({enabled: true, searches: ['stored']})
  const wrapper = mountPopup({storage})
  await flushPromises()
  assert.equal(wrapper.find('[data-testid="popup-recent-search"]').exists(), true)

  storage.updateRecentSearchSetting(false)
  await flushPromises()
  assert.equal(wrapper.find('[data-testid="popup-recent-search"]').exists(), false)
  assert.equal(RECENT_SEARCH_STORAGE.key in storage.local.items, false)

  await wrapper.get('.naverdic-popup-search__input').setValue('newword')
  await wrapper.get('.naverdic-popup-search').trigger('submit')
  respond(0, {ok: true, data: dictionaryResponse('newword')})
  await flushPromises()
  assert.equal(storage.local.setCalls.length, 0)
  wrapper.unmount()
})

test('ignores a stale initial settings read after the feature is turned off', async () => {
  const sync = new DeferredPopupStorageArea({
    [SETTINGS_STORAGE.settings.key]: {
      schemaVersion: 2,
      recentSearch: {enabled: true}
    }
  })
  const storage = createPopupStorage({sync, searches: ['stored']})
  const wrapper = mountPopup({storage})
  await flushPromises()

  storage.updateRecentSearchSetting(false)
  await flushPromises()
  sync.resolveNextGet()
  await flushPromises()

  assert.equal(wrapper.find('[data-testid="popup-recent-search"]').exists(), false)
  await wrapper.get('.naverdic-popup-search__input').setValue('newword')
  await wrapper.get('.naverdic-popup-search').trigger('submit')
  respond(0, {ok: true, data: dictionaryResponse('newword')})
  await flushPromises()
  assert.equal(storage.local.setCalls.length, 0)
  wrapper.unmount()
})

test('does not reload recent history when an unrelated settings value changes', async () => {
  const storage = createPopupStorage({enabled: true, searches: ['stored']})
  const wrapper = mountPopup({storage})
  await flushPromises()
  const syncReads = storage.sync.getCalls.length
  const localReads = storage.local.getCalls.length

  storage.updateSettings({popup: {fontSizePt: 12}})
  await flushPromises()

  assert.equal(storage.sync.getCalls.length, syncReads)
  assert.equal(storage.local.getCalls.length, localReads)
  assert.equal(wrapper.find('[data-testid="popup-recent-search"]').exists(), true)
  wrapper.unmount()
})

test('searches immediately when a recent word is clicked', async () => {
  const wrapper = mountPopup({
    storage: createPopupStorage({enabled: true, searches: ['first', 'second']})
  })
  await flushPromises()

  await wrapper.findAll('[data-testid="popup-recent-search-item"]')[1].trigger('click')
  assert.equal(requests.length, 1)
  assert.match(requests[0].request.url, /query=second$/)
  assert.equal(wrapper.get('.naverdic-popup-search__input').element.value, 'second')
  respond(0, {ok: true, data: dictionaryResponse('second')})
  await flushPromises()
  wrapper.unmount()
})

test('ignores an older toolbar response after a newer search starts', async () => {
  const wrapper = mountPopup()
  const input = wrapper.get('.naverdic-popup-search__input')
  const form = wrapper.get('.naverdic-popup-search')

  await input.setValue('first')
  await form.trigger('submit')
  await input.setValue('second')
  await form.trigger('submit')
  assert.equal(requests.length, 2)

  respond(0, {ok: true, data: dictionaryResponse('first')})
  respond(1, {ok: true, data: dictionaryResponse('second')})
  await flushPromises()

  assert.equal(wrapper.get('.dictionary-result__word').text(), 'second')
  wrapper.unmount()
})

test('keeps the previous toolbar result visible while a newer lookup is pending', async () => {
  const wrapper = mountPopup()
  const input = wrapper.get('.naverdic-popup-search__input')
  const form = wrapper.get('.naverdic-popup-search')
  const shell = wrapper.get('.naverdic-popup-shell')

  await input.setValue('first')
  await form.trigger('submit')
  respond(0, {ok: true, data: dictionaryResponse('first', '첫 번째 결과')})
  await flushPromises()

  await input.setValue('second')
  await form.trigger('submit')

  assert.equal(shell.attributes('data-state'), 'loading')
  assert.equal(shell.attributes('aria-busy'), 'true')
  assert.equal(shell.classes('naverdic-popup-shell--result'), true)
  assert.equal(wrapper.get('.dictionary-result__word').text(), 'first')
  assert.equal(wrapper.find('.naverdic-popup-status').exists(), false)

  respond(1, {ok: true, data: dictionaryResponse('second', '두 번째 결과')})
  await flushPromises()
  assert.equal(wrapper.get('.dictionary-result__word').text(), 'second')
  wrapper.unmount()
})

test('resets toolbar result scroll when a new lookup starts', async () => {
  const wrapper = mountPopup()
  const input = wrapper.get('.naverdic-popup-search__input')
  const form = wrapper.get('.naverdic-popup-search')
  const body = wrapper.get('.naverdic-popup-body')

  await input.setValue('issue')
  await form.trigger('submit')
  respond(0, {
    ok: true,
    data: dictionaryResponseForItems([
      {word: 'one', meaning: '첫 번째 뜻'},
      {word: 'two', meaning: '두 번째 뜻'},
      {word: 'three', meaning: '세 번째 뜻'},
      {word: 'four', meaning: '네 번째 뜻'},
      {word: 'five', meaning: '다섯 번째 뜻'},
      {word: 'six', meaning: '여섯 번째 뜻'}
    ])
  })
  await flushPromises()

  body.element.scrollTop = 240
  assert.equal(body.element.scrollTop, 240)

  await input.setValue('test')
  await form.trigger('submit')
  assert.equal(body.element.scrollTop, 0)

  respond(1, {ok: true, data: dictionaryResponse('test')})
  await flushPromises()
  wrapper.unmount()
})

test('uses the whole popup body for long dictionary entries', async () => {
  const wrapper = mountPopup()
  await wrapper.get('.naverdic-popup-search__input').setValue('test')
  await wrapper.get('.naverdic-popup-search').trigger('submit')
  respond(0, {
    ok: true,
    data: {
      searchResultMap: {
        searchResultListMap: {
          WORD: {
            items: [{
              handleEntry: 'test',
              meansCollector: [{
                partOfSpeech: 'noun',
                means: [
                  {order: '1', value: '시험, 테스트'},
                  {order: '2', value: '검사'},
                  {order: '3', value: '시험하다'}
                ]
              }]
            }]
          }
        }
      }
    }
  })
  await flushPromises()

  assert.equal(wrapper.get('.naverdic-popup-shell').classes('naverdic-popup-shell--result'), true)
  assert.equal(wrapper.get('.naverdic-popup-body').classes('naverdic-popup-body--result'), true)
  assert.equal(wrapper.get('.naverdic-popup-body .naverdic-popup-footer').exists(), true)
  wrapper.unmount()
})

test('renders multiple concise entries in the same whole-body scroll layout', async () => {
  const wrapper = mountPopup()
  await wrapper.get('.naverdic-popup-search__input').setValue('test')
  await wrapper.get('.naverdic-popup-search').trigger('submit')
  respond(0, {
    ok: true,
    data: dictionaryResponseForItems([
      {word: 'one', meaning: '짧은 뜻'},
      {word: 'two', meaning: '짧은 뜻'},
      {word: 'three', meaning: '짧은 뜻'},
      {word: 'four', meaning: '짧은 뜻'},
      {word: 'five', meaning: '짧은 뜻'},
      {word: 'six', meaning: '짧은 뜻'}
    ])
  })
  await flushPromises()

  assert.equal(wrapper.get('.naverdic-popup-shell').classes('naverdic-popup-shell--result'), true)
  assert.equal(wrapper.get('.naverdic-popup-body').classes('naverdic-popup-body--result'), true)
  assert.equal(wrapper.findAll('.dictionary-result__entry').length, 6)
  assert.equal(wrapper.get('.naverdic-popup-body .naverdic-popup-footer').exists(), true)
  wrapper.unmount()
})

test('renders Korean-query entries without reserving empty heading rows', async () => {
  const wrapper = mountPopup()
  await wrapper.get('.naverdic-popup-search__input').setValue('복수')
  await wrapper.get('.naverdic-popup-search').trigger('submit')

  assert.equal(requests.length, 1)
  assert.match(requests[0].request.url, /query=%EB%B3%B5%EC%88%98$/)

  respond(0, {ok: true, data: koreanDictionaryResponse()})
  await flushPromises()

  assert.equal(wrapper.findAll('.dictionary-result__entry').length, 5)
  assert.equal(wrapper.findAll('.dictionary-result__header').length, 0)
  assert.equal(wrapper.findAll('.dictionary-result__divider').length, 0)
  assert.equal(wrapper.findAll('.dictionary-result__meaning')[0].text().startsWith('. '), true)
  assert.equal(wrapper.findAll('.dictionary-result__meaning')[1].text(), '. (둘 이상의 수) the plural ((abb.)pl.)')
  assert.equal(wrapper.findAll('.dictionary-result__meaning')[2].text(), '. sharpen the sword of[the sword blade of] revenge')
  wrapper.unmount()
})

test('shows empty and network-error states without leaving stale results', async () => {
  const wrapper = mountPopup()
  const input = wrapper.get('.naverdic-popup-search__input')
  const form = wrapper.get('.naverdic-popup-search')

  await input.setValue('missing')
  await form.trigger('submit')
  respond(0, {ok: true, data: {searchResultMap: {searchResultListMap: {WORD: {items: []}}}}})
  await flushPromises()
  assert.equal(wrapper.get('.naverdic-popup-shell').attributes('data-state'), 'empty')
  assert.equal(wrapper.get('[role="status"]').text(), '결과가 없습니다.')

  await input.setValue('error')
  await form.trigger('submit')
  respond(1, {
    ok: false,
    error: {code: 'NETWORK_ERROR', message: 'offline'}
  })
  await flushPromises()
  assert.equal(wrapper.get('.naverdic-popup-shell').attributes('data-state'), 'error')
  assert.equal(wrapper.get('[role="alert"]').text(), '결과를 불러오지 못했습니다. 다시 시도해 주세요.')
  assert.equal(wrapper.find('.dictionary-result').exists(), false)
  wrapper.unmount()
})

test('removes the pronunciation button when toolbar audio cannot play', async () => {
  const wrapper = mountPopup()
  await wrapper.get('.naverdic-popup-search__input').setValue('sound')
  await wrapper.get('.naverdic-popup-search').trigger('submit')
  respond(0, {
    ok: true,
    data: {
      searchResultMap: {
        searchResultListMap: {
          WORD: {
            items: [{
              handleEntry: 'sound',
              searchPhoneticSymbolList: [{
                symbolValue: 'saʊnd',
                symbolFile: 'https://example.com/sound.mp3'
              }],
              meansCollector: [{
                partOfSpeech: 'noun',
                means: [{order: '1', value: '소리'}]
              }]
            }]
          }
        }
      }
    }
  })
  await flushPromises()

  const audio = wrapper.get('.dictionary-result__audio')
  assert.equal(wrapper.get('.dictionary-result__audio-button').exists(), true)
  audio.element.pause = () => {}
  audio.element.dispatchEvent(new Event('error'))
  await flushPromises()
  assert.equal(wrapper.find('.dictionary-result__audio-button').exists(), false)
  assert.equal(wrapper.find('.dictionary-result__audio-unavailable').exists(), false)
  wrapper.unmount()
})

test('switches the pronunciation control between play and pause while audio runs', async () => {
  const wrapper = mountPopup()
  await wrapper.get('.naverdic-popup-search__input').setValue('sound')
  await wrapper.get('.naverdic-popup-search').trigger('submit')
  respond(0, {
    ok: true,
    data: {
      searchResultMap: {
        searchResultListMap: {
          WORD: {
            items: [{
              handleEntry: 'sound',
              searchPhoneticSymbolList: [{
                symbolValue: 'saʊnd',
                symbolFile: 'https://example.com/sound.mp3'
              }],
              meansCollector: [{
                partOfSpeech: 'noun',
                means: [{order: '1', value: '소리'}]
              }]
            }]
          }
        }
      }
    }
  })
  await flushPromises()

  const audio = wrapper.get('.dictionary-result__audio')
  let playCalls = 0
  let pauseCalls = 0
  audio.element.play = () => {
    playCalls += 1
    return Promise.resolve()
  }
  audio.element.pause = () => {
    pauseCalls += 1
    audio.element.dispatchEvent(new Event('pause'))
  }

  const button = wrapper.get('.dictionary-result__audio-button')
  assert.equal(button.attributes('aria-label'), '발음 재생')
  await button.trigger('click')
  await flushPromises()
  assert.equal(playCalls, 1)
  assert.equal(button.attributes('aria-label'), '발음 일시정지')
  assert.equal(wrapper.find('.dictionary-result__pause-icon').exists(), true)

  await button.trigger('click')
  await flushPromises()
  assert.equal(pauseCalls, 1)
  assert.equal(button.attributes('aria-label'), '발음 재생')
  assert.equal(wrapper.find('.dictionary-result__pause-icon').exists(), false)

  await button.trigger('click')
  await flushPromises()
  audio.element.dispatchEvent(new Event('ended'))
  await flushPromises()
  assert.equal(button.attributes('aria-label'), '발음 재생')
  wrapper.unmount()
})
