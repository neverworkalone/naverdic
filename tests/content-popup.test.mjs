import assert from 'node:assert/strict'
import test from 'node:test'
import {JSDOM} from 'jsdom'

import {
  calculatePopupPosition,
  createPopupAnchor,
  getDocumentViewport
} from '../src/content-position.mjs'
import {createPopupController, POPUP_STATES} from '../src/content-popup.mjs'
import {
  createPopupRequestCoordinator,
  POPUP_REQUEST_STATUSES
} from '../src/content-request.mjs'
import {
  SETTINGS_STORAGE,
  createDefaultSecretsV2,
  createInitialSettingsV2
} from '../src/settings-v2.mjs'

const VIEWPORT = {
  left: 0,
  top: 0,
  right: 1000,
  bottom: 800,
  width: 1000,
  height: 800
}

const POPUP_SIZE = {width: 360, height: 200}

test('positions the inline popup in all four viewport quadrants', () => {
  const cases = [
    {
      name: 'below-right',
      anchorRect: {left: 300, right: 360, top: 250, bottom: 270},
      direction: 'below-right',
      left: 300,
      top: 282
    },
    {
      name: 'below-left near the right edge',
      anchorRect: {left: 850, right: 900, top: 250, bottom: 270},
      direction: 'below-left',
      left: 540,
      top: 282
    },
    {
      name: 'above-right near the bottom edge',
      anchorRect: {left: 300, right: 360, top: 680, bottom: 700},
      direction: 'above-right',
      left: 300,
      top: 468
    },
    {
      name: 'above-left near the bottom-right corner',
      anchorRect: {left: 850, right: 900, top: 680, bottom: 700},
      direction: 'above-left',
      left: 540,
      top: 468
    }
  ]

  for (const expected of cases) {
    const result = calculatePopupPosition({
      anchorRect: expected.anchorRect,
      popupSize: POPUP_SIZE,
      viewport: VIEWPORT
    })

    assert.equal(result.direction, expected.direction, expected.name)
    assert.equal(result.left, expected.left, expected.name)
    assert.equal(result.top, expected.top, expected.name)
    assert.ok(result.left >= VIEWPORT.left + 10, expected.name)
    assert.ok(result.left + result.width <= VIEWPORT.right - 10, expected.name)
    assert.ok(result.top >= VIEWPORT.top + 10, expected.name)
    assert.ok(result.top + POPUP_SIZE.height <= VIEWPORT.bottom - 10, expected.name)
  }
})

test('accounts for scroll and the visual viewport when calculating document bounds', () => {
  const fakeWindow = {
    scrollX: 120,
    scrollY: 240,
    innerWidth: 1000,
    innerHeight: 800,
    visualViewport: {
      offsetLeft: 15,
      offsetTop: 25,
      width: 600,
      height: 500
    }
  }

  assert.deepEqual(getDocumentViewport(fakeWindow), {
    left: 135,
    top: 265,
    right: 735,
    bottom: 765,
    width: 600,
    height: 500,
    scrollX: 120,
    scrollY: 240,
    visualLeft: 15,
    visualTop: 25
  })

  const position = calculatePopupPosition({
    anchorRect: {left: 650, right: 690, top: 680, bottom: 700},
    popupSize: POPUP_SIZE,
    viewport: getDocumentViewport(fakeWindow)
  })

  assert.equal(position.direction, 'above-left')
  assert.ok(position.left >= 145)
  assert.ok(position.top >= 275)
})

test('limits tall results to the available side and returns a scroll budget', () => {
  const result = calculatePopupPosition({
    anchorRect: {left: 300, right: 360, top: 580, bottom: 600},
    popupSize: {width: 360, height: 1000},
    viewport: VIEWPORT
  })

  assert.equal(result.vertical, 'above')
  assert.equal(result.maxHeight, 558)
  assert.equal(result.top, 10)
})

test('keeps a live selection anchor and falls back to the triggering event', () => {
  const selection = {
    rangeCount: 1,
    getRangeAt: () => ({
      getBoundingClientRect: () => ({
        left: 40,
        right: 90,
        top: 100,
        bottom: 122,
        width: 50,
        height: 22
      })
    })
  }
  const anchor = createPopupAnchor({
    selection,
    event: {clientX: 10, clientY: 20}
  })

  assert.equal(anchor.getRect().left, 40)
  const scrolledAnchor = createPopupAnchor({
    selection,
    event: {clientX: 10, clientY: 20},
    window: {scrollX: 100, scrollY: 200}
  })
  assert.equal(scrolledAnchor.getRect().left, 140)
  assert.equal(scrolledAnchor.getRect().top, 300)
  selection.getRangeAt = () => {
    throw new Error('selection disappeared')
  }
  assert.equal(anchor.getRect().left, 10)
})

test('ignores a late response after a newer selection starts', async () => {
  const coordinator = createPopupRequestCoordinator()
  let resolveFirst
  let resolveSecond
  let firstSignal

  const first = coordinator.run(({signal}) => {
    firstSignal = signal
    return new Promise(resolve => {
      resolveFirst = resolve
    })
  })
  const second = coordinator.run(() => new Promise(resolve => {
    resolveSecond = resolve
  }))

  assert.equal(firstSignal.aborted, true)
  resolveFirst('old result')
  resolveSecond('new result')

  const [firstResult, secondResult] = await Promise.all([first, second])
  assert.equal(firstResult.status, POPUP_REQUEST_STATUSES.STALE)
  assert.equal(secondResult.status, POPUP_REQUEST_STATUSES.SUCCESS)
  assert.equal(secondResult.data, 'new result')
})

