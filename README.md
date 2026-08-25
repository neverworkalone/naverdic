# Naver English Dictionary (NaverDic 7.0)

A Chrome extension for looking up English words with Naver Dictionary and translating sentences with Chrome's built-in Translator, DeepL, or Gemini.

## Features

- Search for a word by entering it directly
- Look up an English word by double-clicking it on a webpage
- Select a word or phrase to search for its meaning
- Translate selected sentences and paragraphs with Chrome's built-in Translator, DeepL, or Gemini
- Customize dictionary and translation triggers, popup appearance, and blocked sites
- Manage translation credentials locally and back up settings from the Advanced page

## Install

Install the extension from the [Chrome Web Store](https://chrome.google.com/webstore/detail/네이버-사전-naver-dictionary/imnbhbjodhdinfaifjbpgkpknejadfjk).

## Help

See the [Help page](https://neverworkalone.github.io/naverdic/) for setup instructions and usage details.

## Tech Stack

- Vue 3
- Vite
- Chrome Extension Manifest V3

## Development

### Build the extension

```bash
yarn build
```

### Create a release package

```bash
yarn package
```

The package command builds and validates `naverdic_7.0.zip`.

### Run the webpage development server

```bash
yarn dev
```
