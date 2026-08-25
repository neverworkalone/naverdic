import {
  calculatePopupPosition,
  createPopupAnchor,
  getDocumentViewport
} from './content-position.mjs'
import {POPUP_STATES} from './popup-state.mjs'
import {findAudioEntryIndex} from './dictionary/result-model.mjs'

export {POPUP_STATES} from './popup-state.mjs'

const DEFAULT_POPUP_OPTIONS = Object.freeze({
  width: 360,
  backgroundColor: '#F5F6F8',
  fontColor: '#000000',
  fontSizePt: 11,
  margin: 10,
  gap: 12
})

const TRANSLATION_POPUP_WIDTH = 440

const DEFAULT_TEXT = Object.freeze({
  INLINE_POPUP_DICTIONARY_TITLE: 'Dictionary',
  INLINE_POPUP_TRANSLATION_TITLE: 'Translation',
  INLINE_POPUP_LOADING: 'Loading…',
  INLINE_POPUP_NO_RESULT: 'No result found.',
  INLINE_POPUP_NETWORK_ERROR: 'The result could not be loaded. Please try again.'
})

const FALLBACK_CSS = `
:host { all: initial; }
.naverdic-popup {
  position: absolute;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  height: auto;
  line-height: normal;
  padding: 9px;
  border: 1px solid #999;
  overflow: hidden;
  overflow-wrap: anywhere;
  pointer-events: auto;
}
.naverdic-popup__body {
  box-sizing: border-box;
  min-width: 0;
  min-height: 0;
  max-height: calc(var(--naverdic-popup-max-height, 480px) - 42px);
  overflow: auto;
  overscroll-behavior: contain;
}
.naverdic-popup[data-type="translation"] .naverdic-popup__body {
  line-height: 1.45;
}
`

function defaultText(messageId) {
  const getMessage = globalThis.chrome?.i18n?.getMessage
  if (typeof getMessage === 'function') {
    const localized = getMessage.call(globalThis.chrome.i18n, messageId)
    if (localized) {
      return localized
    }
  }

  return DEFAULT_TEXT[messageId] || messageId
}

async function loadDefaultStylesheet() {
  const getURL = globalThis.chrome?.runtime?.getURL
  if (typeof getURL !== 'function' || typeof fetch !== 'function') {
    return FALLBACK_CSS
  }

  try {
    const response = await fetch(getURL('content.css'), {method: 'GET'})
    if (!response.ok) {
      return FALLBACK_CSS
    }
    return response.text()
  } catch (_error) {
    return FALLBACK_CSS
  }
}

function appendTextWithLineBreaks(documentLike, element, value) {
  const lines = String(value ?? '').split(/(?:\r\n|\r|\n)/g)
  lines.forEach((line, index) => {
    if (index > 0) {
      element.appendChild(documentLike.createElement('br'))
    }
    element.appendChild(documentLike.createTextNode(line))
  })
}

function createTextElement(documentLike, tagName, className, value) {
  const element = documentLike.createElement(tagName)
  if (className) {
    element.className = className
  }
  if (value !== undefined) {
    appendTextWithLineBreaks(documentLike, element, value)
  }
  return element
}

function renderDictionary(documentLike, container, entries, onAudioFailure) {
  const audioEntryIndex = findAudioEntryIndex(entries)

  entries.forEach((entry, entryIndex) => {
    const title = createTextElement(documentLike, 'div', 'naverdic-wordTitle')
    const wordLink = documentLike.createElement('a')
    wordLink.href = entry.dictionaryUrl || '#'
    wordLink.target = '_blank'
    wordLink.rel = 'noopener noreferrer'
    appendTextWithLineBreaks(documentLike, wordLink, entry.word)
    title.appendChild(wordLink)

    if (entry.partOfSpeech) {
      appendTextWithLineBreaks(documentLike, title, ` [${entry.partOfSpeech}]`)
    }

    if (entryIndex === audioEntryIndex) {
      if (entry.phoneticSymbol) {
        appendTextWithLineBreaks(
          documentLike,
          title,
          ` [${entry.phoneticSymbol}]`
        )
      }

      const audioWrapper = documentLike.createElement('span')
      audioWrapper.className = 'naverdic-audio-wrapper'
      const audio = documentLike.createElement('audio')
      audio.className = 'naverdic-audio'
      audio.controls = true
      audio.preload = 'none'
      audio.playsInline = true
      audio.src = entry.audioUrl
      audio.setAttribute('controlslist', 'nodownload')
      audio.setAttribute('aria-label', `${entry.word} audio`)
      audio.addEventListener('error', () => {
        if (audio.dataset.failed === 'true') {
          return
        }

        audio.dataset.failed = 'true'
        audioWrapper.remove?.()
        onAudioFailure?.()
      })
      audioWrapper.appendChild(audio)
      title.appendChild(audioWrapper)
    }

    container.appendChild(title)

    const meanings = Array.isArray(entry.meanings) ? entry.meanings : []
    meanings.forEach((meaning, meaningIndex) => {
      const className = meaningIndex === meanings.length - 1
        ? 'naverdic-wordMeans-last'
        : 'naverdic-wordMeans'
      container.appendChild(createTextElement(
        documentLike,
        'div',
        className,
        `${meaning.order}. ${meaning.value}`
      ))
    })
  })
}

