/**
 * Values coming from the dictionary API are JSON data, not trusted model
 * instances. These helpers keep the presentation contract small and stable:
 * scalar text is always a trimmed string, unsupported values become an empty
 * string, and collections always become arrays.
 */

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function normalizeString(value) {
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
    return ''
  }

  return String(value).trim()
}

export function normalizeStringList(value) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map(normalizeString)
    .filter(Boolean)
}

export function normalizeHttpUrl(value) {
  const candidate = normalizeString(value)
  if (!candidate) {
    return ''
  }

  try {
    const parsed = new URL(candidate)
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return candidate
    }
  } catch {
    // Invalid or unsupported URLs are represented by the empty string.
  }

  return ''
}

export function normalizeMeaning(value) {
  if (!isRecord(value)) {
    return null
  }

  return {
    order: normalizeString(value.order),
    value: normalizeString(value.value)
  }
}

export function normalizeMeanings(value) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map(normalizeMeaning)
    .filter(Boolean)
}

export function normalizePhoneticEntry(value) {
  if (!isRecord(value)) {
    return null
  }

  const audioUrl = normalizeHttpUrl(value.audioUrl)
  if (!audioUrl) {
    return null
  }

  return {
    phoneticSymbol: normalizeString(value.phoneticSymbol),
    audioUrl
  }
}

export function normalizePhoneticEntries(value) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map(normalizePhoneticEntry)
    .filter(Boolean)
}

/**
 * Input contract:
 *   { word, partOfSpeech, meanings, phonetics }
 *
 * Output contract:
 *   { word, partOfSpeech, phoneticSymbol, audioUrl, meanings }
 *
 * `phonetics` contains candidates in API order. The first candidate with a
 * valid HTTP(S) audio URL wins, matching the existing one-audio UI contract.
 */
export function normalizeDictionaryEntry(value) {
  if (!isRecord(value)) {
    return null
  }

  const phoneticEntry = normalizePhoneticEntries(value.phonetics)[0]

  return {
    word: normalizeString(value.word),
    partOfSpeech: normalizeString(value.partOfSpeech),
    phoneticSymbol: phoneticEntry?.phoneticSymbol || '',
    audioUrl: phoneticEntry?.audioUrl || '',
    meanings: normalizeMeanings(value.meanings)
  }
}

export function normalizeDictionaryEntries(value) {
  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map(normalizeDictionaryEntry)
    .filter(Boolean)
}
