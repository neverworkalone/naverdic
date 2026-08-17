import {
  normalizeDictionaryEntries,
  normalizeString
} from './normalizer.mjs'

const NAVER_API_URL = 'https://en.dict.naver.com/api3/enko/search?m=mobile&lang=ko&query='
const NAVER_DICTIONARY_URL = 'https://en.dict.naver.com/#/search?query='

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function getWordItems(data) {
  if (!isRecord(data)) {
    return []
  }

  const searchResultMap = data.searchResultMap
  const listMap = isRecord(searchResultMap)
    ? searchResultMap.searchResultListMap
    : null
  const wordResults = isRecord(listMap) ? listMap.WORD : null

  return isRecord(wordResults) && Array.isArray(wordResults.items)
    ? wordResults.items
    : []
}

function getFirstRecord(value) {
  if (!Array.isArray(value)) {
    return null
  }

  for (const item of value) {
    if (isRecord(item)) {
      return item
    }
  }

  return null
}

function parsePhoneticEntries(value) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .filter(isRecord)
    .map(item => ({
      phoneticSymbol: item.symbolValue,
      audioUrl: item.symbolFile
    }))
}

/**
 * Parse one API item into the raw dictionary-entry shape consumed by the
 * normalizer. No trimming, URL validation, or presentation URL generation is
 * performed here.
 */
export function parseNaverDictionaryItem(item) {
  if (!isRecord(item)) {
    return null
  }

  const collector = getFirstRecord(item.meansCollector)

  return {
    word: item.handleEntry,
    partOfSpeech: collector?.partOfSpeech,
    meanings: Array.isArray(collector?.means) ? collector.means : [],
    phonetics: parsePhoneticEntries(item.searchPhoneticSymbolList)
  }
}

/**
 * Parse only the known Naver response envelope and preserve the API values.
 * The returned records are deliberately not renderer-ready; callers should
 * pass them through normalizeNaverDictionaryEntries.
 */
export function parseNaverDictionaryItems(data) {
  let items

  try {
    items = getWordItems(data)
  } catch {
    return []
  }

  const parsedItems = []
  for (const item of items) {
    try {
      const parsedItem = parseNaverDictionaryItem(item)
      if (parsedItem) {
        parsedItems.push(parsedItem)
      }
    } catch {
      // Ignore one malformed item without discarding valid sibling entries.
    }
  }

  return parsedItems
}

/**
 * Convert parsed entries to the stable renderer contract used by Popup.vue
 * and content.js. The dictionary URL is derived only after the headword has
 * been normalized.
 */
export function normalizeNaverDictionaryEntries(entries) {
  return normalizeDictionaryEntries(entries).map(entry => ({
    ...entry,
    dictionaryUrl: buildDictionaryUrl(entry.word)
  }))
}

export function buildNaverApiUrl(query) {
  return NAVER_API_URL + encodeURIComponent(normalizeString(query))
}

export function buildDictionaryUrl(word) {
  return NAVER_DICTIONARY_URL + encodeURIComponent(normalizeString(word))
}

export function parseNaverDictionaryResponse(data) {
  return normalizeNaverDictionaryEntries(parseNaverDictionaryItems(data))
}
