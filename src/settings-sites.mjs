function isValidIpv4(value) {
  const parts = value.split('.')
  return parts.length === 4 && parts.every(part => {
    if (!/^\d{1,3}$/.test(part)) {
      return false
    }

    const number = Number(part)
    return number >= 0 && number <= 255
  })
}

function isValidHostname(value) {
  if (value === 'localhost' || isValidIpv4(value)) {
    return true
  }

  const labels = value.split('.')
  if (labels.length < 2) {
    return false
  }

  return labels.every(label => (
    label.length > 0 &&
    label.length <= 63 &&
    /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label)
  ))
}

function normalizeSiteToken(value) {
  let candidate = String(value ?? '').trim().toLowerCase()
  if (!candidate) {
    return ''
  }

  candidate = candidate.replace(/^\*\./, '')
  const urlValue = /^[a-z][a-z\d+.-]*:\/\//i.test(candidate)
    ? candidate
    : `http://${candidate}`

  try {
    const url = new URL(urlValue)
    if (url.username || url.password || !isValidHostname(url.hostname)) {
      return ''
    }

    return url.hostname.toLowerCase().replace(/^\.+|\.+$/g, '')
  } catch (_error) {
    return ''
  }
}

export function parseDenyListInput(value) {
  const entries = Array.isArray(value)
    ? value
    : String(value ?? '').split(/[,;\r\n]+/)
  const domains = []
  const invalidEntries = []
  const seenDomains = new Set()
  const seenInvalidEntries = new Set()

  entries.forEach(entry => {
    const raw = String(entry ?? '').trim()
    if (!raw) {
      return
    }

    const domain = normalizeSiteToken(raw)
    if (!domain) {
      if (!seenInvalidEntries.has(raw)) {
        seenInvalidEntries.add(raw)
        invalidEntries.push(raw)
      }
      return
    }

    if (!seenDomains.has(domain)) {
      seenDomains.add(domain)
      domains.push(domain)
    }
  })

  return {domains, invalidEntries}
}

export function formatDenyList(value) {
  return parseDenyListInput(value).domains.join('\n')
}
