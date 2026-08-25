import assert from 'node:assert/strict'
import test from 'node:test'

import {
  formatDenyList,
  parseDenyListInput
} from '../src/settings-sites.mjs'

test('normalizes site input across supported separators and URL forms', () => {
  const result = parseDenyListInput(
    ' https://www.Example.com/path, *.example.com; naver.com\nNAVER.com '
  )

  assert.deepEqual(result.domains, ['www.example.com', 'example.com', 'naver.com'])
  assert.deepEqual(result.invalidEntries, [])
  assert.equal(formatDenyList(result.domains), 'www.example.com\nexample.com\nnaver.com')
})

test('reports invalid entries without dropping valid domains', () => {
  const result = parseDenyListInput('example.com, not a domain; http://valid.test')

  assert.deepEqual(result.domains, ['example.com', 'valid.test'])
  assert.deepEqual(result.invalidEntries, ['not a domain'])
})

test('deduplicates repeated invalid entries and accepts localhost', () => {
  const result = parseDenyListInput('localhost, bad value, bad value, 127.0.0.1')

  assert.deepEqual(result.domains, ['localhost', '127.0.0.1'])
  assert.deepEqual(result.invalidEntries, ['bad value'])
})

test('returns an empty normalized list for empty input', () => {
  assert.deepEqual(parseDenyListInput(' , ;\n '), {
    domains: [],
    invalidEntries: []
  })
})
