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


export function parseEndic(data) {
  if (!data || !data.searchResultMap) {
    return
  }

  let html = ''
  let audio = null
  let noAudios = 0
  let items = data.searchResultMap.searchResultListMap.WORD.items

  if (items.length > 0) {
    for (let i = 0; i < items.length; i++) {
      const word = items[i].handleEntry

      if (audio == null) {
        for (let j = 0; j < items[i].searchPhoneticSymbolList.length; j++) {
          if (items[i].searchPhoneticSymbolList[0].symbolFile) {
            audio = items[i].searchPhoneticSymbolList[0].symbolFile
            break
          }
        }
      }

      const linkURL = "https://en.dict.naver.com/#/search?query=" + word
      html += '<div class="naverdic-wordTitle"><a href="' + linkURL + ' " target="_blank">' + word + '</a>'

      const partOfSpeech = items[i].meansCollector[0].partOfSpeech
      if (partOfSpeech) {
        html += ' [' + partOfSpeech + ']'
      }

      const phonetic = items[i].searchPhoneticSymbolList[0]
      if (audio && noAudios == 0) {
        if (phonetic && phonetic.symbolValue) {
          html += '<span>[' + phonetic.symbolValue + ']</span>'
        }

        const audioID = 'proaudio' + ++noAudios;
        const playAudio = '<span><audio class=naverdic-audio controls src="' + audio + '" id="' + audioID + '" controlslist="nodownload nooption"></audio></span>'
        html += playAudio
      }
      html += '</div>'

      const means = items[i].meansCollector[0].means
      for (let j = 0; j < means.length; j++) {
        let meansClass = 'naverdic-wordMeans'
        if (j == means.length - 1) {
          meansClass = 'naverdic-wordMeans-last'
        }

        html += '<div class=' + meansClass + '>' + means[j].order + '. ' + means[j].value + '</div>'
      }
    }
  }

  return html
}

function showFrame(e, datain, top, left) {
  if (!datain) {
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
    shadow.innerHTML += `<style>${css}</style>`
  })

  let div = document.createElement('div')
  div.innerHTML = datain.replace(/(?:\r\n|\r|\n)/g, '<br />')
  div.setAttribute('id', 'popupShadow')
  div.className = 'popupFrame'
  div.style.cssText = "top:" + top + "px;left:" + left + "px;width:" + popupWidth +"px;background-color:" + popupColor + ";font-size: " + popupFontsize + "pt;color:" + popupFontColor + ";"

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
  const url = 'https://en.dict.naver.com/api3/enko/search?m=mobile&lang=ko&query=' + word

  chrome.runtime.sendMessage({
    method: 'GET',
    action: 'endic',
    url: url,
  }, function(data) {
    if (!data) {
      return
    }

    showFrame(e, parseEndic(data), top, left)
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
    showFrame(e, data['translations'][0]['text'], top, left);
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
