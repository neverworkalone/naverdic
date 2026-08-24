import {
  checkTrigger,
  createInteractionController,
  getDictionaryQuery,
  getSelectionText,
  isDeniedSite
} from './content-interaction.mjs'
import {createContentSettingsLifecycle} from './content-settings.mjs'
// Keep the v6.6 lifecycle module in the content dependency graph for unpacked
// compatibility; v7 reads the split settings envelopes above.
import {createStorageLifecycle} from './content-storage.mjs'
import {createInlinePopupDataClient} from './content-data.mjs'
import {createPopupAnchor} from './content-position.mjs'
import {createPopupController, POPUP_STATES} from './content-popup.mjs'
import {
  createPopupRequestCoordinator,
  POPUP_REQUEST_STATUSES,
  isAbortError
} from './content-request.mjs'
import {createChromeTranslatorRuntime} from './chrome-translator.mjs'
import {
  MESSAGE_ERROR_CODES,
  reportMessageFailure
} from './messaging.mjs'
import {
  DEFAULT_OPTIONS,
  STORAGE_DEFAULTS
} from './settings.mjs'
import {
  CHROME_TRANSLATOR_PROVIDER_ID,
  getProviderPreset
} from './translation-provider.mjs'

export {DEFAULT_OPTIONS, STORAGE_DEFAULTS}

const popupWidth = 360
let popupColor = DEFAULT_OPTIONS.POPUP_BG_COLOR
let popupFontColor = DEFAULT_OPTIONS.POPUP_FONT_COLOR
let popupFontsize = DEFAULT_OPTIONS.POPUP_FONT_SIZE

let activeInteractionController = null
let storageLifecycle = null
let chromeTranslatorRuntime = null
let activeTranslationProviderId = ''
let interactionConfigurationRevision = 0
let popupController = null
let popupRequestCoordinator = null
let popupDataClient = null
void createStorageLifecycle

function getPopupController() {
  if (!popupController) {
    popupController = createPopupController({
      document,
      window,
      options: {
        width: popupWidth,
        backgroundColor: popupColor,
        fontColor: popupFontColor,
        fontSizePt: popupFontsize
      }
    })
  }

  return popupController
}

function getPopupRequestCoordinator() {
  if (!popupRequestCoordinator) {
    popupRequestCoordinator = createPopupRequestCoordinator()
  }

  return popupRequestCoordinator
}

function getPopupDataClient() {
  if (!popupDataClient) {
    popupDataClient = createInlinePopupDataClient({
      runtime: chrome.runtime,
      getChromeTranslatorRuntime
    })
  }

  return popupDataClient
}

function getChromeTranslatorRuntime() {
  if (!chromeTranslatorRuntime) {
    chromeTranslatorRuntime = createChromeTranslatorRuntime()
  }
  return chromeTranslatorRuntime
}

function prepareChromeTranslatorRuntime() {
  return getChromeTranslatorRuntime()
}

function reportPopupError(scope, error) {
  if (isAbortError(error)) {
    return
  }

  if (error?.response) {
    reportMessageFailure(scope, error.response)
    return
  }

  reportMessageFailure(scope, {
    ok: false,
    error: {
      code: error?.code || MESSAGE_ERROR_CODES.RUNTIME_ERROR,
      message: error?.message || 'The popup request failed.'
    }
  })
}

function getPopupAnchor(event) {
  return createPopupAnchor({
    selection: window.getSelection?.(),
    event,
    window
  })
}

function renderRequestResult(type, result) {
  if (!popupController?.isOpen?.()) {
    return
  }

  if (result.status === POPUP_REQUEST_STATUSES.SUCCESS) {
    popupController.update(POPUP_STATES.RESULT, result.data)
    return
  }

  if (result.status === POPUP_REQUEST_STATUSES.EMPTY) {
    popupController.update(POPUP_STATES.EMPTY)
    return
  }

  if (result.status === POPUP_REQUEST_STATUSES.ERROR) {
    reportPopupError(type === 'translation' ? 'translation' : 'dictionary lookup', result.error)
    popupController.update(POPUP_STATES.ERROR)
  }
}

