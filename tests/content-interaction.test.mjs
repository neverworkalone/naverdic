import assert from 'node:assert/strict'
import test from 'node:test'

import {
  checkTrigger,
  createInteractionController,
  getDictionaryQuery,
  getSelectionText,
  isDeniedSite,
  normalizeDenyList,
  normalizeSelectionText
} from '../src/content-interaction.mjs'

class FakeEventTarget {
  constructor() {
    this.listeners = new Map()
  }

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set())
    }
    this.listeners.get(type).add(listener)
  }

  removeEventListener(type, listener) {
    this.listeners.get(type)?.delete(listener)
  }

  dispatch(type, event = {}) {
    this.listeners.get(type)?.forEach(listener => listener(event))
  }

  listenerCount(type) {
    return this.listeners.get(type)?.size || 0
  }
}

function mouseEvent(overrides = {}) {
  return {
    button: 0,
    clientX: 0,
    clientY: 0,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    ...overrides
  }
}

test('normalizes selected text and prevents whitespace-only selections', () => {
  assert.equal(
    normalizeSelectionText(' \u00a0Hello\t world\r\n next \u200B '),
    'Hello world\nnext'
  )
  assert.equal(normalizeSelectionText('\u200B\uFEFF\n\t'), '')
  assert.equal(getDictionaryQuery('  HELLO\nworld  '), 'hello world')
  assert.equal(getDictionaryQuery('   '), '')
  assert.equal(getDictionaryQuery('한글'), '')
  assert.equal(getDictionaryQuery('one two three four five six'), '')
})

test('reads selected range text and safely handles an empty selection', () => {
  const selection = {
    rangeCount: 1,
    getRangeAt() {
      return {
        cloneContents() {
          return {textContent: '  selected\n text  '}
        }
      }
    },
    toString() {
      return '  selected\n text  '
    }
  }

  assert.equal(getSelectionText(selection), 'selected\ntext')
  assert.equal(getSelectionText({
    rangeCount: 1,
    getRangeAt: () => ({cloneContents: () => ({textContent: '  range fallback  '})})
  }), 'range fallback')
  assert.equal(getSelectionText({rangeCount: 0, toString: () => 'ignored'}), '')
  assert.equal(getSelectionText(null), '')
})

test('matches configured trigger keys on Windows and macOS', () => {
  assert.equal(checkTrigger(mouseEvent(), 'none', 'Win32'), true)
  assert.equal(checkTrigger(mouseEvent({ctrlKey: true}), 'none', 'Win32'), false)
  assert.equal(checkTrigger(mouseEvent({altKey: true}), 'alt', 'Win32'), true)
  assert.equal(checkTrigger(mouseEvent({ctrlKey: true, altKey: true}), 'ctrl', 'Win32'), false)
  assert.equal(checkTrigger(mouseEvent({ctrlKey: true, altKey: true}), 'ctrlalt', 'Win32'), true)
  assert.equal(checkTrigger(mouseEvent({metaKey: true}), 'ctrl', 'Win32'), false)
  assert.equal(checkTrigger(mouseEvent({metaKey: true}), 'ctrl', 'MacIntel'), true)
  assert.equal(checkTrigger(mouseEvent({ctrlKey: true}), 'none', 'MacIntel'), false)
  assert.equal(checkTrigger(mouseEvent({metaKey: true, altKey: true}), 'ctrlalt', 'MacIntel'), true)
  assert.equal(checkTrigger(mouseEvent({metaKey: true, ctrlKey: true}), 'ctrl', 'MacIntel'), false)
})

test('matches deny-list hosts by exact domain or subdomain boundary', () => {
  assert.deepEqual(normalizeDenyList(' example.com, https://www.naver.com/path\n'), [
    'example.com',
    'www.naver.com'
  ])
  assert.equal(isDeniedSite('example.com', 'example.com'), true)
  assert.equal(isDeniedSite('docs.example.com', 'example.com'), true)
  assert.equal(isDeniedSite('not-example.com', 'example.com'), false)
  assert.equal(isDeniedSite('example.com:8443', 'example.com'), true)
  assert.equal(isDeniedSite('example.com', 'example.com', false), false)
  assert.equal(isDeniedSite('example.com', 'other.com'), false)
})

test('distinguishes vertical/horizontal drags from a double click', () => {
  const target = new FakeEventTarget()
  const opened = []
  let removed = 0
  const controller = createInteractionController({
    dclick: true,
    dclick_trigger_key: 'none',
    dclick_speed: 400,
    drag: true,
    drag_trigger_key: 'ctrl',
    translate: false
  }, {
    target,
    openPopup: (...args) => opened.push(args),
    removePopup: () => { removed += 1 }
  })

  target.dispatch('mousedown', mouseEvent({clientX: 10, clientY: 10}))
  target.dispatch('mousemove', mouseEvent({clientX: 10, clientY: 30}))
  target.dispatch('mouseup', mouseEvent({clientX: 10, clientY: 30, ctrlKey: true}))
  assert.equal(opened.length, 1)

  target.dispatch('mousedown', mouseEvent({clientX: 20, clientY: 20}))
  target.dispatch('mouseup', mouseEvent({clientX: 20, clientY: 20}))
  target.dispatch('mousedown', mouseEvent({clientX: 20, clientY: 20}))
  target.dispatch('mouseup', mouseEvent({clientX: 20, clientY: 20}))
  assert.equal(opened.length, 2)
  assert.equal(removed >= 3, true)

  controller.destroy()
  assert.equal(target.listenerCount('mousedown'), 0)
  assert.equal(target.listenerCount('mousemove'), 0)
  assert.equal(target.listenerCount('mouseup'), 0)
})

test('destroying the previous controller prevents duplicate event handling', () => {
  const target = new FakeEventTarget()
  const opened = []
  const options = {
    dclick: true,
    dclick_trigger_key: 'none',
    dclick_speed: 400,
    drag: false,
    translate: false
  }

  const first = createInteractionController(options, {
    target,
    openPopup: () => opened.push('first')
  })
  first.destroy()

  const second = createInteractionController(options, {
    target,
    openPopup: () => opened.push('second')
  })

  target.dispatch('mousedown', mouseEvent())
  target.dispatch('mouseup', mouseEvent())
  target.dispatch('mousedown', mouseEvent())
  target.dispatch('mouseup', mouseEvent())

  assert.deepEqual(opened, ['second'])
  assert.equal(target.listenerCount('mouseup'), 1)
  second.destroy()
})

test('routes a triggered drag to translation when dictionary drag is disabled', () => {
  const target = new FakeEventTarget()
  const opened = []
  const controller = createInteractionController({
    dclick: false,
    drag: false,
    translate: true,
    translate_trigger_key: 'alt',
    deepl_auth_key: 'test-key'
  }, {
    target,
    openPopup: (...args) => opened.push(args)
  })

  target.dispatch('mousedown', mouseEvent({clientX: 5, clientY: 5}))
  target.dispatch('mousemove', mouseEvent({clientX: 25, clientY: 5}))
  const event = mouseEvent({clientX: 25, clientY: 5, altKey: true})
  target.dispatch('mouseup', event)

  assert.deepEqual(opened, [[event, 'test-key', 'translate']])
  controller.destroy()
})
