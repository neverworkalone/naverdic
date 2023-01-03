import en from './locales/en.json'
import ko from './locales/ko.json'

const fallbackLanguage = ko

export function getText(textId) {
  const currentLanguage = navigator.language

  if (/^ko\b/.test(currentLanguage)) {
    return ko[textId]
  }
  else if (/^en\b/.test(currentLanguage)) {
    return en[textId]
  }
  else {
    return fallbackLanguage[textId]
  }
}
