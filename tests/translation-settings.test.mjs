import assert from 'node:assert/strict'
import test from 'node:test'

import {
  createCustomProviderForm,
  providerIdFromName,
  validateCustomProviderForm
} from '../src/translation-settings.mjs'
import {testTranslationProvider} from '../src/translation-testing.mjs'
import {getProviderPreset} from '../src/translation-provider.mjs'

function jsonResponse(data) {
  return {
    ok: true,
    status: 200,
    json: async () => data
  }
}

test('creates a storage-safe custom provider form and normalizes a valid API', () => {
  assert.equal(providerIdFromName('  My Weather API / v2  '), 'my-weather-api-v2')

  const form = createCustomProviderForm()
  form.name = 'My Translation API'
  form.url = 'https://api.example.test/translate'
  form.authMode = 'bearer'
  form.authLocation = 'header'
  form.authHeaderName = 'Authorization'
  form.authPrefix = 'Bearer '
  form.apiKey = 'secret-token'
  form.headersText = 'Content-Type: application/json\nX-Client: naverdic'
  form.bodyTemplateText = '{"input":"{{text}}","target":"{{targetLanguage}}"}'
  form.responsePath = 'result.text'

  const result = validateCustomProviderForm(form)

  assert.equal(result.valid, true)
  assert.equal(result.provider.id, 'my-translation-api')
  assert.equal(result.provider.source, 'custom')
  assert.equal(result.provider.endpoint.method, 'POST')
  assert.equal(result.provider.auth.secretRef, 'providers.my-translation-api.token')
  assert.deepEqual(result.provider.request.headers, [
    {name: 'Content-Type', valueTemplate: 'application/json', secretRef: null},
    {name: 'X-Client', valueTemplate: 'naverdic', secretRef: null}
  ])
  assert.deepEqual(result.provider.request.bodyTemplate, {
    input: '{{text}}',
    target: '{{targetLanguage}}'
  })
  assert.equal(result.credentialField, 'token')
  assert.equal(result.credentialValue, 'secret-token')
})

test('rejects unsupported GET custom APIs before they can be saved', () => {
  const form = createCustomProviderForm()
  form.name = 'GET API'
  form.url = 'https://api.example.test/translate'
  form.method = 'GET'

  const result = validateCustomProviderForm(form)

  assert.equal(result.valid, false)
  assert.deepEqual(result.errors, [{code: 'invalid-method'}])
})

test('rejects custom provider ids reserved for built-in presets', () => {
  const form = createCustomProviderForm()
  form.name = 'Gemini'
  form.url = 'https://api.example.test/translate'

  const result = validateCustomProviderForm(form)

  assert.equal(result.valid, false)
  assert.deepEqual(result.errors, [{code: 'reserved-id'}])
})

test('reports unsafe URLs, malformed JSON, and duplicate custom provider ids', () => {
  const form = createCustomProviderForm()
  form.name = 'Existing API'
  form.url = 'https://user:password@example.test/translate'
  form.bodyTemplateText = '{broken'

  const result = validateCustomProviderForm(form, {
    existingIds: ['existing-api']
  })

  assert.equal(result.valid, false)
  assert.deepEqual(result.errors.map(error => error.code), [
    'duplicate-id',
    'invalid-url',
    'invalid-body'
  ])
})

test('tests a custom provider only after the optional origin permission is granted', async () => {
  const form = createCustomProviderForm()
  form.name = 'Fixture API'
  form.url = 'https://api.example.test/translate'
  form.headersText = 'Content-Type: application/json'
  const result = validateCustomProviderForm(form)
  assert.equal(result.valid, true)

  const permissionCalls = []
  const permissionApi = {
    request(details, callback) {
      permissionCalls.push(details)
      callback(true)
    }
  }
  const translation = await testTranslationProvider(result.provider, {
    secrets: {providers: {'fixture-api': {apiKey: 'fixture-secret'}}},
    permissionApi,
    fetchFn: async (url, options) => {
      assert.equal(url, 'https://api.example.test/translate')
      assert.equal(options.headers['X-API-Key'], 'fixture-secret')
      assert.deepEqual(JSON.parse(options.body), {
        text: 'NaverDic connection test',
        targetLanguage: 'ko'
      })
      return jsonResponse({text: '연결됨'})
    }
  })

  assert.equal(translation.text, '연결됨')
  assert.deepEqual(permissionCalls, [{origins: ['https://api.example.test/*']}])
})

test('does not attempt a background test for Chrome built-in Translator', async () => {
  await assert.rejects(
    testTranslationProvider(getProviderPreset('chrome-translator')),
    error => error.code === 'UNSUPPORTED_CONTEXT'
  )
})
