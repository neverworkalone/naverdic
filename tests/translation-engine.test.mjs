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
import {
  getProviderPreset,
  normalizeProviderDefinition
} from '../src/translation-provider.mjs'
import {
  getProviderOriginPattern,
  hasProviderOriginPermission,
  isProviderOriginAllowed,
  matchesProviderOriginPattern,
  requestProviderOriginPermission
} from '../src/provider-permissions.mjs'

function jsonResponse(data, overrides = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => data,
    ...overrides
  }
}

function secretStore(providerId, field, value) {
  return {providers: {[providerId]: {[field]: value}}}
}

function customProvider(overrides = {}) {
  return normalizeProviderDefinition({
    id: 'custom-api',
    name: 'Custom API',
    kind: 'custom',
    endpoint: {
      url: 'https://api.example.test/translate',
      method: 'POST'
    },
    auth: {
      mode: 'bearer',
      location: 'header',
      headerName: 'Authorization',
      prefix: 'Bearer ',
      secretRef: 'providers.custom-api.token'
    },
    request: {
      headers: [
        {name: 'Content-Type', valueTemplate: 'application/json'},
        {
          name: 'X-Provider',
          valueTemplate: 'naverdic'
        }
      ],
      bodyTemplate: {
        input: '{{text}}',
        language: '{{targetLanguage}}'
      }
    },
    response: {textPath: 'result.text'},
    ...overrides
  })
}

test('builds and normalizes a DeepL fixture through the shared adapter', () => {
  const provider = getProviderPreset('deepl-free')
  assert.equal(
    getProviderPreset('deepl-pro').endpoint.url,
    'https://api.deepl.com/v2/translate'
  )
  const request = createProviderRequest(provider, {
    text: ['hello', 'world'],
    targetLanguage: 'ko',
    secrets: secretStore('deepl-free', 'apiKey', 'deep-secret')
  })

  assert.equal(request.url, 'https://api-free.deepl.com/v2/translate')
  assert.equal(request.options.headers.Authorization, 'DeepL-Auth-Key deep-secret')
  assert.deepEqual(JSON.parse(request.options.body), {
    text: ['hello', 'world'],
    target_lang: 'ko'
  })
  assert.deepEqual(normalizeProviderResponse(provider, {
    translations: [{text: '안녕'}]
  }), {
    providerId: 'deepl-free',
    text: '안녕',
    raw: {translations: [{text: '안녕'}]}
  })
})

test('builds the Gemini generateContent fixture with header authentication', async () => {
  const provider = getProviderPreset('gemini')
  const calls = []
  const result = await executeProviderTranslation(provider, {
    text: 'hello',
    targetLanguage: 'ko',
    secrets: secretStore('gemini', 'apiKey', 'gemini-secret'),
    fetchFn: async (url, options) => {
      calls.push({url, options})
      return jsonResponse({
        candidates: [{content: {parts: [{text: '안녕하세요'}]}}]
      })
    }
  })

  assert.equal(calls.length, 1)
  assert.match(calls[0].url, /generativelanguage\.googleapis\.com\/v1beta\/models\/gemini-3\.5-flash:generateContent$/)
  assert.equal(calls[0].options.headers['x-goog-api-key'], 'gemini-secret')
  const geminiBody = JSON.parse(calls[0].options.body)
  assert.equal(geminiBody.contents[0].role, 'user')
  assert.match(geminiBody.contents[0].parts[0].text, /to ko/)
  assert.match(geminiBody.contents[0].parts[0].text, /hello/)
  assert.equal(result.text, '안녕하세요')
})

test('renders custom API templates only after origin permission is granted', async () => {
  const provider = customProvider()
  const secrets = secretStore('custom-api', 'token', 'custom-secret')
  let fetchCalls = 0

  await assert.rejects(
    executeProviderTranslation(provider, {
      text: 'hello',
      targetLanguage: 'ko',
      secrets,
      fetchFn: async () => {
        fetchCalls += 1
        return jsonResponse({result: {text: 'should not run'}})
      }
    }),
    error => error.code === PROVIDER_ERROR_CODES.PERMISSION_REQUIRED
  )
  assert.equal(fetchCalls, 0)

  const result = await executeProviderTranslation(provider, {
    text: 'hello',
    targetLanguage: 'ko',
    secrets,
    allowedOrigins: ['https://api.example.test/*'],
    fetchFn: async (_url, options) => {
      assert.equal(options.headers.Authorization, 'Bearer custom-secret')
      assert.deepEqual(JSON.parse(options.body), {
        input: 'hello',
        language: 'ko'
      })
      return jsonResponse({result: {text: '안녕'}})
    }
  })

  assert.equal(result.text, '안녕')
})

