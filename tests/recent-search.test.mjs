import assert from 'node:assert/strict'
import test from 'node:test'

import {
  RECENT_SEARCH_STORAGE,
  addRecentSearch,
  clearRecentSearches,
  loadRecentSearchState,
  normalizeRecentSearchTerm,
  normalizeRecentSearches,
  readRecentSearches,
  writeRecentSearches
} from '../src/recent-search.mjs'
import {SETTINGS_STORAGE} from '../src/settings-v2.mjs'

class FakeStorageArea {
  constructor(items = {}) {
    this.items = {...items}
  }

  get(keys, callback) {
    const requestedKeys = Array.isArray(keys) ? keys : [keys]
    callback(Object.fromEntries(requestedKeys
      .filter(key => Object.prototype.hasOwnProperty.call(this.items, key))
      .map(key => [key, this.items[key]])))
  }

  set(values, callback) {
    Object.assign(this.items, values)
    callback?.()
  }

  remove(keys, callback) {
    for (const key of (Array.isArray(keys) ? keys : [keys])) {
      delete this.items[key]
    }
    callback?.()
  }
}

test('accepts English words, normalizes case, and rejects phrases or non-English terms', () => {
  assert.equal(normalizeRecentSearchTerm('  Elaborate  '), 'elaborate')
  assert.equal(normalizeRecentSearchTerm("can't"), "can't")
  assert.equal(normalizeRecentSearchTerm('mother-in-law'), 'mother-in-law')
  assert.equal(normalizeRecentSearchTerm('two words'), '')
  assert.equal(normalizeRecentSearchTerm('복수'), '')
  assert.equal(normalizeRecentSearchTerm('translation: 뜻'), '')
  assert.equal(normalizeRecentSearchTerm(''), '')
})

test('deduplicates recent words by moving the newest search to the front and caps at 20', () => {
  const existing = Array.from({length: 20}, (_, index) => `word${String.fromCharCode(97 + index)}`)
  const withNewWord = addRecentSearch(existing, 'fresh')

  assert.equal(withNewWord.length, 20)
  assert.equal(withNewWord[0], 'fresh')
  assert.equal(withNewWord.includes('wordt'), false)
  assert.equal(withNewWord[19], 'words')
  assert.deepEqual(addRecentSearch(['alpha', 'beta'], 'BETA'), ['beta', 'alpha'])
  assert.deepEqual(addRecentSearch(['alpha'], 'two words'), ['alpha'])
})

test('normalizes stored history and supports read, write, and clear operations', async () => {
  const area = new FakeStorageArea({
    [RECENT_SEARCH_STORAGE.key]: ['Alpha', 'alpha', 'two words', 'Beta']
  })

  assert.deepEqual(
    normalizeRecentSearches(['Alpha', 'alpha', 'two words', '복수', 'Beta']),
    ['alpha', 'beta']
  )
  assert.deepEqual(await readRecentSearches(area), ['alpha', 'beta'])

  await writeRecentSearches(area, ['Gamma', 'gamma', 'two words'])
  assert.deepEqual(area.items[RECENT_SEARCH_STORAGE.key], ['gamma'])

  await clearRecentSearches(area)
  assert.equal(RECENT_SEARCH_STORAGE.key in area.items, false)
})

test('loads the opt-in setting from sync storage and history from local storage', async () => {
  const sync = new FakeStorageArea({
    [SETTINGS_STORAGE.settings.key]: {
      schemaVersion: 2,
      recentSearch: {enabled: true}
    }
  })
  const local = new FakeStorageArea({
    [RECENT_SEARCH_STORAGE.key]: ['Newest', 'older']
  })

  assert.deepEqual(await loadRecentSearchState({sync, local}), {
    enabled: true,
    searches: ['newest', 'older']
  })
  assert.deepEqual(await loadRecentSearchState({
    sync: new FakeStorageArea({
      [SETTINGS_STORAGE.settings.key]: {
        schemaVersion: 2,
        recentSearch: {enabled: false}
      }
    }),
    local
  }), {
    enabled: false,
    searches: []
  })
})
