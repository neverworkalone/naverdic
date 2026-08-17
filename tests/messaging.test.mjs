import assert from 'node:assert/strict'
import test from 'node:test'

import {
  DEFAULT_MESSAGE_TIMEOUT_MS,
  MESSAGE_ACTIONS,
  MESSAGE_CONTRACTS,
  MESSAGE_ERROR_CODES,
  createDictionaryRequest,
  createErrorResponse,
  createSuccessResponse,
  createTranslationRequest,
  isMessageResponse,
  reportMessageFailure,
  respondOnce,
  sendRuntimeMessage
} from '../src/messaging.mjs'
import {
  handleBackgroundMessage,
  registerBackgroundListener,
  validateMessageRequest
} from '../src/background-handler.mjs'

function jsonResponse(data, overrides = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => data,
    ...overrides
  }
}

function dictionaryRequest(overrides = {}) {
  return createDictionaryRequest({
    method: 'GET',
    url: 'https://en.dict.naver.com/api3/enko/search?query=hello',
    ...overrides
  })
}

function translationRequest(overrides = {}) {
  return createTranslationRequest({
    method: 'POST',
    url: 'https://api-free.deepl.com/v2/translate',
    key: 'test-key',
    data: {text: ['hello'], target_lang: 'ko'},
    ...overrides
  })
}

test('documents the existing actions and creates their request envelopes', () => {
  assert.deepEqual(MESSAGE_ACTIONS, {
    DICTIONARY: 'endic',
    TRANSLATION: 'translation'
  })
  assert.ok(MESSAGE_CONTRACTS.endic.request.includes("action: 'endic'"))
  assert.ok(MESSAGE_CONTRACTS.translation.response.includes('DeepLTranslationResponse'))

  assert.deepEqual(dictionaryRequest(), {
    action: 'endic',
    method: 'GET',
    url: 'https://en.dict.naver.com/api3/enko/search?query=hello'
  })
  assert.deepEqual(translationRequest(), {
    action: 'translation',
    method: 'POST',
    url: 'https://api-free.deepl.com/v2/translate',
    key: 'test-key',
    data: {text: ['hello'], target_lang: 'ko'}
  })
  assert.deepEqual(createSuccessResponse({value: 1}), {ok: true, data: {value: 1}})
  assert.deepEqual(createErrorResponse('TEST', 'failed', {status: 500}), {
    ok: false,
    error: {code: 'TEST', message: 'failed', status: 500}
  })
})

test('rejects unknown and incomplete requests before calling fetch', async () => {
  let fetchCalls = 0
  const dependencies = {
    fetchFn: async () => {
      fetchCalls += 1
      return jsonResponse({})
    }
  }

  const cases = [
    [null, MESSAGE_ERROR_CODES.INVALID_REQUEST],
    [{action: 'unknown', url: 'https://example.com', method: 'GET'}, MESSAGE_ERROR_CODES.UNKNOWN_ACTION],
    [{action: 'endic', method: 'GET'}, MESSAGE_ERROR_CODES.MISSING_PAYLOAD],
    [{action: 'endic', method: 'POST', url: 'https://example.com'}, MESSAGE_ERROR_CODES.INVALID_REQUEST],
    [{action: 'endic', method: 'GET', url: 'not-a-url'}, MESSAGE_ERROR_CODES.INVALID_REQUEST],
    [translationRequest({key: ''}), MESSAGE_ERROR_CODES.MISSING_PAYLOAD],
    [translationRequest({data: undefined}), MESSAGE_ERROR_CODES.MISSING_PAYLOAD],
    [translationRequest({data: {text: ['hello']}}), MESSAGE_ERROR_CODES.MISSING_PAYLOAD]
  ]

  for (const [request, code] of cases) {
    const response = await handleBackgroundMessage(request, dependencies)
    assert.equal(response.ok, false)
    assert.equal(response.error.code, code)
  }

  assert.equal(fetchCalls, 0)
  assert.equal(validateMessageRequest(dictionaryRequest()), null)
})

test('returns a shared success response for dictionary and translation requests', async () => {
  const dictionaryData = {searchResultMap: {searchResultListMap: {WORD: {items: []}}}}
  const translationData = {translations: [{text: '안녕'}]}
  const calls = []

  const dictionaryResponse = await handleBackgroundMessage(dictionaryRequest(), {
    fetchFn: async (url, options) => {
      calls.push({url, options})
      return jsonResponse(dictionaryData)
    }
  })
  const translationResponse = await handleBackgroundMessage(translationRequest(), {
    fetchFn: async (url, options) => {
      calls.push({url, options})
      return jsonResponse(translationData)
    }
  })

  assert.deepEqual(dictionaryResponse, {ok: true, data: dictionaryData})
  assert.deepEqual(translationResponse, {ok: true, data: translationData})
  assert.deepEqual(calls[0].options, {method: 'GET', signal: calls[0].options.signal})
  assert.equal(calls[1].options.method, 'POST')
  assert.equal(calls[1].options.headers.Authorization, 'DeepL-Auth-Key test-key')
  assert.deepEqual(JSON.parse(calls[1].options.body), {
    text: ['hello'],
    target_lang: 'ko'
  })
})

