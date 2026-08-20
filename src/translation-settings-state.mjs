export const TRANSLATION_SETTINGS_PANELS = Object.freeze({
  CHROME: 'chrome',
  PRESET: 'preset',
  CUSTOM: 'custom',
  UNKNOWN: 'unknown'
})

const PRESET_IDS = new Set(['deepl-free', 'deepl-pro', 'gemini'])
const NEW_CUSTOM_PROVIDER_ID = '__new-custom-api__'

export function getTranslationSettingsPanel(providerId, customProviders = {}) {
  if (providerId === 'chrome-translator') {
    return TRANSLATION_SETTINGS_PANELS.CHROME
  }
  if (PRESET_IDS.has(providerId)) {
    return TRANSLATION_SETTINGS_PANELS.PRESET
  }
  if (providerId === NEW_CUSTOM_PROVIDER_ID ||
      customProviders?.[providerId]?.source === 'custom') {
    return TRANSLATION_SETTINGS_PANELS.CUSTOM
  }
  return TRANSLATION_SETTINGS_PANELS.UNKNOWN
}

export function isTranslationConnectionLocked({
  globallyDisabled = false,
  connectionStatus = 'idle'
} = {}) {
  return Boolean(globallyDisabled || connectionStatus === 'testing')
}

export function canActivateTranslationProvider({
  panel,
  chromeReady = false,
  permissionAllowed = false,
  connectionStatus = 'idle',
  connectionMatches = false,
  hasCredential = false
} = {}) {
  if (panel === TRANSLATION_SETTINGS_PANELS.CHROME) {
    return Boolean(chromeReady)
  }
  if (panel === TRANSLATION_SETTINGS_PANELS.CUSTOM) {
    return Boolean(
      permissionAllowed &&
      connectionStatus === 'success' &&
      connectionMatches
    )
  }
  if (panel === TRANSLATION_SETTINGS_PANELS.PRESET) {
    return Boolean(
      hasCredential &&
      connectionStatus === 'success' &&
      connectionMatches
    )
  }
  return false
}

export function hasPendingTranslationChanges(settingsPending, editorDirty) {
  return Boolean(settingsPending || editorDirty)
}
