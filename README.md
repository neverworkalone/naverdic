# 네이버 영어사전 · NaverDic

A Chrome extension for quickly looking up English words with Naver Dictionary and translating selected text with Chrome's built-in Translator, DeepL, or Gemini.

## Features

- Search for English words by entering them directly
- Look up a word by double-clicking it on a webpage
- Select a word or phrase to search for its meaning
- Translate selected sentences and paragraphs with Chrome's built-in Translator, DeepL, or Gemini
- Customize double-click and selection triggers
- Customize popup colors and text size
- Disable NaverDic on selected websites
- Export, import, and reset settings

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

The package command builds, minifies, and validates `naverdic_<version>.zip`.
Run `./pack.sh` directly when a non-minified package is needed; pass
`./pack.sh --minify` to enable minification explicitly.

### Run the webpage development server

```bash
yarn dev
```
