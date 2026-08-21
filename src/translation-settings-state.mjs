export const TRANSLATION_SETTINGS_PANELS = Object.freeze({
  CHROME: 'chrome',
  PRESET: 'preset',
  UNKNOWN: 'unknown'
})

const PRESET_IDS = new Set(['deepl-free', 'deepl-pro', 'gemini'])

export function getTranslationSettingsPanel(providerId) {
  if (providerId === 'chrome-translator') {
    return TRANSLATION_SETTINGS_PANELS.CHROME
  }
  if (PRESET_IDS.has(providerId)) {
    return TRANSLATION_SETTINGS_PANELS.PRESET
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
  connectionStatus = 'idle',
  connectionMatches = false,
  hasCredential = false
} = {}) {
  if (panel === TRANSLATION_SETTINGS_PANELS.CHROME) {
    return Boolean(chromeReady)
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
