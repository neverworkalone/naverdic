import { buildNaverApiUrl, parseNaverDictionaryResponse } from './dictionary/parser.mjs'
import {
  checkTrigger,
  createInteractionController,
  getDictionaryQuery,
  getSelectionText,
  isDeniedSite
} from './content-interaction.mjs'
import { createStorageLifecycle } from './content-storage.mjs'
import {
  MESSAGE_ERROR_CODES,
  createDictionaryRequest,
  createTranslationRequest,
  reportMessageFailure,
  sendRuntimeMessage
} from './messaging.mjs'
import {
  DEFAULT_OPTIONS,
  normalizeSettings,
  STORAGE_DEFAULTS
} from './settings.mjs'

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

async function translate(e, text, top, left, key) {
  const url = 'https://api-free.deepl.com/v2/translate'

  const response = await sendRuntimeMessage(
    chrome.runtime,
    createTranslationRequest({
      method: 'POST',
      url,
      key,
      data: {
        text: [text],
        target_lang: 'ko'
      }
    })
  )

  if (!response.ok) {
    reportMessageFailure('translation', response)
    return
  }

  const translatedText = response.data?.translations?.[0]?.text
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
  const nextItems = normalizeSettings(items)

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

  // This content script is injected into every frame (manifest all_frames).
  // Binding to this frame's document keeps selection and events local to the
  // browsing context; events do not bubble across iframe boundaries.
  activeInteractionController = createInteractionController(nextItems, {
    target: document,
    openPopup,
    removePopup,
    checkTrigger
  })
}

export function unregisterEventListener() {
  storageLifecycle?.stop()
  storageLifecycle = null
  activeInteractionController?.destroy()
  activeInteractionController = null
  removePopup()
}

export function registerEventListener() {
  if (storageLifecycle) {
    return
  }

  const storage = typeof chrome === 'undefined' ? null : chrome.storage
  storageLifecycle = createStorageLifecycle({
    storage,
    onApply: applyOptions
  })
  storageLifecycle.start()
}

export function main() {
  registerEventListener()
}
