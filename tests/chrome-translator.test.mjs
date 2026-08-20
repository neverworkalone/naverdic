import assert from 'node:assert/strict'
import test from 'node:test'

import {
  CHROME_TRANSLATOR_ERROR_CODES,
  CHROME_TRANSLATOR_PHASES,
  createChromeTranslatorRuntime
} from '../src/chrome-translator.mjs'

class FakeMonitor {
  constructor() {
    this.listeners = new Map()
  }

  addEventListener(type, listener) {
    if (!this.listeners.has(type)) {
      this.listeners.set(type, new Set())
    }
    this.listeners.get(type).add(listener)
  }

  emit(type, event) {
    this.listeners.get(type)?.forEach(listener => listener(event))
  }
}

function fakeTranslator(overrides = {}) {
  return {
    translate: async value => `ko:${value}`,
    destroy: async () => {},
    ...overrides
  }
}

function translatorApi({availability = 'available', create} = {}) {
  const calls = []
  const api = {
    availability: async options => {
      calls.push({type: 'availability', options})
      return typeof availability === 'function' ? availability() : availability
    },
    create: options => {
      calls.push({type: 'create', options})
      return create ? create(options) : Promise.resolve(fakeTranslator())
    }
  }
  return {api, calls}
}

test('uses Translator feature detection and the fixed en to ko availability contract', async () => {
  const unsupported = createChromeTranslatorRuntime({scope: {}})
  assert.equal(unsupported.getState().supported, false)
  assert.equal(unsupported.getState().phase, CHROME_TRANSLATOR_PHASES.UNSUPPORTED)
  await assert.rejects(
    unsupported.refreshAvailability(),
    error => error.code === CHROME_TRANSLATOR_ERROR_CODES.UNSUPPORTED
  )

  for (const availability of ['unavailable', 'downloadable', 'downloading', 'available']) {
    const {api, calls} = translatorApi({availability})
    const runtime = createChromeTranslatorRuntime({scope: {Translator: api}})
    const state = await runtime.refreshAvailability()
    assert.equal(state.availability, availability)
    assert.equal(state.status, availability)
    assert.deepEqual(calls[0], {
      type: 'availability',
      options: {sourceLanguage: 'en', targetLanguage: 'ko'}
    })
  }
})

test('starts download from the click path, reports progress, and prevents duplicate create calls', async () => {
  const monitor = new FakeMonitor()
  let resolveCreate
  const {api, calls} = translatorApi({
    availability: 'downloadable',
    create: options => {
      options.monitor(monitor)
      return new Promise(resolve => {
        resolveCreate = resolve
      })
    }
  })
  const runtime = createChromeTranslatorRuntime({scope: {Translator: api}})
  await runtime.refreshAvailability()

  const downloadPromise = runtime.download()
  assert.equal(calls.filter(call => call.type === 'create').length, 1)
  assert.equal(runtime.getState().phase, CHROME_TRANSLATOR_PHASES.DOWNLOADING)
  monitor.emit('downloadprogress', {loaded: 0.68})
  assert.equal(runtime.getState().progress, 0.68)
  assert.equal(runtime.getState().indeterminate, false)

  const duplicatePromise = runtime.download()
  assert.strictEqual(duplicatePromise, downloadPromise)
  resolveCreate(fakeTranslator())
  await downloadPromise
  assert.equal(runtime.getState().phase, CHROME_TRANSLATOR_PHASES.AVAILABLE)
  assert.equal(runtime.getState().availability, 'available')
  assert.equal(runtime.getState().progress, 1)
  assert.equal(calls.filter(call => call.type === 'create').length, 1)
})

test('keeps progress indeterminate when Chrome provides no download event', async () => {
  let resolveCreate
  const {api} = translatorApi({
    availability: 'downloadable',
    create: () => new Promise(resolve => { resolveCreate = resolve })
  })
  const runtime = createChromeTranslatorRuntime({scope: {Translator: api}})
  await runtime.refreshAvailability()
  const pending = runtime.download()
  assert.equal(runtime.getState().indeterminate, true)
  assert.equal(runtime.getState().progress, null)
  resolveCreate(fakeTranslator())
  await pending
})

test('publishes typed download errors and permits a user-initiated retry', async () => {
  let createCount = 0
  const {api} = translatorApi({
    availability: 'downloadable',
    create: () => {
      createCount += 1
      if (createCount === 1) {
        return Promise.reject(Object.assign(new Error('offline'), {name: 'NetworkError'}))
      }
      return Promise.resolve(fakeTranslator())
    }
  })
  const runtime = createChromeTranslatorRuntime({scope: {Translator: api}})
  await runtime.refreshAvailability()
  await assert.rejects(
    runtime.download(),
    error => error.code === CHROME_TRANSLATOR_ERROR_CODES.NETWORK
  )
  assert.equal(runtime.getState().phase, CHROME_TRANSLATOR_PHASES.FAILED)
  assert.equal(runtime.getState().availability, 'downloadable')
  await runtime.download()
  assert.equal(createCount, 2)
  assert.equal(runtime.getState().phase, CHROME_TRANSLATOR_PHASES.AVAILABLE)
})

test('maps the documented Translator error names to stable UI error codes', async () => {
  for (const [name, code] of [
    ['NetworkError', CHROME_TRANSLATOR_ERROR_CODES.NETWORK],
    ['NotAllowedError', CHROME_TRANSLATOR_ERROR_CODES.NOT_ALLOWED],
    ['NotSupportedError', CHROME_TRANSLATOR_ERROR_CODES.NOT_SUPPORTED],
    ['OperationError', CHROME_TRANSLATOR_ERROR_CODES.OPERATION],
    ['UnexpectedError', CHROME_TRANSLATOR_ERROR_CODES.DOWNLOAD_FAILED]
  ]) {
    const {api} = translatorApi({
      availability: 'downloadable',
      create: () => Promise.reject(Object.assign(new Error(name), {name}))
    })
    const runtime = createChromeTranslatorRuntime({scope: {Translator: api}})
    await runtime.refreshAvailability()
    await assert.rejects(runtime.download(), error => error.code === code)
  }
})

test('translates in the document runtime, reuses the created translator, and destroys it', async () => {
  let createCount = 0
  let translateCount = 0
  let destroyCount = 0
  const translator = fakeTranslator({
    translate: async value => {
      translateCount += 1
      return `translated:${value}`
    },
    destroy: async () => { destroyCount += 1 }
  })
  const {api} = translatorApi({
    availability: 'available',
    create: () => {
      createCount += 1
      return Promise.resolve(translator)
    }
  })
  const runtime = createChromeTranslatorRuntime({scope: {Translator: api}})

  assert.equal(await runtime.translate('one'), 'translated:one')
  assert.equal(await runtime.translate('two'), 'translated:two')
  assert.equal(createCount, 1)
  assert.equal(translateCount, 2)
  await runtime.destroy()
  assert.equal(destroyCount, 1)
})

test('does not create a model during translation when availability is downloadable', async () => {
  let createCount = 0
  const {api} = translatorApi({
    availability: 'downloadable',
    create: () => {
      createCount += 1
      return Promise.resolve(fakeTranslator())
    }
  })
  const runtime = createChromeTranslatorRuntime({scope: {Translator: api}})
  await assert.rejects(
    runtime.translate('hello'),
    error => error.code === CHROME_TRANSLATOR_ERROR_CODES.MODEL_NOT_READY
  )
  assert.equal(createCount, 0)
})
