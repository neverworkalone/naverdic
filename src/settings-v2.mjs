import {
  DEFAULT_PROVIDER_ID,
  PROVIDER_PRESETS,
  PROVIDER_SOURCES,
  normalizeProviderDefinition
} from './translation-provider.mjs'

export const SETTINGS_SCHEMA_VERSION = 2

export const SETTINGS_STORAGE = Object.freeze({
  settings: Object.freeze({
    area: 'sync',
    key: 'naverdic.settings.v2'
  }),
  secrets: Object.freeze({
    area: 'local',
    key: 'naverdic.secrets.v2'
  })
})

export const SETTINGS_PAGE_IDS = Object.freeze({
  DICTIONARY: 'dictionary',
  TRANSLATION: 'translation',
  POPUP: 'popup',
  SITES: 'sites',
  ADVANCED: 'advanced',
  HELP: 'help'
})

export const SETTINGS_MENU = Object.freeze([
  Object.freeze({
    id: SETTINGS_PAGE_IDS.DICTIONARY,
    kind: 'page',
    order: 10,
    labelKey: 'SETTINGS_MENU_DICTIONARY',
    descriptionKey: 'SETTINGS_PAGE_DICTIONARY_DESCRIPTION'
  }),
  Object.freeze({
    id: SETTINGS_PAGE_IDS.TRANSLATION,
    kind: 'page',
    order: 20,
    labelKey: 'SETTINGS_MENU_TRANSLATION',
    descriptionKey: 'SETTINGS_PAGE_TRANSLATION_DESCRIPTION'
  }),
  Object.freeze({
    id: SETTINGS_PAGE_IDS.POPUP,
    kind: 'page',
    order: 30,
    labelKey: 'SETTINGS_MENU_POPUP',
    descriptionKey: 'SETTINGS_PAGE_POPUP_DESCRIPTION'
  }),
  Object.freeze({
    id: SETTINGS_PAGE_IDS.SITES,
    kind: 'page',
    order: 40,
    labelKey: 'SETTINGS_MENU_SITES',
    descriptionKey: 'SETTINGS_PAGE_SITES_DESCRIPTION'
  }),
  Object.freeze({
    id: SETTINGS_PAGE_IDS.ADVANCED,
    kind: 'page',
    order: 50,
    labelKey: 'SETTINGS_MENU_ADVANCED',
    descriptionKey: 'SETTINGS_PAGE_ADVANCED_DESCRIPTION',
    actions: Object.freeze(['reset'])
  }),
  Object.freeze({
    id: SETTINGS_PAGE_IDS.HELP,
    kind: 'external',
    order: 90,
    labelKey: 'SETTINGS_MENU_HELP',
    url: 'https://neverworkalone.github.io/naverdic/',
    external: true
  })
])

const TRIGGER_KEYS = Object.freeze(['none', 'ctrl', 'alt', 'ctrlalt'])
const INTERFACE_LANGUAGES = Object.freeze(['auto', 'ko', 'en'])

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function cloneValue(value) {
  if (Array.isArray(value)) {
    return value.map(cloneValue)
  }

  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [
      key,
      cloneValue(child)
    ]))
  }

  return value
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) {
    return value
  }

  Object.values(value).forEach(deepFreeze)
  return Object.freeze(value)
}

function normalizeBoolean(value, fallback) {
  if (typeof value === 'boolean') {
    return value
  }

  if (value === true || value === 1 || value === '1' || value === 'true') {
    return true
  }

  if (value === false || value === 0 || value === '0' || value === 'false') {
    return false
  }

  return fallback
}

function normalizeString(value, fallback) {
  if (typeof value !== 'string') {
    return fallback
  }

  const normalized = value.trim()
  return normalized || fallback
}

function normalizeTrigger(value, fallback) {
  const normalized = normalizeString(value, '')
  return TRIGGER_KEYS.includes(normalized) ? normalized : fallback
}

function normalizePositiveNumber(value, fallback) {
  const candidate = typeof value === 'string' && value.trim()
    ? Number(value.trim())
    : value

  return typeof candidate === 'number' && Number.isFinite(candidate) && candidate > 0
    ? Math.round(candidate)
    : fallback
}

function normalizeLanguage(value, fallback) {
  const normalized = normalizeString(value, fallback).toLowerCase()
  return normalized === 'auto' || normalized === 'ko' || normalized === 'en'
    ? normalized
    : fallback
}

function normalizeLanguageCode(value, fallback) {
  const normalized = normalizeString(value, fallback).toLowerCase()
  return /^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/.test(normalized)
    ? normalized
    : fallback
}

