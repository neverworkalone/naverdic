import { buildNaverApiUrl, parseNaverDictionaryResponse } from './dictionary/parser.mjs'
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
import {createChromeTranslatorRuntime} from './chrome-translator.mjs'
import {
  MESSAGE_ERROR_CODES,
  createDictionaryRequest,
  createTranslationRequest,
  reportMessageFailure,
  sendRuntimeMessage
} from './messaging.mjs'
import {
  DEFAULT_OPTIONS,
  STORAGE_DEFAULTS
} from './settings.mjs'
import {
  executeProviderTranslation,
  getPathValue
} from './translation-engine.mjs'
import {
  CHROME_TRANSLATOR_PROVIDER_ID,
  getProviderPreset,
  PROVIDER_KINDS
} from './translation-provider.mjs'

export { DEFAULT_OPTIONS, STORAGE_DEFAULTS }

const marginLeft = 10
const marginRight = 30
const marginY = 20
const popupWidth = 360
let popupColor = DEFAULT_OPTIONS.POPUP_BG_COLOR
let popupFontColor = DEFAULT_OPTIONS.POPUP_FONT_COLOR
let popupFontsize = DEFAULT_OPTIONS.POPUP_FONT_SIZE

let activeInteractionController = null
let storageLifecycle = null
let chromeTranslatorRuntime = null
let activeTranslationProviderId = ''
let interactionConfigurationRevision = 0
void createStorageLifecycle


function appendTextWithLineBreaks(element, value) {
  const lines = String(value).split(/(?:\r\n|\r|\n)/g)
  lines.forEach((line, index) => {
    if (index > 0) {
      element.appendChild(document.createElement('br'))
    }
    element.appendChild(document.createTextNode(line))
  })
}

function renderDictionary(container, entries) {
  let audioShown = false

  entries.forEach(entry => {
    const title = document.createElement('div')
    title.className = 'naverdic-wordTitle'

    const wordLink = document.createElement('a')
    wordLink.href = entry.dictionaryUrl
    wordLink.target = '_blank'
    wordLink.rel = 'noopener noreferrer'
    appendTextWithLineBreaks(wordLink, entry.word)
    title.appendChild(wordLink)

    if (entry.partOfSpeech) {
      appendTextWithLineBreaks(title, ` [${entry.partOfSpeech}]`)
    }

    if (!audioShown && entry.audioUrl) {
      audioShown = true

      if (entry.phoneticSymbol) {
        const phonetic = document.createElement('span')
        appendTextWithLineBreaks(phonetic, ` [${entry.phoneticSymbol}]`)
        title.appendChild(phonetic)
      }

      const audioWrapper = document.createElement('span')
      const audio = document.createElement('audio')
      audio.className = 'naverdic-audio'
      audio.controls = true
      audio.src = entry.audioUrl
      audio.id = 'proaudio1'
      audio.setAttribute('controlslist', 'nodownload nooption')
      audioWrapper.appendChild(audio)
      title.appendChild(audioWrapper)
    }

    container.appendChild(title)

    entry.meanings.forEach((meaning, meaningIndex) => {
      const meaningElement = document.createElement('div')
      meaningElement.className = meaningIndex === entry.meanings.length - 1
        ? 'naverdic-wordMeans-last'
        : 'naverdic-wordMeans'
      appendTextWithLineBreaks(meaningElement, `${meaning.order}. ${meaning.value}`)
      container.appendChild(meaningElement)
    })
  })
}

function renderTranslation(container, text) {
  appendTextWithLineBreaks(container, text)
}

function showFrame(e, datain, top, left, type = 'dictionary') {
  if (!datain || (Array.isArray(datain) && datain.length === 0)) {
    return
  }

  let shadowRoot = document.createElement('div')
  shadowRoot.setAttribute('id', 'popupFrame')

  let shadow = shadowRoot.attachShadow({mode: 'open'});
  fetch(chrome.runtime.getURL("content.css"), {
    method: 'GET'
  })
  .then(resp => resp.text())
  .then(css => {
    const style = document.createElement('style')
    style.textContent = css
    shadow.appendChild(style)
  })

  let div = document.createElement('div')
  div.setAttribute('id', 'popupShadow')
  div.className = 'popupFrame'
  div.style.cssText = "top:" + top + "px;left:" + left + "px;width:" + popupWidth +"px;background-color:" + popupColor + ";font-size: " + popupFontsize + "pt;color:" + popupFontColor + ";"

  if (type === 'dictionary') {
    renderDictionary(div, datain)
  } else {
    renderTranslation(div, datain)
  }

  shadow.appendChild(div)
  document.body.appendChild(shadowRoot)

  const height = div.clientHeight
  if ((e.clientY > height) && (e.clientY + height > window.innerHeight)) {
    const newtop = top - height - 2.5 * marginY
    shadow.getElementById('popupShadow').style.top = newtop + "px"
  }

  document.getElementById('popupFrame').onmousedown = function(e) {
    e.stopPropagation()
  }
  document.getElementById('popupFrame').onmousemove = function(e) {
    e.stopPropagation()
  }
  document.getElementById('popupFrame').onmouseup = function(e) {
    e.stopPropagation()
  }
}


