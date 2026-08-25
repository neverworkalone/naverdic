import assert from 'node:assert/strict'
import test from 'node:test'

import {getProviderCredential} from '../src/translation-settings.mjs'
import {testTranslationProvider} from '../src/translation-testing.mjs'
import {getProviderPreset} from '../src/translation-provider.mjs'

function jsonResponse(data) {
  return {ok: true, status: 200, json: async () => data}
}

test('reads only the credential referenced by a built-in provider', () => {
  const provider = getProviderPreset('deepl-free')
  assert.equal(
    getProviderCredential(provider, {providers: {'deepl-free': {apiKey: '  secret  '}}}),
    'secret'
  )
  assert.equal(
    getProviderCredential(getProviderPreset('chrome-translator'), {providers: {}}),
    ''
  )
})

test('tests a built-in HTTP provider without requesting arbitrary host permission', async () => {
  const provider = getProviderPreset('deepl-free')
  const translation = await testTranslationProvider(provider, {
    secrets: {providers: {'deepl-free': {apiKey: 'fixture-secret'}}},
    fetchFn: async (url, options) => {
      assert.equal(url, 'https://api-free.deepl.com/v2/translate')
      assert.equal(options.headers.Authorization, 'DeepL-Auth-Key fixture-secret')
      return jsonResponse({translations: [{text: '연결됨'}]})
    }
  })

  assert.equal(translation.text, '연결됨')
})

test('does not attempt a background test for Chrome built-in Translator', async () => {
  await assert.rejects(
    testTranslationProvider(getProviderPreset('chrome-translator')),
    error => error.code === 'UNSUPPORTED_CONTEXT'
  )
})
