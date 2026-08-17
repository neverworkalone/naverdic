const NAVER_API_URL = 'https://en.dict.naver.com/api3/enko/search?m=mobile&lang=ko&query='
const NAVER_DICTIONARY_URL = 'https://en.dict.naver.com/#/search?query='

function toText(value) {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value)
  }

  return ''
}

function toHttpUrl(value) {
  const candidate = toText(value).trim()
  if (!candidate) {
    return ''
  }

  try {
    const parsed = new URL(candidate)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return candidate
    }
  } catch {
    // Ignore malformed external URLs.
  }

  return ''
}

function getFirstAudioEntry(item) {
  if (!Array.isArray(item.searchPhoneticSymbolList)) {
    return null
  }

  for (const phoneticEntry of item.searchPhoneticSymbolList) {
    if (!phoneticEntry || typeof phoneticEntry !== 'object') {
      continue
    }

    const audioUrl = toHttpUrl(phoneticEntry.symbolFile)
    if (audioUrl) {
      return {
        phoneticSymbol: toText(phoneticEntry.symbolValue),
        audioUrl
      }
    }
  }

  return null
}

function getFirstCollector(item) {
  if (!Array.isArray(item.meansCollector)) {
    return null
  }

  return item.meansCollector.find(collector => collector && typeof collector === 'object') || null
}

function getMeanings(collector) {
  if (!collector || !Array.isArray(collector.means)) {
    return []
  }

  return collector.means
    .filter(meaning => meaning && typeof meaning === 'object')
    .map(meaning => ({
      order: toText(meaning.order),
      value: toText(meaning.value)
    }))
}

export function buildNaverApiUrl(query) {
  return NAVER_API_URL + encodeURIComponent(toText(query))
}

export function buildDictionaryUrl(word) {
  return NAVER_DICTIONARY_URL + encodeURIComponent(toText(word))
}

export function parseNaverDictionaryResponse(data) {
  const items = data?.searchResultMap?.searchResultListMap?.WORD?.items
  if (!Array.isArray(items)) {
    return []
  }

  return items
    .filter(item => item && typeof item === 'object')
    .map(item => {
      const word = toText(item.handleEntry)
      const collector = getFirstCollector(item)
      const audioEntry = getFirstAudioEntry(item)

      return {
        word,
        dictionaryUrl: buildDictionaryUrl(word),
        partOfSpeech: toText(collector?.partOfSpeech),
        phoneticSymbol: audioEntry?.phoneticSymbol || '',
        audioUrl: audioEntry?.audioUrl || '',
        meanings: getMeanings(collector)
      }
    })
}
