export const DEFAULT_OPTIONS = {
  DCLICK: true,
  DCLICK_TRIGGER: 'none',
  DRAG: true,
  DRAG_TRIGGER: 'ctrl',
  TRANSLATE: false,
  TRANSLATE_TRIGGER: 'ctrlalt',
  PAPAGO_CLIENT_ID: '',
  PAPAGO_CLIENT_SECRET: '',
  POPUP_BG_COLOR: '#FFF59D',
  POPUP_FONT_COLOR: '#000000',
  POPUP_FONT_SIZE: '11'
}

const marginLeft = 10
const marginRight = 30
const marginY = 20
const popupWidth = 360
let noAudios = 0
let audio = null
let popupColor = DEFAULT_OPTIONS.POPUP_BG_COLOR
let popupFontColor = DEFAULT_OPTIONS.POPUP_FONT_COLOR
let popupFontsize = DEFAULT_OPTIONS.POPUP_FONT_SIZE


export function parseEndic(data) {
  let html = ''
  const dicHead = data.indexOf('<dl class="dic_search_result">')
  const dicTail = data.indexOf('</dl>')
  let dic = data.substring(dicHead, dicTail + 6)

  while (dic) {
    const dtPos = dic.indexOf('<dt')
    if (dtPos < 0) {
      break
    }

    const dt = dic.substring(dtPos, dic.indexOf('</dt>') + 5)
    const wordPos = dt.indexOf('<strong>')
    if (wordPos < 0) {
      dic = dic.substring(dic.indexOf('</dd>') + 5)
      continue
    }
    const word = dt.substring(wordPos + 8, dt.indexOf('</strong>'))

    const linkPos = dt.indexOf('<a href=')
    let linkUrl = null
    if (linkPos > -1) {
      linkUrl = dt.substring(linkPos + 9, dt.indexOf('onclick') - 2)
    }

    if (linkUrl) {
      html += '<div class="naverdic-wordTitle"><a href="' + linkUrl + ' " target="_blank">' + word + '</a>'
    }
    else {
      html += '<div class="naverdic-wordTitle"><a href="#" target="_blank">' + word + '</a>'
    }

    const phoneticPos = dt.indexOf('<span class="fnt_e25">')
    if (phoneticPos > -1) {
      const phoneticHead = dt.substring(phoneticPos)
      const phonetic = phoneticHead.substring(22, phoneticHead.indexOf('</span>'))

      html += phonetic
    }

    if (noAudios == 0) {
      const audioPos = dt.indexOf('<a playlist="')
      if (audioPos > -1) {
        audio = dt.substring(audioPos + 13, dt.indexOf('class="play"'))
        const audioId = 'proaudio' + ++noAudios
        const playAudio = '<span><audio class=naverdic-audio controls src="' + audio + '" id="' + audioId + '" controlslist="nodownload nooption"></audio></span>'

        html += playAudio
      }
      html += '</div>'
    }

    const ddPos = dic.indexOf('<dd>')
    if (ddPos > -1) {
      const dd = dic.substring(ddPos, dic.indexOf('</dd>') + 5).replace('<dd', '<dd class="naverdic-means"')

      html += dd
    }
    dic = dic.substring(dic.indexOf('</dd>') + 5)
  }

  audio = null
  noAudios = 0

  return html
}

export function parseEndicAPI(data) {
  if (!data || !data.searchResultMap) {
    return
  }

  let html = ''
  let items = data.searchResultMap.searchResultListMap.WORD.items

  if (items.length > 0) {
    for (let i = 0; i < items.length; i++) {
      const word = items[i].handleEntry
      const means = items[i].meansCollector[0].means
      const phonetic = items[i].searchPhoneticSymbolList[0]
      const partOfSpeech = items[i].meansCollector[0].partOfSpeech

      if (audio == null && items[i].searchPhoneticSymbolList.length > 0) {
        audio = items[i].searchPhoneticSymbolList[0].symbolFile
      }

      const linkURL = "https://dict.naver.com/search.dict?dicQuery=" + word
      html += '<div class="naverdic-wordTitle"><a href="' + linkURL + ' " target="_blank">' + word + '</a>'

      if (partOfSpeech) {
        html += ' [' + partOfSpeech + ']'
      }

      if (audio && noAudios == 0) {
        if (phonetic && phonetic.symbolValue) {
          html += '<span>[' + phonetic.symbolValue + ']</span>'
        }

        const audioID = 'proaudio' + ++noAudios;
        const playAudio = '<span><audio class=naverdic-audio controls src="' + audio + '" id="' + audioID + '" controlslist="nodownload nooption"></audio></span>'
        html += playAudio
      }
      html += '</div>'

      for (let j = 0; j < means.length; j++) {
        let itemStyle = "margin-bottom:2px;"
        if (j == means.length - 1) {
          itemStyle = "margin-bottom:5px;"
        }
        html += '<div style=' + itemStyle + '>' + means[j].order + '. ' + means[j].value + '</div>'
      }
    }

    audio == null
    noAudios = 0
  }
  return html
}