function renderTranslation(documentLike, container, text) {
  appendTextWithLineBreaks(documentLike, container, text)
}

function renderStatus(documentLike, container, className, text, role = 'status') {
  const status = createTextElement(documentLike, 'p', className, text)
  status.setAttribute('role', role)
  container.appendChild(status)
}

function createPopupView({
  document: documentLike = globalThis.document,
  loadStylesheet = loadDefaultStylesheet,
  getText = defaultText,
  options = {}
} = {}) {
  const popupOptions = {...DEFAULT_POPUP_OPTIONS, ...options}
  let popupType = 'dictionary'
  let host = null
  let shadowRoot = null
  let popup = null
  let body = null
  let style = null
  let stylesPromise = null
  let layoutChangeHandler = null

  function getPopupWidth(type = popupType) {
    if (type === 'translation') {
      return TRANSLATION_POPUP_WIDTH
    }

    return Number(popupOptions.width) || DEFAULT_POPUP_OPTIONS.width
  }

  function ensureMounted() {
    if (host) {
      return host
    }

    documentLike.getElementById?.('popupFrame')?.remove?.()
    host = documentLike.createElement('div')
    host.id = 'popupFrame'
    host.dataset.naverdicPopup = 'true'
    host.style.cssText = [
      'all: initial',
      'position: fixed',
      'top: 0',
      'left: 0',
      'width: 0',
      'height: 0',
      'overflow: visible',
      'z-index: 2147483647',
      'pointer-events: none'
    ].join(';')

    shadowRoot = host.attachShadow({mode: 'open'})
    style = documentLike.createElement('style')
    style.textContent = FALLBACK_CSS
    shadowRoot.appendChild(style)

    popup = documentLike.createElement('div')
    popup.id = 'popupShadow'
    popup.className = 'popupFrame naverdic-popup'
    popup.setAttribute('role', 'dialog')
    popup.setAttribute('aria-live', 'polite')
    popup.setAttribute('aria-label', getText('INLINE_POPUP_DICTIONARY_TITLE'))

    body = documentLike.createElement('div')
    body.className = 'naverdic-popup__body'
    popup.appendChild(body)
    shadowRoot.appendChild(popup)

    popup.style.width = `${getPopupWidth()}px`
    popup.style.backgroundColor = popupOptions.backgroundColor
    popup.style.color = popupOptions.fontColor
    popup.style.fontSize = `${popupOptions.fontSizePt}pt`

    const mountTarget = documentLike.documentElement || documentLike.body
    mountTarget?.appendChild(host)

    stylesPromise = Promise.resolve()
      .then(() => loadStylesheet())
      .then(css => {
        if (style && host) {
          style.textContent = css || FALLBACK_CSS
          layoutChangeHandler?.()
        }
      })
      .catch(() => {
        if (style && host) {
          style.textContent = FALLBACK_CSS
          layoutChangeHandler?.()
        }
      })

    return host
  }

  function update({type = 'dictionary', state = POPUP_STATES.LOADING, data} = {}) {
    popupType = type
    ensureMounted()
    popup.style.width = `${getPopupWidth()}px`
    const titleText = type === 'translation'
      ? getText('INLINE_POPUP_TRANSLATION_TITLE')
      : getText('INLINE_POPUP_DICTIONARY_TITLE')
    popup.dataset.type = type
    popup.dataset.state = state
    popup.setAttribute('aria-label', titleText)
    popup.setAttribute('aria-busy', state === POPUP_STATES.LOADING ? 'true' : 'false')
    body.replaceChildren()

    if (state === POPUP_STATES.LOADING) {
      renderStatus(
        documentLike,
        body,
        'naverdic-popup__status naverdic-popup__status--loading',
        getText('INLINE_POPUP_LOADING')
      )
    } else if (state === POPUP_STATES.EMPTY) {
      renderStatus(
        documentLike,
        body,
        'naverdic-popup__status naverdic-popup__status--empty',
        getText('INLINE_POPUP_NO_RESULT')
      )
    } else if (state === POPUP_STATES.ERROR) {
      renderStatus(
        documentLike,
        body,
        'naverdic-popup__status naverdic-popup__status--error',
        getText('INLINE_POPUP_NETWORK_ERROR'),
        'alert'
      )
    } else if (type === 'dictionary') {
      renderDictionary(
        documentLike,
        body,
        Array.isArray(data) ? data : [],
        () => layoutChangeHandler?.()
      )
    } else {
      renderTranslation(documentLike, body, data)
    }

    return popup
  }

  function measure() {
    ensureMounted()
    const popupWidth = getPopupWidth()
    popup.style.width = `${popupWidth}px`
    popup.style.maxHeight = 'none'
    popup.style.setProperty('--naverdic-popup-max-height', '100000px')
    const rect = popup.getBoundingClientRect?.() || {}
    const width = Number(rect.width) > 0
      ? Number(rect.width)
      : popupWidth
    const height = Number(rect.height) > 0
      ? Number(rect.height)
      : Number(popup.scrollHeight || body.scrollHeight || 0)

    return {
      width,
      height: height > 0 ? height : 80
    }
  }

  function setPosition(position) {
    if (!popup) {
      return
    }

    popup.style.left = `${position.left}px`
    popup.style.top = `${position.top}px`
    popup.style.width = `${position.width}px`
    popup.style.maxHeight = `${position.maxHeight}px`
    popup.style.setProperty('--naverdic-popup-max-height', `${position.maxHeight}px`)
    popup.style.backgroundColor = popupOptions.backgroundColor
    popup.style.color = popupOptions.fontColor
    popup.style.fontSize = `${popupOptions.fontSizePt}pt`
  }

  function setVisibility(value) {
    if (popup) {
      popup.style.visibility = value
    }
  }

  function setOptions(nextOptions = {}) {
    Object.assign(popupOptions, nextOptions)
    if (popup) {
      popup.style.width = `${getPopupWidth()}px`
      popup.style.backgroundColor = popupOptions.backgroundColor
      popup.style.color = popupOptions.fontColor
      popup.style.fontSize = `${popupOptions.fontSizePt}pt`
    }
  }

  function destroy() {
    stylesPromise = null
    host?.remove?.()
    host = null
    shadowRoot = null
    popup = null
    body = null
    style = null
    popupType = 'dictionary'
  }

  return {
    mount: ensureMounted,
    update,
    measure,
    whenReady: () => stylesPromise || Promise.resolve(),
    setPosition,
    setVisibility,
    setOptions,
    destroy,
    getHost: () => host,
    getPopup: () => popup,
    setLayoutChangeHandler: handler => {
      layoutChangeHandler = handler
    }
  }
}

