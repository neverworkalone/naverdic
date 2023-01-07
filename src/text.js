import en from '/src/_locales/en/messages.json'
import ko from '/src/_locales/ko/messages.json'


export function getText(textId) {
  return chrome.i18n.getMessage(textId)
}
