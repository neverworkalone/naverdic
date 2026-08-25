/**
 * Values coming from the dictionary API are JSON data, not trusted model
 * instances. These helpers keep the presentation contract small and stable:
 * scalar text is always a trimmed string, unsupported values become an empty
 * string, and collections always become arrays.
 */

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

const INLINE_HTML_BREAK_PATTERN = /<br\s*\/?>/gi
const INLINE_HTML_TAG_PATTERN = /<\/?[a-z][^>]*>/gi
const HTML_ENTITY_PATTERN = /&(?:#x[\da-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi

const HTML_ENTITY_VALUES = Object.freeze({
  '&amp;': '&',
  '&apos;': "'",
  '&gt;': '>',
  '&lt;': '<',
  '&nbsp;': '\u00a0',
  '&quot;': '"'
})

export function normalizeString(value) {
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') {
    return ''
  }

  return String(value).trim()
}

function decodeHtmlEntity(entity) {
  const token = entity.slice(1, -1)
  if (token.startsWith('#x') || token.startsWith('#X')) {
    const codePoint = Number.parseInt(token.slice(2), 16)
    return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
      ? String.fromCodePoint(codePoint)
      : entity
  }

  if (token.startsWith('#')) {
    const codePoint = Number.parseInt(token.slice(1), 10)
    return Number.isInteger(codePoint) && codePoint >= 0 && codePoint <= 0x10ffff
      ? String.fromCodePoint(codePoint)
      : entity
  }

  return HTML_ENTITY_VALUES[entity.toLowerCase()] || entity
}

function decodeHtmlEntities(value) {
  let decoded = value
  for (let pass = 0; pass < 2; pass += 1) {
    const next = decoded.replace(HTML_ENTITY_PATTERN, decodeHtmlEntity)
    if (next === decoded) {
      break
    }
    decoded = next
  }
  return decoded
}

/**
 * Naver's meaning strings may contain presentational tags such as
 * `<span class="related_word">` and HTML-escaped usage delimiters. Popup
 * rendering intentionally uses text nodes, so normalize those values into
 * readable text without exposing markup or entity syntax.
 */
export function stripInlineMarkup(value) {
  return decodeHtmlEntities(normalizeString(value))
    .replace(INLINE_HTML_BREAK_PATTERN, '\n')
    .replace(INLINE_HTML_TAG_PATTERN, '')
    .replace(/[<>]/g, '')
    .trim()
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
    value: stripInlineMarkup(value.value)
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
    phoneticSymbol: stripInlineMarkup(value.phoneticSymbol),
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
