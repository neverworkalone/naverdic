import assert from 'node:assert/strict'
import test from 'node:test'

import {resolveCssColor} from '../src/settings-colors.mjs'

test('uses the browser CSS parser instead of a permissive color regex', () => {
  const originalCss = globalThis.CSS
  const supported = new Set(['#123456', 'red'])
  globalThis.CSS = {
    supports(_property, value) {
      return supported.has(value)
    }
  }

  try {
    assert.equal(resolveCssColor('#123456', '#fallback'), '#123456')
    assert.equal(resolveCssColor('red', '#fallback'), 'red')
    assert.equal(resolveCssColor('garbage', '#fallback'), '#fallback')
    assert.equal(resolveCssColor('#12345', '#fallback'), '#fallback')
    assert.equal(resolveCssColor('rgb(foo)', '#fallback'), '#fallback')
  } finally {
    if (originalCss === undefined) {
      delete globalThis.CSS
    } else {
      globalThis.CSS = originalCss
    }
  }
})

test('returns the fallback when no browser color parser is available', () => {
  const originalCss = globalThis.CSS
  delete globalThis.CSS

  try {
    assert.equal(resolveCssColor('#123456', '#fallback'), '#fallback')
  } finally {
    if (originalCss !== undefined) {
      globalThis.CSS = originalCss
    }
  }
})
