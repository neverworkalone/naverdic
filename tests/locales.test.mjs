import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {fileURLToPath} from 'node:url'

import {findDuplicateTopLevelJsonKeys} from '../src/locale-validation.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const localeFiles = ['en', 'ko'].map(locale => path.join(
  projectRoot,
  'src',
  '_locales',
  locale,
  'messages.json'
))

test('detects duplicate keys before JSON parsing collapses locale entries', () => {
  assert.deepEqual(
    findDuplicateTopLevelJsonKeys('{"one": 1, "nested": {"one": 2}, "one": 3}'),
    ['one']
  )
})

test('locale files are valid, duplicate-free, and have matching message keys', () => {
  const locales = localeFiles.map(filePath => {
    const source = fs.readFileSync(filePath, 'utf8')
    assert.deepEqual(findDuplicateTopLevelJsonKeys(source), [], filePath)
    return JSON.parse(source)
  })

  assert.deepEqual(Object.keys(locales[0]).sort(), Object.keys(locales[1]).sort())
})
