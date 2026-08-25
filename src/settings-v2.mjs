import {
  CHROME_TRANSLATOR_PROVIDER_ID,
  DEFAULT_PROVIDER_ID,
  GEMINI_DEFAULT_MODEL_ID,
  normalizeGeminiModelId,
  PROVIDER_PRESETS
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
    order: 10
  }),
  Object.freeze({
    id: SETTINGS_PAGE_IDS.TRANSLATION,
    kind: 'page',
    order: 20
  }),
  Object.freeze({
    id: SETTINGS_PAGE_IDS.POPUP,
    kind: 'page',
    order: 30
  }),
  Object.freeze({
    id: SETTINGS_PAGE_IDS.SITES,
    kind: 'page',
    order: 40
  }),
  Object.freeze({
    id: SETTINGS_PAGE_IDS.ADVANCED,
    kind: 'page',
    order: 50,
    actions: Object.freeze(['reset'])
  }),
  Object.freeze({
    id: SETTINGS_PAGE_IDS.HELP,
    kind: 'external',
    order: 90,
    url: 'https://neverworkalone.github.io/naverdic/',
    external: true
  })
])

// The settings data contract groups dictionary behavior under one page, while
// the v7 shell exposes the two dictionary behaviors as separate screens. Keep
// that UI detail explicit so the shell can match Figma without duplicating
// persisted settings or changing the stable page IDs above.
export const SETTINGS_NAVIGATION = Object.freeze([
  Object.freeze({
    id: 'appearance',
    pageId: SETTINGS_PAGE_IDS.POPUP,
    section: 'appearance',
    kind: 'page',
    order: 10,
    labelKey: 'SETTINGS_NAV_APPEARANCE',
    titleKey: 'SETTINGS_PAGE_APPEARANCE_TITLE',
    descriptionKey: 'SETTINGS_PAGE_APPEARANCE_DESCRIPTION'
  }),
  Object.freeze({
    id: 'double-click',
    pageId: SETTINGS_PAGE_IDS.DICTIONARY,
    section: 'doubleClick',
    kind: 'page',
    order: 20,
    labelKey: 'SETTINGS_NAV_DOUBLE_CLICK',
    titleKey: 'SETTINGS_PAGE_DOUBLE_CLICK_TITLE',
    descriptionKey: 'SETTINGS_PAGE_DOUBLE_CLICK_DESCRIPTION',
    previewTitleKey: 'SETTINGS_PREVIEW_DOUBLE_CLICK_TITLE',
    previewDescriptionKey: 'SETTINGS_PREVIEW_DOUBLE_CLICK_DESCRIPTION'
  }),
  Object.freeze({
    id: 'behavior',
    pageId: SETTINGS_PAGE_IDS.DICTIONARY,
    section: 'behavior',
    kind: 'page',
    order: 30,
    labelKey: 'SETTINGS_NAV_BEHAVIOR',
    titleKey: 'SETTINGS_PAGE_BEHAVIOR_TITLE',
    descriptionKey: 'SETTINGS_PAGE_BEHAVIOR_DESCRIPTION',
    previewTitleKey: 'SETTINGS_PREVIEW_DRAG_TITLE',
    previewDescriptionKey: 'SETTINGS_PREVIEW_DRAG_DESCRIPTION'
  }),
  Object.freeze({
    id: 'translation-service',
    pageId: SETTINGS_PAGE_IDS.TRANSLATION,
    section: 'translation',
    kind: 'page',
    order: 40,
    labelKey: 'SETTINGS_NAV_TRANSLATION',
    titleKey: 'SETTINGS_PAGE_TRANSLATION_TITLE',
    descriptionKey: 'SETTINGS_PAGE_TRANSLATION_DESCRIPTION'
  }),
  Object.freeze({
    id: 'blocked-sites',
    pageId: SETTINGS_PAGE_IDS.SITES,
    section: 'sites',
    kind: 'page',
    order: 50,
    labelKey: 'SETTINGS_NAV_BLOCKED_SITES',
    titleKey: 'SETTINGS_PAGE_BLOCKED_SITES_TITLE',
    descriptionKey: 'SETTINGS_PAGE_BLOCKED_SITES_DESCRIPTION',
    previewTitleKey: 'SETTINGS_PREVIEW_BLOCKED_SITES_TITLE',
    previewDescriptionKey: 'SETTINGS_PREVIEW_BLOCKED_SITES_DESCRIPTION'
  }),
  Object.freeze({
    id: 'advanced',
    pageId: SETTINGS_PAGE_IDS.ADVANCED,
    section: 'advanced',
    kind: 'page',
    order: 60,
    labelKey: 'SETTINGS_NAV_ADVANCED',
    titleKey: 'SETTINGS_PAGE_ADVANCED_TITLE',
    descriptionKey: 'SETTINGS_PAGE_ADVANCED_DESCRIPTION',
    previewTitleKey: 'SETTINGS_PREVIEW_ADVANCED_TITLE',
    previewDescriptionKey: 'SETTINGS_PREVIEW_ADVANCED_DESCRIPTION',
    actions: Object.freeze(['reset'])
  }),
  Object.freeze({
    id: 'help',
    kind: 'external',
    order: 70,
    labelKey: 'SETTINGS_NAV_HELP',
    url: SETTINGS_MENU.find(item => item.id === SETTINGS_PAGE_IDS.HELP).url,
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
  Object.freeze({path: 'dictionary.drag.enabled', type: 'boolean', storage: 'sync', defaultValue: false}),
  Object.freeze({path: 'dictionary.drag.triggerKey', type: 'trigger', storage: 'sync', defaultValue: 'alt', values: TRIGGER_KEYS}),
  Object.freeze({path: 'popup.backgroundColor', type: 'string', storage: 'sync', defaultValue: '#F5F6F8'}),
  Object.freeze({path: 'popup.fontColor', type: 'string', storage: 'sync', defaultValue: '#000000'}),
  Object.freeze({path: 'popup.fontSizePt', type: 'positive-integer', storage: 'sync', defaultValue: 11}),
  Object.freeze({path: 'sites.denyListEnabled', type: 'boolean', storage: 'sync', defaultValue: false}),
  Object.freeze({path: 'sites.denyList', type: 'domain-list', storage: 'sync', defaultValue: []}),
  Object.freeze({path: 'translation.enabled', type: 'boolean', storage: 'sync', defaultValue: true}),
  Object.freeze({path: 'translation.triggerKey', type: 'trigger', storage: 'sync', defaultValue: 'ctrl', values: TRIGGER_KEYS}),
  Object.freeze({path: 'translation.providerId', type: 'provider-id', storage: 'sync', defaultValue: DEFAULT_PROVIDER_ID}),
  Object.freeze({path: 'translation.targetLanguage', type: 'language-code', storage: 'sync', defaultValue: 'ko'}),
  Object.freeze({path: 'translation.geminiModel', type: 'string', storage: 'sync', defaultValue: GEMINI_DEFAULT_MODEL_ID})
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
      enabled: false,
      triggerKey: 'alt'
    }
  },
  popup: {
    backgroundColor: '#F5F6F8',
    fontColor: '#000000',
    fontSizePt: 11
  },
  sites: {
    denyListEnabled: false,
    denyList: []
  },
  translation: {
    enabled: true,
    triggerKey: 'ctrl',
    providerId: DEFAULT_PROVIDER_ID,
    targetLanguage: 'ko',
    geminiModel: GEMINI_DEFAULT_MODEL_ID
  }
})

