const marginX = 10
const marginY = 20
const popupWidth = 360
let noAudios = 0
let audio = null
let popupColor = '#FFFFDD'
let popupFontsize = '11'
let popupFontColor = 'black'


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

function showFrame(e, datain, top, left) {
  let div = document.createElement('div')
  div.innerHTML = datain
  div.setAttribute('id', 'popupFrame')
  div.className = 'popupFrame'
  div.style.cssText = "position:fixed;top:" + top + "px;left:" + left + "px;width:" + popupWidth +"px;height:auto;line-height:normal;display:block;z-index:99997;background-color:" + popupColor + ";padding:5px;font-size: " + popupFontsize + "pt;color:" + popupFontColor + ";box-shadow:0 0 3px 3px #888;"

  document.body.appendChild(div)

  const height = document.getElementById('popupFrame').clientHeight

  if (height + e.clientY > window.innerHeight) {
    const newtop = top - height - 2 * marginY
    document.getElementById('popupFrame').style.top = newtop
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

async function searchWord(e, word, top, left) {
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

function openPopup(e, naver_client_id, naver_client_secret, type='search') {
  let top = e.clientY + document.querySelector('html').scrollTop + marginY
  let left = e.clientX - 180 + document.querySelector('html').scrollLeft
  let clientY = e.clientY

  if (e.clientX - 180 < marginX) {
    left = marginX + document.querySelector('html').scrollLeft
  }
  else if (left + popupWidth > window.width) {
    left = window.width - popupWidth - marginX
  }

  let selection = window.getSelection()

  if (selection.rangeCount > 0) {
      let text = selection.getRangeAt(0).cloneContents().textContent.trim()
      let english = /^[A-Za-z]*$/
      if (english.test(text[0]) && text.split(/\s+/).length < 4) {
        searchWord(e, text.toLowerCase(), top, left)
      }
      else if (type == 'translate') {
        translateWord(e, text, top, left, naver_client_id, naver_client_secret)
      }
  }
}

function registerEventListener() {
  chrome.storage.sync.get({
    dclick: true,
    dclick_trigger_key: 'none',
    drag: true,
    drag_trigger_key: 'ctrl',
    translate: false,
    translate_trigger_key: 'ctrlalt',
    naver_client_id: '',
    naver_client_secret: '',
    popup_bgcolor: '#FFFFDD',
    popup_color: 'black',
    popup_fontsize: '11'
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
    if (items.popup_color) {
      popupFontColor = items.popup_color
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
        clicks++

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
