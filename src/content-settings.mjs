import {
  SETTINGS_STORAGE,
  normalizeSecretsV2,
  normalizeSettingsV2
} from './settings-v2.mjs'
import {loadSettingsV2} from './settings-v2-storage.mjs'
import {
  LEGACY_SECRET_KEYS,
  LEGACY_SETTING_KEYS
} from './settings-migration-v2.mjs'
import {getProviderPreset} from './translation-provider.mjs'
import {getProviderCredential} from './translation-settings.mjs'

const RELEVANT_KEYS = new Set([
  SETTINGS_STORAGE.settings.key,
  SETTINGS_STORAGE.secrets.key,
  ...LEGACY_SETTING_KEYS,
  ...LEGACY_SECRET_KEYS
])

function providerForSettings(settings) {
  const providerId = settings.translation.providerId
  return getProviderPreset(providerId) || settings.customProviders[providerId] || null
}

/**
 * Adapt the v7 envelopes to the legacy interaction shape and attach the
 * selected provider. The content script only receives the selected provider
 * credential; other local secrets never cross the content/background boundary.
 */
export function normalizeContentRuntimeSettings(values = {}) {
  const settings = normalizeSettingsV2(values.settings)
  const secrets = normalizeSecretsV2(values.secrets)
  const provider = providerForSettings(settings)
  const credential = getProviderCredential(provider, secrets)

  return {
    dclick: settings.dictionary.doubleClick.enabled,
    dclick_trigger_key: settings.dictionary.doubleClick.triggerKey,
    dclick_speed: settings.dictionary.doubleClick.speedMs,
    drag: settings.dictionary.drag.enabled,
    drag_trigger_key: settings.dictionary.drag.triggerKey,
    translate: settings.translation.enabled,
    translate_trigger_key: settings.translation.triggerKey,
    popup_bgcolor: settings.popup.backgroundColor,
    popup_fontcolor: settings.popup.fontColor,
    popup_fontsize: settings.popup.fontSizePt,
    use_deny_list: settings.sites.denyListEnabled,
    safe_urls: settings.sites.denyList,
    translationProviderId: settings.translation.providerId,
    translationProvider: provider,
    translationTargetLanguage: settings.translation.targetLanguage,
    translationCredential: credential,
    // Preserve the v6.6 field for third-party callers that still read it. It
    // is populated only for DeepL and is never used by the Chrome provider.
    deepl_auth_key: /^deepl-/.test(settings.translation.providerId)
      ? credential
      : ''
  }
}

/**
 * Keep the content page synchronized with v7 sync/local envelopes while
 * retaining the single-registration and stale-read guarantees of the v6.6
 * lifecycle. A storage change causes a complete read so sync and local
 * values cannot be combined from different revisions.
 */
export function createContentSettingsLifecycle({
  storage,
  onApply,
  onError
} = {}) {
  let listener = null
  let started = false
  let revision = 0

  function readLatest() {
    const revisionAtRequest = ++revision
    return loadSettingsV2(storage)
      .then(values => {
        if (!started || revisionAtRequest !== revision) {
          return null
        }

        const runtimeSettings = normalizeContentRuntimeSettings(values)
        onApply?.(runtimeSettings)
        return runtimeSettings
      })
      .catch(error => {
        if (started && revisionAtRequest === revision) {
          onError?.(error)
        }
        return null
      })
  }

  function handleStorageChange(changes, areaName) {
    if (!started || (areaName && areaName !== 'sync' && areaName !== 'local')) {
      return
    }

    if (!Object.keys(changes || {}).some(key => RELEVANT_KEYS.has(key))) {
      return
    }

    readLatest()
  }

  function start() {
    if (started) {
      return
    }

    started = true
    if (storage?.onChanged?.addListener) {
      listener = handleStorageChange
      storage.onChanged.addListener(listener)
    }
    readLatest()
  }

  function stop() {
    started = false
    revision += 1
    if (listener && storage?.onChanged?.removeListener) {
      storage.onChanged.removeListener(listener)
    }
    listener = null
  }

  return {start, stop, readLatest}
}