test('turns HTTP, network, timeout, and malformed responses into explicit errors', async () => {
  const httpError = await handleBackgroundMessage(dictionaryRequest(), {
    fetchFn: async () => jsonResponse({message: 'unauthorized'}, {ok: false, status: 401})
  })
  assert.equal(httpError.ok, false)
  assert.equal(httpError.error.code, MESSAGE_ERROR_CODES.HTTP_ERROR)
  assert.equal(httpError.error.status, 401)

  const invalidJson = await handleBackgroundMessage(dictionaryRequest(), {
    fetchFn: async () => ({ok: true, status: 200, json: async () => { throw new Error('bad json') }})
  })
  assert.equal(invalidJson.error.code, MESSAGE_ERROR_CODES.INVALID_RESPONSE)

  const invalidTranslation = await handleBackgroundMessage(translationRequest(), {
    fetchFn: async () => jsonResponse({translations: []})
  })
  assert.equal(invalidTranslation.error.code, MESSAGE_ERROR_CODES.INVALID_RESPONSE)

  const networkError = await handleBackgroundMessage(dictionaryRequest(), {
    fetchFn: async () => { throw new Error('offline') }
  })
  assert.equal(networkError.error.code, MESSAGE_ERROR_CODES.NETWORK_ERROR)

  const timeout = await handleBackgroundMessage(dictionaryRequest(), {
    fetchFn: () => new Promise(() => {}),
    timeoutMs: 5
  })
  assert.equal(timeout.error.code, MESSAGE_ERROR_CODES.TIMEOUT)
})

test('runtime sender handles lastError, invalid responses, timeout, and duplicate delivery', async () => {
  const request = dictionaryRequest()
  const success = createSuccessResponse({searchResultMap: {}})

  const duplicate = await sendRuntimeMessage({
    sendMessage(_request, callback) {
      callback(success)
      callback(createErrorResponse(MESSAGE_ERROR_CODES.NETWORK_ERROR, 'late'))
    }
  }, request, {timeoutMs: 20})
  assert.deepEqual(duplicate, success)

  const lastError = await sendRuntimeMessage({
    lastError: {message: 'The message port closed.'},
    sendMessage(_request, callback) {
      callback(undefined)
    }
  }, request, {timeoutMs: 20})
  assert.equal(lastError.error.code, MESSAGE_ERROR_CODES.RUNTIME_ERROR)
  assert.equal(lastError.error.message, 'The message port closed.')

  const invalid = await sendRuntimeMessage({
    sendMessage(_request, callback) {
      callback({searchResultMap: {}})
    }
  }, request, {timeoutMs: 20})
  assert.equal(invalid.error.code, MESSAGE_ERROR_CODES.INVALID_RESPONSE)

  const timeout = await sendRuntimeMessage({
    sendMessage() {}
  }, request, {timeoutMs: 5})
  assert.equal(timeout.error.code, MESSAGE_ERROR_CODES.TIMEOUT)

  const promiseResponse = await sendRuntimeMessage({
    sendMessage() {
      return Promise.resolve(success)
    }
  }, request, {timeoutMs: 20})
  assert.deepEqual(promiseResponse, success)
})

test('respondOnce and failure reporting prevent duplicate or silent handling', () => {
  const sent = []
  const respond = respondOnce(response => sent.push(response))
  assert.equal(respond(createSuccessResponse('first')), true)
  assert.equal(respond(createSuccessResponse('second')), false)
  assert.deepEqual(sent, [createSuccessResponse('first')])

  const errors = []
  const failed = createErrorResponse(MESSAGE_ERROR_CODES.TIMEOUT, 'timed out')
  assert.equal(reportMessageFailure('lookup', failed, {error: message => errors.push(message)}), true)
  assert.equal(errors.length, 1)
  assert.match(errors[0], /TIMEOUT/)
  assert.equal(reportMessageFailure('lookup', createSuccessResponse('ok'), {
    error: () => { throw new Error('success should not be logged') }
  }), false)
  assert.equal(isMessageResponse(failed), true)
  assert.equal(DEFAULT_MESSAGE_TIMEOUT_MS > 0, true)
})

test('background listener keeps the channel open and sends one response', async () => {
  let listener
  const runtime = {
    onMessage: {
      addListener(value) {
        listener = value
      }
    }
  }
  const response = createSuccessResponse({value: 1})
  registerBackgroundListener(runtime, async () => response)

  const sent = []
  assert.equal(listener(dictionaryRequest(), {}, value => sent.push(value)), true)
  await new Promise(resolve => setImmediate(resolve))
  assert.deepEqual(sent, [response])

  const failedRuntime = {
    onMessage: {
      addListener(value) {
        listener = value
      }
    }
  }
  registerBackgroundListener(failedRuntime, async () => {
    throw new Error('unexpected')
  })

  const failures = []
  assert.equal(listener(dictionaryRequest(), {}, value => failures.push(value)), true)
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(failures.length, 1)
  assert.equal(failures[0].error.code, MESSAGE_ERROR_CODES.INTERNAL_ERROR)
})
