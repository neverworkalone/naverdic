import assert from 'node:assert/strict'
import {mkdtemp, readFile, rm, writeFile} from 'node:fs/promises'
import path from 'node:path'
import {fileURLToPath, pathToFileURL} from 'node:url'
import {after, before, test} from 'node:test'
import {JSDOM} from 'jsdom'
import {compileScript, parse} from '@vue/compiler-sfc'

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

function respond(index, response) {
  requests[index]?.callback(response)
}

function mountPopup() {
  requests = []
  globalThis.chrome = {
    i18n: {getMessage: () => ''},
    runtime: {
      sendMessage: (request, callback) => {
        requests.push({request, callback})
      }
    }
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
  assert.equal(requests.length, 1)
  assert.equal(requests[0].request.action, 'endic')
  assert.match(requests[0].request.url, /query=test$/)

  respond(0, {ok: true, data: dictionaryResponse('test', '시험, 테스트')})
  await flushPromises()

  assert.equal(shell.attributes('data-state'), 'result')
  assert.equal(wrapper.get('.dictionary-result__word').text(), 'test')
  assert.equal(wrapper.get('.dictionary-result__meaning').text(), '1. 시험, 테스트')
  assert.equal(wrapper.find('.dictionary-result__audio-button').exists(), false)
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

test('uses the taller Figma result variant for long dictionary entries', async () => {
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

  assert.equal(wrapper.get('.naverdic-popup-shell').classes('naverdic-popup-shell--result-scroll'), true)
  assert.equal(wrapper.get('.dictionary-result').classes('dictionary-result--scrollable'), true)
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