async function consultDic(e, word, top, left) {
  const url = buildNaverApiUrl(word)

  const response = await sendRuntimeMessage(
    chrome.runtime,
    createDictionaryRequest({method: 'GET', url})
  )

  if (!response.ok) {
    reportMessageFailure('dictionary lookup', response)
    return
  }

  showFrame(e, parseNaverDictionaryResponse(response.data), top, left)
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

function translationErrorResponse(error) {
  return {
    ok: false,
    error: {
      code: error?.code || MESSAGE_ERROR_CODES.RUNTIME_ERROR,
      message: error?.message || 'The translation request failed.'
    }
  }
}

function translationConfigFromValue(value) {
  if (value && typeof value === 'object' && value.provider) {
    return {
      provider: value.provider,
      credential: typeof value.credential === 'string' ? value.credential : '',
      targetLanguage: typeof value.targetLanguage === 'string'
        ? value.targetLanguage
        : 'ko'
    }
  }

  return {
    provider: getProviderPreset('deepl-free'),
    credential: typeof value === 'string' ? value : '',
    targetLanguage: 'ko'
  }
}

async function translate(e, text, top, left, value) {
  const config = translationConfigFromValue(value)
  const provider = config.provider || getProviderPreset('deepl-free')
  let response

  if (provider.kind === PROVIDER_KINDS.BUILT_IN &&
      provider.id === CHROME_TRANSLATOR_PROVIDER_ID) {
    try {
      const result = await executeProviderTranslation(provider, {
        text: [text],
        targetLanguage: 'ko',
        translatorRuntime: getChromeTranslatorRuntime()
      })
      response = {ok: true, data: result}
    } catch (error) {
      response = translationErrorResponse(error)
    }
  } else {
    response = await sendRuntimeMessage(
      chrome.runtime,
      createTranslationRequest({
        provider,
        key: config.credential,
        data: {
          text: [text],
          targetLanguage: config.targetLanguage
        }
      })
    )
  }

  if (!response.ok) {
    reportMessageFailure('translation', response)
    return
  }

  let translatedText
  if (provider.kind === PROVIDER_KINDS.BUILT_IN) {
    translatedText = response.data?.text
  } else {
    translatedText = getPathValue(response.data, provider.response?.textPath)
  }
  if (typeof translatedText !== 'string') {
    reportMessageFailure('translation', {
      ok: false,
      error: {
        code: MESSAGE_ERROR_CODES.INVALID_RESPONSE,
        message: 'The translation response did not include translated text.'
      }
    })
    return
  }

  showFrame(e, translatedText, top, left, 'translation')
}

function openPopup(e, key=null, type='search') {
  let top = e.clientY + window.scrollY + marginY
  let left = e.clientX - 120 + window.scrollX

  if (e.clientX - 120 < marginLeft) {
    left = marginLeft + window.scrollX
  }
  else if (left + popupWidth + marginRight >= window.innerWidth) {
    left = window.innerWidth - popupWidth - marginLeft - marginRight
  }

  const text = getSelectionText(window.getSelection())
  if (!text) {
    return
  }

  if (type === 'translate') {
    translate(e, text, top, left, key)
  }
  else {
    const word = getDictionaryQuery(text)
    if (word) {
      consultDic(e, word, top, left)
    }
  }
}

function removePopup() {
  document.getElementById('popupFrame')?.remove()
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

  popupColor = nextItems.popup_bgcolor
  popupFontColor = nextItems.popup_fontcolor
  popupFontsize = nextItems.popup_fontsize

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
    // Finish the availability check before installing the mouseup handler.
    // Once the handler runs, a ready model lets runtime.translate() reach
    // Translator.create() before its first await, preserving the page's
    // transient user activation. Model downloads still only start from the
    // explicit settings click path.
    prepareChromeTranslatorRuntime().refreshAvailability?.()
      .catch(() => {})
      .finally(bindInteractionController)
    return
  }

  bindInteractionController()
}

export function unregisterEventListener() {
  interactionConfigurationRevision += 1
  storageLifecycle?.stop()
  storageLifecycle = null
  activeInteractionController?.destroy()
  activeInteractionController = null
  chromeTranslatorRuntime?.destroy()
  chromeTranslatorRuntime = null
  activeTranslationProviderId = ''
  removePopup()
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