test('rejects unsafe endpoints and keeps credentials out of errors', async () => {
  assert.equal(normalizeProviderDefinition({
    id: 'unsafe',
    kind: 'custom',
    endpoint: {url: 'javascript:alert(1)', method: 'POST'}
  }), null)
  assert.equal(normalizeProviderDefinition({
    id: 'unsafe',
    kind: 'custom',
    endpoint: {url: 'https://user:pass@example.test/translate', method: 'POST'}
  }), null)
  assert.equal(normalizeProviderDefinition({
    id: 'unsupported-get',
    kind: 'custom',
    endpoint: {url: 'https://api.example.test/translate', method: 'GET'}
  }), null)

  const secret = 'custom-secret'
  const redacted = redactSecrets(
    `Authorization: Bearer ${secret}`,
    secretStore('custom-api', 'token', secret)
  )
  assert.equal(redacted, 'Authorization: Bearer [REDACTED]')

  await assert.rejects(
    executeProviderTranslation(customProvider(), {
      text: 'hello',
      targetLanguage: 'ko',
      secrets: secretStore('custom-api', 'token', secret),
      allowedOrigins: ['https://api.example.test/*'],
      fetchFn: async () => jsonResponse({}, {ok: false, status: 401})
    }),
    error => error.code === PROVIDER_ERROR_CODES.HTTP_ERROR &&
      !error.message.includes(secret)
  )
})

test('does not return query authentication credentials in the normalized result', async () => {
  const provider = customProvider({
    auth: {
      mode: 'api-key',
      location: 'query',
      headerName: 'key',
      prefix: '',
      secretRef: 'providers.custom-api.apiKey'
    }
  })
  const secret = 'query-secret'

  const result = await executeProviderTranslation(provider, {
    text: 'hello',
    targetLanguage: 'ko',
    secrets: secretStore('custom-api', 'apiKey', secret),
    allowedOrigins: ['https://api.example.test/*'],
    fetchFn: async (url) => {
      assert.match(url, /[?&]key=query-secret(?:&|$)/)
      return jsonResponse({result: {text: '안녕'}})
    }
  })

  assert.equal(result.text, '안녕')
  assert.equal('request' in result, false)
  assert.doesNotMatch(JSON.stringify(result), /query-secret/)
})

test('supports nested response paths and origin pattern boundaries', () => {
  assert.equal(getPathValue({a: [{b: 'value'}]}, 'a[0].b'), 'value')
  assert.equal(getProviderOriginPattern('https://api.example.test/v1/translate'), 'https://api.example.test/*')
  assert.equal(matchesProviderOriginPattern('https://api.example.test/v1', 'https://api.example.test/*'), true)
  assert.equal(matchesProviderOriginPattern('https://sub.example.test/v1', 'https://*.example.test/*'), true)
  assert.equal(matchesProviderOriginPattern('https://not-example.test/v1', 'https://*.example.test/*'), false)
  assert.equal(isProviderOriginAllowed('https://api.example.test/v1', ['https://api.example.test/*']), true)
})

test('uses Chrome permission APIs with the narrow provider origin pattern', async () => {
  const calls = []
  const permissions = {
    contains(details, callback) {
      calls.push(['contains', details])
      callback(true)
    },
    request(details, callback) {
      calls.push(['request', details])
      callback(true)
    }
  }

  assert.equal(
    await hasProviderOriginPermission(permissions, 'https://api.example.test/v1'),
    true
  )
  assert.equal(
    await requestProviderOriginPermission(permissions, 'https://api.example.test/v1'),
    true
  )
  assert.deepEqual(calls, [
    ['contains', {origins: ['https://api.example.test/*']}],
    ['request', {origins: ['https://api.example.test/*']}]
  ])
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

test('runs Chrome Translator directly in the content-page runtime without fetch or permission checks', async () => {
  const calls = []
  const result = await executeProviderTranslation(getProviderPreset('chrome-translator'), {
    text: ['hello', 'world'],
    targetLanguage: 'ko',
    fetchFn: async () => {
      throw new Error('background fetch must not run')
    },
    permissionChecker: async () => {
      throw new Error('background permission check must not run')
    },
    translatorRuntime: {
      translate: async value => {
        calls.push(value)
        return `ko:${value}`
      }
    }
  })

  assert.deepEqual(calls, ['hello', 'world'])
  assert.equal(result.providerId, 'chrome-translator')
  assert.equal(result.text, 'ko:hello\nko:world')
  assert.deepEqual(result.raw, {
    translations: [{text: 'ko:hello'}, {text: 'ko:world'}]
  })
})