export const SECRETS_V2_DEFAULTS = deepFreeze({
  schemaVersion: SETTINGS_SCHEMA_VERSION,
  providers: {}
})

export function createDefaultSettingsV2() {
  return cloneValue(SETTINGS_V2_DEFAULTS)
}

// The compatibility defaults keep the v2 contract stable for callers that
// normalize incomplete settings. New installs and resets keep drag lookup off
// by default and use Alt/Option as its trigger when enabled.
export function createInitialSettingsV2() {
  const settings = createDefaultSettingsV2()
  settings.translation.providerId = CHROME_TRANSLATOR_PROVIDER_ID
  return settings
}

export function createDefaultSecretsV2() {
  return cloneValue(SECRETS_V2_DEFAULTS)
}

export function normalizeSettingsV2(values) {
  const source = isRecord(values) ? values : {}
  const defaults = createDefaultSettingsV2()
  const requestedProviderId = normalizeProviderId(
    source.translation?.providerId,
    defaults.translation.providerId
  )
  const knownProviderIds = new Set(Object.keys(PROVIDER_PRESETS))
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
      ),
      geminiModel: normalizeGeminiModelId(
        source.translation?.geminiModel,
        defaults.translation.geminiModel
      )
    }
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
    if (!PROVIDER_PRESETS[providerId]) {
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

export function hasSecretsV2Envelope(value) {
  return isRecord(value) &&
    value.schemaVersion === SETTINGS_SCHEMA_VERSION &&
    isRecord(value.providers)
}
