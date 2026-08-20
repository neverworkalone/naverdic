function supportsCssColor(value) {
  const css = globalThis.CSS
  if (css && typeof css.supports === 'function') {
    return css.supports('color', value)
  }

  if (typeof document === 'undefined' || typeof document.createElement !== 'function') {
    return false
  }

  const element = document.createElement('span')
  element.style.color = ''
  element.style.color = value
  return element.style.color !== ''
}

export function resolveCssColor(value, fallback) {
  const candidate = String(value ?? '').trim()

  try {
    return candidate && supportsCssColor(candidate) ? candidate : fallback
  } catch (_error) {
    return fallback
  }
}
