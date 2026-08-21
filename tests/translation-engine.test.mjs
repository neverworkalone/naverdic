import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createProviderRequest,
  executeProviderTranslation,
  getPathValue,
  normalizeProviderResponse,
  PROVIDER_ERROR_CODES,
  redactSecrets
} from '../src/translation-engine.mjs'
import {getProviderPreset, normalizeProviderDefinition} from '../src/translation-provider.mjs'

function jsonResponse(data, overrides = {}) {
  return {ok: true, status: 200, json: async () => data, ...overrides}
}

function secretStore(providerId, field, value) {
  return {providers: {[providerId]: {[field]: value}}}
}

test('builds and normalizes a DeepL fixture through the shared adapter', () => {
  const provider = getProviderPreset('deepl-free')
  assert.equal(getProviderPreset('deepl-pro').endpoint.url, 'https://api.deepl.com/v2/translate')
  const request = createProviderRequest(provider, {
    text: ['hello', 'world'],
    targetLanguage: 'ko',
    secrets: secretStore('deepl-free', 'apiKey', 'deep-secret')
  })
  assert.equal(request.url, 'https://api-free.deepl.com/v2/translate')
  assert.equal(request.options.headers.Authorization, 'DeepL-Auth-Key deep-secret')
  assert.deepEqual(JSON.parse(request.options.body), {text: ['hello', 'world'], target_lang: 'ko'})
  assert.deepEqual(normalizeProviderResponse(provider, {translations: [{text: '안녕'}]}), {
    providerId: 'deepl-free',
    text: '안녕',
    raw: {translations: [{text: '안녕'}]}
  })
})

test('builds the fixed Gemini 3.5 Flash endpoint with header authentication', async () => {
  const provider = getProviderPreset('gemini')
  const calls = []
  const result = await executeProviderTranslation(provider, {
    text: 'hello',
    targetLanguage: 'ko',
    secrets: secretStore('gemini', 'apiKey', 'gemini-secret'),
    fetchFn: async (url, options) => {
      calls.push({url, options})
      return jsonResponse({candidates: [{content: {parts: [{text: '안녕하세요'}]}}]})
    }
  })
  assert.equal(calls.length, 1)
  assert.match(calls[0].url, /models\/gemini-3\.5-flash:generateContent$/)
  assert.equal(calls[0].options.headers['x-goog-api-key'], 'gemini-secret')
  assert.match(JSON.parse(calls[0].options.body).contents[0].parts[0].text, /hello/)
  assert.equal(result.text, '안녕하세요')
})

test('rejects legacy custom definitions before execution', async () => {
  assert.equal(normalizeProviderDefinition({
    id: 'custom-api',
    kind: 'custom',
    source: 'custom',
    endpoint: {url: 'https://api.example.test/translate', method: 'POST'}
  }), null)
  await assert.rejects(
    executeProviderTranslation({id: 'custom-api', kind: 'custom'}, {
      text: 'hello',
      targetLanguage: 'ko',
      fetchFn: async () => jsonResponse({result: 'should not run'})
    }),
    error => error.code === PROVIDER_ERROR_CODES.INVALID_PROVIDER
  )
})

test('keeps credentials out of normalized errors', async () => {
  const secret = 'deep-secret'
  assert.equal(redactSecrets('Authorization: ' + secret, secretStore('deepl-free', 'apiKey', secret)), 'Authorization: [REDACTED]')
  await assert.rejects(
    executeProviderTranslation(getProviderPreset('deepl-free'), {
      text: 'hello',
      targetLanguage: 'ko',
      secrets: secretStore('deepl-free', 'apiKey', secret),
      fetchFn: async () => jsonResponse({}, {ok: false, status: 401})
    }),
    error => error.code === PROVIDER_ERROR_CODES.HTTP_ERROR && !error.message.includes(secret)
  )
})

test('supports nested response paths', () => {
  assert.equal(getPathValue({a: [{b: 'value'}]}, 'a[0].b'), 'value')
})

test('keeps Chrome built-in Translator outside the background HTTP adapter', async () => {
  await assert.rejects(
    executeProviderTranslation(getProviderPreset('chrome-translator'), {
      text: 'hello',
      targetLanguage: 'ko',
      fetchFn: async () => jsonResponse({result: 'should not run'})
    }),
    error => error.code === PROVIDER_ERROR_CODES.UNSUPPORTED_CONTEXT
  )
})

test('runs Chrome Translator directly in the content-page runtime', async () => {
  const calls = []
  const result = await executeProviderTranslation(getProviderPreset('chrome-translator'), {
    text: ['hello', 'world'],
    targetLanguage: 'ko',
    fetchFn: async () => {
      throw new Error('background fetch must not run')
    },
    translatorRuntime: {
      translate: async value => {
        calls.push(value)
        return 'ko:' + value
      }
    }
  })
  assert.deepEqual(calls, ['hello', 'world'])
  assert.equal(result.providerId, 'chrome-translator')
  assert.equal(result.text, 'ko:hello\nko:world')
  assert.deepEqual(result.raw, {translations: [{text: 'ko:hello'}, {text: 'ko:world'}]})
})
