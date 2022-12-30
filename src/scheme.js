import { mockEndic } from './mock.js'

let noAudios = 0
let audio = null

function parseEndic(data) {
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

export async function searchWord(event, word) {
  if (!chrome.runtime) {
    const data = await mockEndic()
    document.getElementById('content').innerHTML = parseEndic(data);
  }
  else {
    const url = 'https://dict.naver.com/search.dict?dicQuery=' + word

    chrome.runtime.sendMessage({
      method: 'GET',
      action: 'endic',
      url: url,
      }, function(data) {
      if (!data) {
        return
      }

      document.getElementById('content').innerHTML = parseEndic(data);
    })
  }
}
