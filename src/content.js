import { buildNaverApiUrl, parseNaverDictionaryResponse } from './dictionary/parser.mjs'

export const DEFAULT_OPTIONS = {
  DCLICK: true,
  DCLICK_TRIGGER: 'none',
  DCLICK_SPEED: 400,
  DRAG: true,
  DRAG_TRIGGER: 'ctrl',
  TRANSLATE: false,
  TRANSLATE_TRIGGER: 'ctrlalt',
  DEEPL_AUTH_KEY: '',
  POPUP_BG_COLOR: '#FFF59D',
  POPUP_FONT_COLOR: '#000000',
  POPUP_FONT_SIZE: '11',
  USE_DENY_LIST: false,
  SAFE_URLS: null
}

const marginLeft = 10
const marginRight = 30
const marginY = 20
const popupWidth = 360
let popupColor = DEFAULT_OPTIONS.POPUP_BG_COLOR
let popupFontColor = DEFAULT_OPTIONS.POPUP_FONT_COLOR
let popupFontsize = DEFAULT_OPTIONS.POPUP_FONT_SIZE
let dClickSpeed = DEFAULT_OPTIONS.DCLICK_SPEED


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


function checkTrigger(e, key) {
  let ctrlKey = e.ctrlKey

  if (navigator.userAgentData) {
    if (navigator.userAgentData.platform.includes('mac')) {
      ctrlKey = e.metaKey
    }
  }

  switch (key) {
    case 'ctrl':
      if (!ctrlKey || e.altKey)
        return false
      break
    case 'alt':
      if (ctrlKey || !e.altKey)
        return false
      break
    case 'ctrlalt':
      if (!ctrlKey || !e.altKey)
        return false
      break
    case 'none':
    default:
      if (ctrlKey || e.altKey)
        return false
      break
  }

  return true
}

async function consultDic(e, word, top, left) {
  const url = buildNaverApiUrl(word)

  chrome.runtime.sendMessage({
    method: 'GET',
    action: 'endic',
    url: url,
  }, function(data) {
    if (!data) {
      return
    }

    showFrame(e, parseNaverDictionaryResponse(data), top, left)
  })
}

async function translate(e, text, top, left, key) {
  const url = 'https://api-free.deepl.com/v2/translate'

  chrome.runtime.sendMessage({
    method: 'POST',
    action: 'translation',
    url: url,
    key: key,
    data: {
      text: [text],
      target_lang: 'ko'
    },
  }, function(data) {
    if (!data) {
      return
    }
    showFrame(e, data['translations'][0]['text'], top, left, 'translation');
  })
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

  let selection = window.getSelection()

  if (selection.rangeCount > 0) {
      let text = selection.toString()
      if (!text) {
        return
      }

      if (type == 'translate') {
        translate(e, text, top, left, key)
      }
      else {
        let english = /^[A-Za-z]*$/
        if (english.test(text[0]) && text.split(/\s+/).length < 6) {
          consultDic(e, text.toLowerCase(), top, left)
        }
      }
  }
}

function registerEventListener() {
  chrome.storage.sync.get({
    dclick: DEFAULT_OPTIONS.DCLICK,
    dclick_trigger_key: DEFAULT_OPTIONS.DCLICK_TRIGGER,
    dclick_speed: DEFAULT_OPTIONS.DCLICK_SPEED,
    drag: DEFAULT_OPTIONS.DRAG,
    drag_trigger_key: DEFAULT_OPTIONS.DRAG_TRIGGER,
    translate: DEFAULT_OPTIONS.TRANSLATE,
    translate_trigger_key: DEFAULT_OPTIONS.TRANSLATE_TRIGGER,
    deepl_auth_key: DEFAULT_OPTIONS.DEEPL_AUTH_KEY,
    popup_bgcolor: DEFAULT_OPTIONS.POPUP_BG_COLOR,
    popup_fontcolor: DEFAULT_OPTIONS.POPUP_FONT_COLOR,
    popup_fontsize: DEFAULT_OPTIONS.POPUP_FONT_SIZE,
    use_deny_list: DEFAULT_OPTIONS.USE_DENY_LIST,
    safe_urls: DEFAULT_OPTIONS.SAFE_URLS
  }, function(items) {
    if (!items.dclick && !items.drag && !items.translate) {
      return
    }

    if (items.use_deny_list) {
      if (items.safe_urls) {
        const host = window.location.host;
        const urls = items.safe_urls.split(',')
        if (urls && urls[0].length > 3 && urls.some(v=>host.includes(v))) {
          return
        }
      }
    }

    let mousedown = false
    let mousemove = false
    let clicks = 0
    let timeout
    let prevX
    const scrollXOffset = 8

    if (items.popup_bgcolor) {
      popupColor = items.popup_bgcolor
    }
    if (items.popup_fontcolor) {
      popupFontColor = items.popup_fontcolor
    }
    if (items.popup_fontsize) {
      popupFontsize = items.popup_fontsize
    }
    if (items.dclick_speed) {
      dClickSpeed = items.dclick_speed
    }

    document.body.onmousedown = function(e) {
      mousedown = true
      prevX = e.pageX
    }

    document.body.onmousemove = function(e) {
      if (!mousedown)
        return
      if (Math.abs(e.pageX - prevX) > scrollXOffset)
        mousemove = true
    }

    document.body.onmouseup = function(e) {
      if (mousemove && items.drag && checkTrigger(e, items.drag_trigger_key)) {
        mousedown = mousemove = false
        if (document.getElementById('popupFrame')) {
          document.getElementById('popupFrame').remove()
        }
        openPopup(e)
      }
      else if (mousemove && items.translate && checkTrigger(e, items.translate_trigger_key)) {
        mousedown = mousemove = false
        if (document.getElementById('popupFrame')) {
          document.getElementById('popupFrame').remove()
        }
        openPopup(e, items.deepl_auth_key, 'translate')
      }
      else if (!mousemove && items.dclick && checkTrigger(e, items.dclick_trigger_key)) {
        mousedown = false
        ++clicks

        if (clicks == 1) {
          if (document.getElementById('popupFrame')) {
            document.getElementById('popupFrame').remove()
          }
          timeout = setTimeout(function () {
            clicks = 0
          }, dClickSpeed)
        } else {
          if (document.getElementById('popupFrame')) {
            document.getElementById('popupFrame').remove()
          }
          clearTimeout(timeout)
          openPopup(e)
          clicks = 0
        }
      }
      else {
        mousedown = mousemove = false
        if (document.getElementById('popupFrame')) {
          document.getElementById('popupFrame').remove()
        }
      }
    }
  })
}


export function main() {
  registerEventListener()
}
