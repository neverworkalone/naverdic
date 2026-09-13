import {
  SETTINGS_STORAGE,
  normalizeSettingsV2
} from './settings-v2.mjs'

export const RECENT_SEARCH_STORAGE = Object.freeze({
  area: 'local',
  key: 'naverdic.recent-search.v1'
})

export const RECENT_SEARCH_LIMIT = 20

const ENGLISH_WORD_PATTERN = /^[A-Za-z]+(?:['-][A-Za-z]+)*$/

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function getLastError() {
  const lastError = globalThis.chrome?.runtime?.lastError
  return lastError?.message ? new Error(lastError.message) : null
}

function readStorageArea(area, key) {
  if (!area?.get) {
    return Promise.resolve({})
  }

  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (callback, value) => {
      if (settled) {
        return
      }
      settled = true
      callback(value)
    }
    const callback = values => {
      const lastError = getLastError()
      if (lastError) {
        finish(reject, lastError)
        return
      }
      finish(resolve, isRecord(values) ? values : {})
    }

    try {
      const result = area.get(key, callback)
      if (result && typeof result.then === 'function') {
        result.then(callback).catch(error => finish(reject, error))
      }
    } catch (error) {
      finish(reject, error)
    }
  })
}

function writeStorageArea(area, values) {
  if (!area?.set) {
    return Promise.resolve()
  }

  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (callback, value) => {
      if (settled) {
        return
      }
      settled = true
      callback(value)
    }
    const callback = () => {
      const lastError = getLastError()
      if (lastError) {
        finish(reject, lastError)
        return
      }
      finish(resolve)
    }

    try {
      const result = area.set(values, callback)
      if (result && typeof result.then === 'function') {
        result.then(() => callback()).catch(error => finish(reject, error))
      }
    } catch (error) {
      finish(reject, error)
    }
  })
}

function removeStorageArea(area, key) {
  if (!area?.remove) {
    return area?.set
      ? writeStorageArea(area, {[key]: []})
      : Promise.resolve()
  }

  return new Promise((resolve, reject) => {
    let settled = false
    const finish = (callback, value) => {
      if (settled) {
        return
      }
      settled = true
      callback(value)
    }
    const callback = () => {
      const lastError = getLastError()
      if (lastError) {
        finish(reject, lastError)
        return
      }
      finish(resolve)
    }

    try {
      const result = area.remove(key, callback)
      if (result && typeof result.then === 'function') {
        result.then(() => callback()).catch(error => finish(reject, error))
      }
    } catch (error) {
      finish(reject, error)
    }
  })
}

/**
 * Return a normalized English word, or an empty string for phrases and terms
 * that should never be written to the recent-search store.
 */
export function normalizeRecentSearchTerm(value) {
  if (typeof value !== 'string') {
    return ''
  }

  const normalized = value.trim().toLowerCase()
  return ENGLISH_WORD_PATTERN.test(normalized) ? normalized : ''
}

export function normalizeRecentSearches(value) {
  if (!Array.isArray(value)) {
    return []
  }

  const seen = new Set()
  const normalized = []
  for (const entry of value) {
    const term = normalizeRecentSearchTerm(entry)
    if (!term || seen.has(term)) {
      continue
    }
    seen.add(term)
    normalized.push(term)
    if (normalized.length === RECENT_SEARCH_LIMIT) {
      break
    }
  }
  return normalized
}

export function addRecentSearch(entries, value) {
  const normalizedEntries = normalizeRecentSearches(entries)
  const term = normalizeRecentSearchTerm(value)
  if (!term) {
    return normalizedEntries
  }

  return [term, ...normalizedEntries.filter(entry => entry !== term)]
    .slice(0, RECENT_SEARCH_LIMIT)
}

export async function readRecentSearches(area) {
  const values = await readStorageArea(area, RECENT_SEARCH_STORAGE.key)
  return normalizeRecentSearches(values[RECENT_SEARCH_STORAGE.key])
}

export function writeRecentSearches(area, entries) {
  return writeStorageArea(area, {
    [RECENT_SEARCH_STORAGE.key]: normalizeRecentSearches(entries)
  })
}

export function clearRecentSearches(area) {
  return removeStorageArea(area, RECENT_SEARCH_STORAGE.key)
}

export async function readRecentSearchEnabled(storage) {
  const values = await readStorageArea(storage?.sync, SETTINGS_STORAGE.settings.key)
  return normalizeSettingsV2(values[SETTINGS_STORAGE.settings.key]).recentSearch.enabled
}

export async function loadRecentSearchState(storage) {
  let enabled = false
  try {
    enabled = await readRecentSearchEnabled(storage)
  } catch (_error) {
    return {enabled: false, searches: []}
  }

  if (!enabled) {
    return {enabled: false, searches: []}
  }

  try {
    return {enabled: true, searches: await readRecentSearches(storage?.local)}
  } catch (_error) {
    return {enabled: true, searches: []}
  }
}