function normalizeProviderId(value, fallback) {
  const normalized = normalizeString(value, fallback).toLowerCase()
  return /^[a-z0-9][a-z0-9._-]{0,63}$/.test(normalized) ? normalized : fallback
}

function normalizeDomain(value) {
  let candidate = normalizeString(value, '').toLowerCase().replace(/^\*\./, '')
  if (!candidate) {
    return ''
  }

  try {
    const url = /^[a-z][a-z\d+.-]*:\/\//i.test(candidate)
      ? new URL(candidate)
      : new URL(`http://${candidate}`)
    return url.hostname.toLowerCase().replace(/^\.+|\.+$/g, '')
  } catch (_error) {
    return candidate
      .split(/[/?#]/, 1)[0]
      .replace(/:\d+$/, '')
      .replace(/^\.+|\.+$/g, '')
  }
}

export function normalizeDomainList(value) {
  const entries = Array.isArray(value)
    ? value
    : String(value ?? '').split(/[,;\r\n]+/)
  const seen = new Set()

  return entries
    .map(normalizeDomain)
    .filter(Boolean)
    .filter(entry => {
      if (seen.has(entry)) {
        return false
      }
      seen.add(entry)
      return true
    })
}

export const SETTINGS_SCHEMA_V2 = Object.freeze([
  Object.freeze({path: 'schemaVersion', type: 'integer', storage: 'sync', defaultValue: SETTINGS_SCHEMA_VERSION}),
  Object.freeze({path: 'interface.language', type: 'enum', storage: 'sync', defaultValue: 'auto', values: INTERFACE_LANGUAGES}),
  Object.freeze({path: 'dictionary.doubleClick.enabled', type: 'boolean', storage: 'sync', defaultValue: true}),
  Object.freeze({path: 'dictionary.doubleClick.triggerKey', type: 'trigger', storage: 'sync', defaultValue: 'none', values: TRIGGER_KEYS}),
  Object.freeze({path: 'dictionary.doubleClick.speedMs', type: 'positive-integer', storage: 'sync', defaultValue: 400}),
  Object.freeze({path: 'dictionary.drag.enabled', type: 'boolean', storage: 'sync', defaultValue: true}),
  Object.freeze({path: 'dictionary.drag.triggerKey', type: 'trigger', storage: 'sync', defaultValue: 'ctrl', values: TRIGGER_KEYS}),
  Object.freeze({path: 'popup.backgroundColor', type: 'string', storage: 'sync', defaultValue: '#FFF59D'}),
  Object.freeze({path: 'popup.fontColor', type: 'string', storage: 'sync', defaultValue: '#000000'}),
  Object.freeze({path: 'popup.fontSizePt', type: 'positive-integer', storage: 'sync', defaultValue: 11}),
  Object.freeze({path: 'sites.denyListEnabled', type: 'boolean', storage: 'sync', defaultValue: false}),
  Object.freeze({path: 'sites.denyList', type: 'domain-list', storage: 'sync', defaultValue: []}),
  Object.freeze({path: 'translation.enabled', type: 'boolean', storage: 'sync', defaultValue: false}),
  Object.freeze({path: 'translation.triggerKey', type: 'trigger', storage: 'sync', defaultValue: 'ctrlalt', values: TRIGGER_KEYS}),
  Object.freeze({path: 'translation.providerId', type: 'provider-id', storage: 'sync', defaultValue: DEFAULT_PROVIDER_ID}),
  Object.freeze({path: 'translation.targetLanguage', type: 'language-code', storage: 'sync', defaultValue: 'ko'}),
  Object.freeze({path: 'customProviders', type: 'provider-map', storage: 'sync', defaultValue: {}})
])

export const SETTINGS_V2_DEFAULTS = deepFreeze({
  schemaVersion: SETTINGS_SCHEMA_VERSION,
  interface: {
    language: 'auto'
  },
  dictionary: {
    doubleClick: {
      enabled: true,
      triggerKey: 'none',
      speedMs: 400
    },
    drag: {
      enabled: true,
      triggerKey: 'ctrl'
    }
  },
  popup: {
    backgroundColor: '#FFF59D',
    fontColor: '#000000',
    fontSizePt: 11
  },
  sites: {
    denyListEnabled: false,
    denyList: []
  },
  translation: {
    enabled: false,
    triggerKey: 'ctrlalt',
    providerId: DEFAULT_PROVIDER_ID,
    targetLanguage: 'ko'
  },
  customProviders: {}
})

export const SECRETS_V2_DEFAULTS = deepFreeze({
  schemaVersion: SETTINGS_SCHEMA_VERSION,
  providers: {}
})

function normalizeCustomProviders(value) {
  if (!isRecord(value)) {
    return {}
  }

  const normalized = {}
  Object.entries(value).forEach(([id, definition]) => {
    const provider = normalizeProviderDefinition(definition, {id})
    if (provider &&
        provider.source === PROVIDER_SOURCES.CUSTOM &&
        !PROVIDER_PRESETS[provider.id]) {
      normalized[provider.id] = provider
    }
  })
  return normalized
}

export function createDefaultSettingsV2() {
  return cloneValue(SETTINGS_V2_DEFAULTS)
}

export function createDefaultSecretsV2() {
  return cloneValue(SECRETS_V2_DEFAULTS)
}

export function normalizeSettingsV2(values) {
  const source = isRecord(values) ? values : {}
  const defaults = createDefaultSettingsV2()
  const customProviders = normalizeCustomProviders(source.customProviders)
  const requestedProviderId = normalizeProviderId(
    source.translation?.providerId,
    defaults.translation.providerId
  )
  const knownProviderIds = new Set([
    ...Object.keys(PROVIDER_PRESETS),
    ...Object.keys(customProviders)
  ])
  const providerId = knownProviderIds.has(requestedProviderId)
    ? requestedProviderId
    : defaults.translation.providerId

  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    interface: {
      language: normalizeLanguage(source.interface?.language, defaults.interface.language)
    },
    dictionary: {
      doubleClick: {
        enabled: normalizeBoolean(
          source.dictionary?.doubleClick?.enabled,
          defaults.dictionary.doubleClick.enabled
        ),
        triggerKey: normalizeTrigger(
          source.dictionary?.doubleClick?.triggerKey,
          defaults.dictionary.doubleClick.triggerKey
        ),
        speedMs: normalizePositiveNumber(
          source.dictionary?.doubleClick?.speedMs,
          defaults.dictionary.doubleClick.speedMs
        )
      },
      drag: {
        enabled: normalizeBoolean(
          source.dictionary?.drag?.enabled,
          defaults.dictionary.drag.enabled
        ),
        triggerKey: normalizeTrigger(
          source.dictionary?.drag?.triggerKey,
          defaults.dictionary.drag.triggerKey
        )
      }
    },
    popup: {
      backgroundColor: normalizeString(
        source.popup?.backgroundColor,
        defaults.popup.backgroundColor
      ),
      fontColor: normalizeString(
        source.popup?.fontColor,
        defaults.popup.fontColor
      ),
      fontSizePt: normalizePositiveNumber(
        source.popup?.fontSizePt,
        defaults.popup.fontSizePt
      )
    },
    sites: {
      denyListEnabled: normalizeBoolean(
        source.sites?.denyListEnabled,
        defaults.sites.denyListEnabled
      ),
      denyList: normalizeDomainList(source.sites?.denyList)
    },
    translation: {
      enabled: normalizeBoolean(
        source.translation?.enabled,
        defaults.translation.enabled
      ),
      triggerKey: normalizeTrigger(
        source.translation?.triggerKey,
        defaults.translation.triggerKey
      ),
      providerId,
      targetLanguage: normalizeLanguageCode(
        source.translation?.targetLanguage,
        defaults.translation.targetLanguage
      )
    },
    customProviders
  }
}

export function normalizeSecretsV2(values) {
  const source = isRecord(values) ? values : {}
  const providers = isRecord(source.providers) ? source.providers : {}
  const normalizedProviders = {}

  Object.entries(providers).forEach(([id, credentials]) => {
    const providerId = normalizeProviderId(id, '')
    if (!providerId || !isRecord(credentials)) {
      return
    }

    const apiKey = normalizeString(credentials.apiKey, '')
    const token = normalizeString(credentials.token, '')
    if (apiKey || token) {
      normalizedProviders[providerId] = {}
      if (apiKey) {
        normalizedProviders[providerId].apiKey = apiKey
      }
      if (token) {
        normalizedProviders[providerId].token = token
      }
    }
  })

  return {
    schemaVersion: SETTINGS_SCHEMA_VERSION,
    providers: normalizedProviders
  }
}

export function getSettingPathValue(settings, path) {
  return path.split('.').reduce((value, segment) => value?.[segment], settings)
}

export function hasSettingsV2Envelope(value) {
  return isRecord(value) && value.schemaVersion === SETTINGS_SCHEMA_VERSION
}