function openPopup(event, key = null, type = 'search') {
  const text = getSelectionText(window.getSelection?.())
  if (!text) {
    return
  }

  const isTranslation = type === 'translate'
  const popupType = isTranslation ? 'translation' : 'dictionary'
  const query = isTranslation ? text : getDictionaryQuery(text)
  if (!query) {
    return
  }

  const controller = getPopupController()
  const coordinator = getPopupRequestCoordinator()
  const dataClient = getPopupDataClient()
  controller.open({
    popupType,
    popupAnchor: getPopupAnchor(event),
    onPopupClose: reason => coordinator.cancel(`Popup closed: ${reason}`)
  })

  const request = isTranslation
    ? ({signal}) => dataClient.translate(query, key, {signal})
    : ({signal}) => dataClient.lookupDictionary(query, {signal})

  coordinator.run(request).then(result => {
    renderRequestResult(popupType, result)
  })
}

function removePopup() {
  popupRequestCoordinator?.cancel('Popup removed')
  popupController?.close('programmatic', {notify: false})
}

function applyOptions(items) {
  const configurationRevision = ++interactionConfigurationRevision
  const nextItems = items || {}
  const nextProviderId = nextItems.translationProviderId || 'deepl-free'
  const nextNeedsChromeRuntime = nextProviderId === CHROME_TRANSLATOR_PROVIDER_ID &&
    Boolean(nextItems.translate)

  if (activeTranslationProviderId === CHROME_TRANSLATOR_PROVIDER_ID &&
      !nextNeedsChromeRuntime) {
    chromeTranslatorRuntime?.destroy()
    chromeTranslatorRuntime = null
  }
  activeTranslationProviderId = nextProviderId

  activeInteractionController?.destroy()
  activeInteractionController = null
  removePopup()

  popupColor = nextItems.popup_bgcolor || DEFAULT_OPTIONS.POPUP_BG_COLOR
  popupFontColor = nextItems.popup_fontcolor || DEFAULT_OPTIONS.POPUP_FONT_COLOR
  popupFontsize = nextItems.popup_fontsize || DEFAULT_OPTIONS.POPUP_FONT_SIZE
  popupController?.setOptions({
    backgroundColor: popupColor,
    fontColor: popupFontColor,
    fontSizePt: popupFontsize
  })

  if (!nextItems.dclick && !nextItems.drag && !nextItems.translate) {
    return
  }

  const host = window.location.hostname || window.location.host
  if (isDeniedSite(host, nextItems.safe_urls, nextItems.use_deny_list)) {
    return
  }

  const translationRequest = {
    provider: nextItems.translationProvider || getProviderPreset('deepl-free'),
    credential: nextItems.translationCredential || '',
    targetLanguage: nextItems.translationTargetLanguage || 'ko'
  }

  const bindInteractionController = () => {
    if (configurationRevision !== interactionConfigurationRevision) {
      return
    }

    // This content script is injected into every frame (manifest all_frames).
    // Binding to this frame's document keeps selection and events local to the
    // browsing context; events do not bubble across iframe boundaries.
    activeInteractionController = createInteractionController({
      ...nextItems,
      translationRequest
    }, {
      target: document,
      openPopup,
      removePopup,
      checkTrigger
    })
  }

  if (nextNeedsChromeRuntime) {
    // Warm the availability state without gating dictionary interaction on it.
    // Translator availability can wait on browser/network state; delaying the
    // document handlers would make double-click dictionary lookup appear dead.
    // Model downloads still only start from the explicit settings click path.
    try {
      const availability = prepareChromeTranslatorRuntime().refreshAvailability?.()
      availability?.catch?.(() => {})
    } catch (_error) {
      // An unavailable Translator API must not disable dictionary lookup.
    }
  }

  bindInteractionController()
}

export function unregisterEventListener() {
  interactionConfigurationRevision += 1
  storageLifecycle?.stop()
  storageLifecycle = null
  activeInteractionController?.destroy()
  activeInteractionController = null
  popupRequestCoordinator?.cancel('Content script unregistered')
  popupController?.close('unregister', {notify: false})
  chromeTranslatorRuntime?.destroy()
  chromeTranslatorRuntime = null
  activeTranslationProviderId = ''
}

export function registerEventListener() {
  if (storageLifecycle) {
    return
  }

  const storage = typeof chrome === 'undefined' ? null : chrome.storage
  storageLifecycle = createContentSettingsLifecycle({
    storage,
    onApply: applyOptions
  })
  storageLifecycle.start()
}

export function main() {
  registerEventListener()
}