test('renders common states inside an isolated shadow popup and closes on outside or Escape', () => {
  const dom = new JSDOM('<!doctype html><body></body>', {url: 'https://example.com/'})
  const {document, window} = dom.window
  const controller = createPopupController({
    document,
    window,
    loadStylesheet: () => Promise.resolve('.naverdic-popup { color: red; }'),
    getText: id => ({
      INLINE_POPUP_DICTIONARY_TITLE: 'Dictionary',
      INLINE_POPUP_TRANSLATION_TITLE: 'Translation',
      INLINE_POPUP_LOADING: 'Loading',
      INLINE_POPUP_NO_RESULT: 'No result',
      INLINE_POPUP_NETWORK_ERROR: 'Network error',
      INLINE_POPUP_AUDIO_UNAVAILABLE: 'Audio unavailable'
    }[id] || id)
  })

  controller.open({
    popupType: 'dictionary',
    popupAnchor: {getRect: () => ({left: 100, right: 140, top: 100, bottom: 120})}
  })

  const host = document.getElementById('popupFrame')
  assert.ok(host)
  assert.ok(host.shadowRoot)
  assert.equal(host.shadowRoot.querySelector('#popupShadow').dataset.state, POPUP_STATES.LOADING)
  assert.ok(host.shadowRoot.querySelector('style'))

  controller.update(POPUP_STATES.RESULT, [{
    word: 'hello',
    dictionaryUrl: 'https://en.dict.naver.com/#/search?query=hello',
    partOfSpeech: 'noun',
    phoneticSymbol: 'həˈloʊ',
    audioUrl: 'https://example.com/hello.mp3',
    meanings: [{order: '1', value: '안녕하세요'}]
  }])
  assert.equal(host.shadowRoot.querySelector('.naverdic-wordTitle a').textContent, 'hello')
  assert.equal(host.shadowRoot.querySelector('audio').getAttribute('controlslist'), 'nodownload')
  assert.equal(host.shadowRoot.querySelector('audio').id, '')

  document.body.dispatchEvent(new window.Event('pointerdown', {bubbles: true}))
  assert.equal(controller.isOpen(), false)

  controller.open({
    popupType: 'translation',
    popupAnchor: {getRect: () => ({left: 100, right: 140, top: 100, bottom: 120})}
  })
  document.dispatchEvent(new window.KeyboardEvent('keydown', {key: 'Escape', bubbles: true}))
  assert.equal(controller.isOpen(), false)
  dom.window.close()
})

test('installs dictionary interaction while Chrome Translator availability is pending', async () => {
  const dom = new JSDOM(
    '<!doctype html><body><p id="word">hello</p></body>',
    {url: 'https://example.com/', pretendToBeVisual: true}
  )
  const {document, window} = dom.window
  const settings = createInitialSettingsV2()
  settings.dictionary.drag.enabled = false
  const secrets = createDefaultSecretsV2()
  const listeners = new Set()
  const storage = {
    sync: {
      get: (_keys, callback) => callback({
        [SETTINGS_STORAGE.settings.key]: settings
      })
    },
    local: {
      get: (_keys, callback) => callback({
        [SETTINGS_STORAGE.secrets.key]: secrets
      })
    },
    onChanged: {
      addListener: listener => listeners.add(listener),
      removeListener: listener => listeners.delete(listener)
    }
  }
  let resolveAvailability
  const availability = new Promise(resolve => {
    resolveAvailability = resolve
  })
  const previousGlobals = {
    chrome: globalThis.chrome,
    document: globalThis.document,
    fetch: globalThis.fetch,
    navigator: globalThis.navigator,
    self: globalThis.self,
    window: globalThis.window
  }

  globalThis.window = window
  globalThis.document = document
  globalThis.navigator = window.navigator
  globalThis.self = window
  globalThis.fetch = async () => ({ok: false})
  window.Translator = {
    availability: () => availability,
    create: () => Promise.resolve({translate: async () => '안녕'})
  }
  globalThis.chrome = {
    storage,
    runtime: {
      getURL: name => `https://extension.test/${name}`,
      sendMessage: (_request, callback) => callback({
        ok: true,
        data: {searchResult: {searchResultList: []}}
      })
    },
    i18n: {getMessage: () => ''}
  }

  try {
    const range = document.createRange()
    const text = document.getElementById('word').firstChild
    range.setStart(text, 0)
    range.setEnd(text, text.length)
    const selection = window.getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
    window.getSelection = () => selection

    const content = await import(`../src/content.js?pending-availability=${Date.now()}`)
    content.main()
    await new Promise(resolve => setImmediate(resolve))

    for (let index = 0; index < 2; index += 1) {
      document.dispatchEvent(new window.MouseEvent('mousedown', {
        bubbles: true,
        button: 0,
        clientX: 100,
        clientY: 100
      }))
      document.dispatchEvent(new window.MouseEvent('mouseup', {
        bubbles: true,
        button: 0,
        clientX: 100,
        clientY: 100
      }))
    }

    assert.ok(document.getElementById('popupFrame'))
    assert.equal(listeners.size, 1)

    resolveAvailability('available')
    await new Promise(resolve => setImmediate(resolve))
    content.unregisterEventListener()
  } finally {
    globalThis.chrome = previousGlobals.chrome
    globalThis.document = previousGlobals.document
    globalThis.fetch = previousGlobals.fetch
    globalThis.navigator = previousGlobals.navigator
    globalThis.self = previousGlobals.self
    globalThis.window = previousGlobals.window
    dom.window.close()
  }
})