export function createPopupController({
  document: documentLike = globalThis.document,
  window: windowLike = documentLike?.defaultView || globalThis.window,
  getText = defaultText,
  loadStylesheet,
  options = {},
  view
} = {}) {
  const popupView = view || createPopupView({
    document: documentLike,
    getText,
    loadStylesheet,
    options
  })
  const popupOptions = {...DEFAULT_POPUP_OPTIONS, ...options}
  let open = false
  let destroyed = false
  let anchor = null
  let type = 'dictionary'
  let frameId = null
  let listenersBound = false
  let onClose = null
  let visibilityRevision = 0

  function scheduleReposition() {
    if (!open || destroyed) {
      return
    }

    if (frameId !== null) {
      return
    }

    const requestFrame = windowLike?.requestAnimationFrame
    if (typeof requestFrame === 'function') {
      frameId = requestFrame(() => {
        frameId = null
        reposition()
      })
      return
    }

    reposition()
  }

  function reposition() {
    if (!open || destroyed) {
      return
    }

    const rect = anchor?.getRect?.() || anchor?.rect || anchor?.fallback
    if (!rect) {
      return
    }

    const position = calculatePopupPosition({
      anchorRect: rect,
      popupSize: popupView.measure(),
      viewport: getDocumentViewport(windowLike),
      margin: popupOptions.margin,
      gap: popupOptions.gap
    })
    const viewport = position.viewport
    popupView.setPosition({
      ...position,
      // The calculator works in document coordinates. The fixed host is
      // anchored to the current visual viewport, so convert only the final
      // coordinates before applying them to the shadow popup.
      left: position.left - viewport.left,
      top: position.top - viewport.top
    })
  }

  function revealWhenReady() {
    const revision = ++visibilityRevision
    Promise.resolve(popupView.whenReady?.())
      .catch(() => {})
      .then(() => {
        if (!open || destroyed || revision !== visibilityRevision) {
          return
        }

        popupView.setVisibility('visible')
        scheduleReposition()
      })
  }

  function eventIsInside(event) {
    const host = popupView.getHost()
    if (!host) {
      return false
    }

    const path = event?.composedPath?.() || []
    return path.includes(host) || host === event?.target || host.contains?.(event?.target)
  }

  function handleOutsidePointer(event) {
    if (!eventIsInside(event)) {
      close('outside')
    }
  }

  function handleKeydown(event) {
    if (event?.key === 'Escape' || event?.key === 'Esc') {
      event.preventDefault?.()
      close('escape')
    }
  }

  function stopPopupEvent(event) {
    event.stopPropagation()
  }

  function bindListeners() {
    if (listenersBound) {
      return
    }

    const host = popupView.getHost()
    host?.addEventListener('pointerdown', stopPopupEvent)
    host?.addEventListener('mousedown', stopPopupEvent)
    host?.addEventListener('mousemove', stopPopupEvent)
    host?.addEventListener('mouseup', stopPopupEvent)
    host?.addEventListener('click', stopPopupEvent)
    documentLike.addEventListener?.('pointerdown', handleOutsidePointer, true)
    documentLike.addEventListener?.('keydown', handleKeydown, true)
    documentLike.addEventListener?.('scroll', scheduleReposition, true)
    windowLike?.addEventListener?.('resize', scheduleReposition)
    windowLike?.addEventListener?.('scroll', scheduleReposition)
    windowLike?.visualViewport?.addEventListener?.('resize', scheduleReposition)
    windowLike?.visualViewport?.addEventListener?.('scroll', scheduleReposition)
    listenersBound = true
  }

  function unbindListeners() {
    if (!listenersBound) {
      return
    }

    const host = popupView.getHost()
    host?.removeEventListener('pointerdown', stopPopupEvent)
    host?.removeEventListener('mousedown', stopPopupEvent)
    host?.removeEventListener('mousemove', stopPopupEvent)
    host?.removeEventListener('mouseup', stopPopupEvent)
    host?.removeEventListener('click', stopPopupEvent)
    documentLike.removeEventListener?.('pointerdown', handleOutsidePointer, true)
    documentLike.removeEventListener?.('keydown', handleKeydown, true)
    documentLike.removeEventListener?.('scroll', scheduleReposition, true)
    windowLike?.removeEventListener?.('resize', scheduleReposition)
    windowLike?.removeEventListener?.('scroll', scheduleReposition)
    windowLike?.visualViewport?.removeEventListener?.('resize', scheduleReposition)
    windowLike?.visualViewport?.removeEventListener?.('scroll', scheduleReposition)
    listenersBound = false
  }

  function openPopup({
    popupType = 'dictionary',
    popupAnchor,
    onPopupClose
  } = {}) {
    if (destroyed) {
      return
    }

    type = popupType
    anchor = popupAnchor
    onClose = onPopupClose || null
    open = true
    popupView.mount()
    popupView.update({type, state: POPUP_STATES.LOADING})
    popupView.setVisibility('hidden')
    visibilityRevision += 1
    bindListeners()
    reposition()
  }

  function update(state, data) {
    if (!open || destroyed) {
      return
    }

    popupView.update({type, state, data})
    popupView.setVisibility('hidden')
    visibilityRevision += 1
    reposition()
    if (state !== POPUP_STATES.LOADING) {
      revealWhenReady()
    }
  }

  function close(reason = 'programmatic', {notify = true} = {}) {
    if (!open && !popupView.getHost()) {
      return
    }

    open = false
    visibilityRevision += 1
    if (frameId !== null) {
      const cancelFrame = windowLike?.cancelAnimationFrame
      if (typeof cancelFrame === 'function') {
        cancelFrame(frameId)
      }
      frameId = null
    }
    unbindListeners()
    popupView.destroy()
    const closeHandler = onClose
    onClose = null
    if (notify) {
      closeHandler?.(reason)
    }
  }

  function setOptions(nextOptions = {}) {
    Object.assign(popupOptions, nextOptions)
    popupView.setOptions(nextOptions)
    if (open) {
      scheduleReposition()
    }
  }

  function destroy() {
    if (destroyed) {
      return
    }

    destroyed = true
    close('destroyed')
  }

  popupView.setLayoutChangeHandler(scheduleReposition)

  return {
    open: openPopup,
    update,
    close,
    destroy,
    setOptions,
    isOpen: () => open,
    getHost: popupView.getHost,
    getPopup: popupView.getPopup,
    getAnchor: () => anchor,
    createAnchor: createPopupAnchor
  }
}

export {createPopupView}
