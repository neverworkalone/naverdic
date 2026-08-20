import en from '/src/_locales/en/messages.json'
import ko from '/src/_locales/ko/messages.json'

function fallbackText(textId, placeholder) {
  const locale = globalThis.navigator?.language?.toLowerCase().startsWith('ko')
    ? ko
    : en
  const entry = locale[textId]
  if (!entry?.message) {
    return ''
  }

  let message = entry.message
  Object.entries(entry.placeholders || {}).forEach(([name, definition]) => {
    const match = /\$(\d+)\$/.exec(definition.content || '')
    const index = match ? Number(match[1]) - 1 : -1
    const value = Array.isArray(placeholder)
      ? placeholder[index]
      : placeholder?.[name]
    message = message.replaceAll(`$${name}$`, String(value ?? ''))
  })
  return message
}

export function getText(textId, placeholder = null) {
  const chromeMessage = globalThis.chrome?.i18n?.getMessage
  if (chromeMessage) {
    const message = chromeMessage.call(globalThis.chrome.i18n, textId, placeholder)
    if (message) {
      return message
    }
  }

  return fallbackText(textId, placeholder)
}