function showFrame(e, datain, top, left) {
  if (!datain) {
    return
  }

  let div = document.createElement('div')
  div.innerHTML = datain
  div.setAttribute('id', 'popupFrame')
  div.className = 'popupFrame'
  div.style.cssText = "position:absolute;top:" + top + "px;left:" + left + "px;width:" + popupWidth +"px;height:auto;line-height:normal;display:block;z-index:99997;background-color:" + popupColor + ";padding:5px;font-size: " + popupFontsize + "pt;color:" + popupFontColor + ";box-shadow:0 0 3px 3px #888;"

  document.body.appendChild(div)

  const height = document.getElementById('popupFrame').clientHeight
  if ((e.clientY > height) && (e.clientY + height > window.innerHeight)) {
    const newtop = top - height - 2 * marginY
    document.getElementById('popupFrame').style.top = newtop + "px"
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

  if (window.navigator.platform.includes('Mac')) {
    ctrlKey = e.metaKey
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
  const url = 'https://dict.naver.com/search.dict?dicQuery=' + word

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

async function endicAPI(e, word, top, left) {
  const url = 'https://en.dict.naver.com/api3/enko/search?m=mobile&lang=ko&query=' + word

  chrome.runtime.sendMessage({
    method: 'GET',
    action: 'endicAPI',
    url: url,
    }, function(data) {
      if (!data) {
        return
      }

      showFrame(e, parseEndicAPI(data), top, left)
  })
}

async function translate(e, text, top, left, id, secret) {
  const url = 'http://www.gencode.me/api/papago/'

  chrome.runtime.sendMessage({
    method: 'POST',
    action: 'papago',
    data: {
      source: 'en',
      target: 'ko',
      client_id: id,
      client_secret: secret,
      text: text
    },
    url: url,
    }, function(data) {
      showFrame(e, data, top, left);
  })
}

function openPopup(e, id, secret, type='search') {
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
      let text = selection.getRangeAt(0).cloneContents().textContent.trim()
      if (!text) {
        return
      }

      let english = /^[A-Za-z]*$/
      if (english.test(text[0]) && text.split(/\s+/).length < 4) {
        endicAPI(e, text.toLowerCase(), top, left)
      }
      else if (type == 'translate') {
        translate(e, text, top, left, id, secret)
      }
  }
}

function registerEventListener(defaultOptions) {
  chrome.storage.sync.get({
    dclick: DEFAULT_OPTIONS.DCLICK,
    dclick_trigger_key: DEFAULT_OPTIONS.DCLICK_TRIGGER,
    drag: DEFAULT_OPTIONS.DRAG,
    drag_trigger_key: DEFAULT_OPTIONS.DRAG_TRIGGER,
    translate: DEFAULT_OPTIONS.TRANSLATE,
    translate_trigger_key: DEFAULT_OPTIONS.TRANSLATE_TRIGGER,
    naver_client_id: DEFAULT_OPTIONS.PAPAGO_CLIENT_ID,
    naver_client_secret: DEFAULT_OPTIONS.PAPAGO_CLIENT_SECRET,
    popup_bgcolor: DEFAULT_OPTIONS.POPUP_BG_COLOR,
    popup_fontcolor: DEFAULT_OPTIONS.POPUP_FONT_COLOR,
    popup_fontsize: DEFAULT_OPTIONS.POPUP_FONT_SIZE
  }, function(items) {
    if (!items.dclick && !items.drag && !items.translate) {
      return
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
        openPopup(e, items.naver_client_id, items.naver_client_secret)
      }
      else if (mousemove && items.translate && checkTrigger(e, items.translate_trigger_key)) {
        mousedown = mousemove = false
        if (document.getElementById('popupFrame')) {
          document.getElementById('popupFrame').remove()
        }
        openPopup(e, items.naver_client_id, items.naver_client_secret, 'translate')
      }
      else if (!mousemove && items.dclick && checkTrigger(e, items.dclick_trigger_key)) {
        mousedown = false
        ++clicks

        if (clicks == 1) {
          timeout = setTimeout(function () {
            if (document.getElementById('popupFrame')) {
              document.getElementById('popupFrame').remove()
            }
            clicks = 0
          }, 400)
        } else {
          if (document.getElementById('popupFrame')) {
            document.getElementById('popupFrame').remove()
          }
          clearTimeout(timeout)
          openPopup(e, items.naver_client_id, items.naver_client_secret)
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
