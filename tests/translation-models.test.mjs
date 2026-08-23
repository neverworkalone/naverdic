import assert from 'node:assert/strict'
import test from 'node:test'

import {fetchGeminiModels} from '../src/translation-models.mjs'

test('filters Gemini model list to generateContent Flash models', async () => {
  const models = await fetchGeminiModels('private-key', {
    fetchFn: async (url, options) => {
      assert.equal(url, 'https://generativelanguage.googleapis.com/v1beta/models')
      assert.equal(options.headers['x-goog-api-key'], 'private-key')
      return {
        ok: true,
        json: async () => ({models: [
          {name: 'models/gemini-2.5-flash', supportedGenerationMethods: ['generateContent']},
          {name: 'models/gemini-2.5-flash-lite', supportedGenerationMethods: ['generateContent']},
          {name: 'models/gemini-embedding', supportedGenerationMethods: ['embedContent']}
        ]})
      }
    }
  })

  assert.deepEqual(models, ['gemini-2.5-flash', 'gemini-2.5-flash-lite'])
})

test('does not include the Gemini API key in model list errors', async () => {
  await assert.rejects(
    fetchGeminiModels('private-key', {
      fetchFn: async () => ({ok: false, json: async () => ({})})
    }),
    error => error.code === 'HTTP_ERROR' && !error.message.includes('private-key')
  )
})
