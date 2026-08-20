const HTTP_PROTOCOLS = new Set(['http:', 'https:'])

function parseHttpUrl(value) {
  try {
    const url = new URL(value)
    if (!HTTP_PROTOCOLS.has(url.protocol) || url.username || url.password) {
      return null
    }
    return url
  } catch (_error) {
    return null
  }
}

export function getProviderOrigin(value) {
  const url = parseHttpUrl(value)
  return url ? url.origin : ''
}

export function getProviderOriginPattern(value) {
  const origin = getProviderOrigin(value)
  return origin ? `${origin}/*` : ''
}

function patternParts(value) {
  const match = /^(https?):\/\/([^/:*]+|\*|\*\.[^/:*]+)(?::(\*|\d+))?\/\*$/i.exec(
    String(value ?? '').trim()
  )

  if (!match) {
    return null
  }

  return {
    protocol: `${match[1].toLowerCase()}:`,
    host: match[2].toLowerCase(),
    port: match[3] || ''
  }
}

function hostMatchesPattern(host, pattern) {
  if (pattern === '*') {
    return true
  }

  if (pattern.startsWith('*.')) {
    const base = pattern.slice(2)
    return host === base || host.endsWith(`.${base}`)
  }

  return host === pattern
}

export function matchesProviderOriginPattern(value, pattern) {
  const url = parseHttpUrl(value)
  const parts = patternParts(pattern)
  if (!url || !parts || url.protocol !== parts.protocol) {
    return false
  }

  if (!hostMatchesPattern(url.hostname.toLowerCase(), parts.host)) {
    return false
  }

  if (!parts.port || parts.port === '*') {
    return true
  }

  return url.port === parts.port
}

export function isProviderOriginAllowed(value, allowedOrigins = []) {
  return Array.isArray(allowedOrigins) && allowedOrigins.some(pattern => (
    matchesProviderOriginPattern(value, pattern)
  ))
}

function callPermissionApi(api, method, pattern) {
  if (typeof api?.[method] !== 'function') {
    return Promise.resolve(false)
  }

  return new Promise(resolve => {
    let settled = false
    const complete = value => {
      if (!settled) {
        settled = true
        resolve(value === true)
      }
    }

    try {
      const result = api[method]({origins: [pattern]}, complete)
      if (result && typeof result.then === 'function') {
        result.then(complete).catch(() => complete(false))
      }
    } catch (_error) {
      complete(false)
    }
  })
}

export function hasProviderOriginPermission(permissionsApi, endpointUrl) {
  const pattern = getProviderOriginPattern(endpointUrl)
  return pattern
    ? callPermissionApi(permissionsApi, 'contains', pattern)
    : Promise.resolve(false)
}

export function requestProviderOriginPermission(permissionsApi, endpointUrl) {
  const pattern = getProviderOriginPattern(endpointUrl)
  return pattern
    ? callPermissionApi(permissionsApi, 'request', pattern)
    : Promise.resolve(false)
}
