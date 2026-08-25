function skipWhitespace(source, index) {
  while (index < source.length && /\s/.test(source[index])) {
    index += 1
  }
  return index
}

function readJsonString(source, index) {
  const start = index
  index += 1
  let escaped = false

  while (index < source.length) {
    const character = source[index]
    if (escaped) {
      escaped = false
    } else if (character === '\\') {
      escaped = true
    } else if (character === '"') {
      const raw = source.slice(start, index + 1)
      return {value: JSON.parse(raw), index: index + 1}
    }
    index += 1
  }

  throw new SyntaxError('Unterminated JSON string.')
}

function skipJsonValue(source, index) {
  let depth = 0
  let inString = false
  let escaped = false

  while (index < source.length) {
    const character = source[index]

    if (inString) {
      if (escaped) {
        escaped = false
      } else if (character === '\\') {
        escaped = true
      } else if (character === '"') {
        inString = false
      }
      index += 1
      continue
    }

    if (character === '"') {
      inString = true
      index += 1
      continue
    }

    if (character === '{' || character === '[') {
      depth += 1
      index += 1
      continue
    }

    if (character === '}' || character === ']') {
      if (depth === 0) {
        return index
      }
      depth -= 1
      index += 1
      continue
    }

    if (depth === 0 && character === ',') {
      return index
    }

    index += 1
  }

  return index
}

/**
 * Find duplicate property names in the root object before JSON.parse() loses
 * the earlier value. Nested message metadata is intentionally out of scope.
 */
export function findDuplicateTopLevelJsonKeys(source) {
  let index = skipWhitespace(String(source), 0)
  const text = String(source)
  if (text[index] !== '{') {
    throw new SyntaxError('Locale source must contain a root JSON object.')
  }
  index += 1

  const seen = new Set()
  const duplicates = new Set()

  while (true) {
    index = skipWhitespace(text, index)
    if (text[index] === '}') {
      return [...duplicates]
    }
    if (text[index] !== '"') {
      throw new SyntaxError('Expected a top-level JSON property name.')
    }

    const parsedKey = readJsonString(text, index)
    index = skipWhitespace(text, parsedKey.index)
    if (text[index] !== ':') {
      throw new SyntaxError(`Expected a value for locale key ${parsedKey.value}.`)
    }
    index = skipJsonValue(text, index + 1)

    if (seen.has(parsedKey.value)) {
      duplicates.add(parsedKey.value)
    }
    seen.add(parsedKey.value)

    index = skipWhitespace(text, index)
    if (text[index] === ',') {
      index += 1
      continue
    }
    if (text[index] === '}') {
      return [...duplicates]
    }
    throw new SyntaxError(`Expected a separator after locale key ${parsedKey.value}.`)
  }
}
