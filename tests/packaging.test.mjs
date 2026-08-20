import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {fileURLToPath} from 'node:url'

import {
  collectManifestFiles,
  collectSourceDependencies
} from '../scripts/validate-package.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(
  fs.readFileSync(path.join(projectRoot, 'public/manifest.json'), 'utf8')
)

test('package validator covers manifest entry points and web resources', () => {
  const files = collectManifestFiles(manifest)

  for (const file of [
    'manifest.json',
    'contentWrapper.js',
    'background.js',
    'popup.html',
    'options.html',
    'content.css',
    'messaging.mjs',
    'dictionary/parser.mjs',
    'dictionary/normalizer.mjs',
    'icon16.png',
    'icon32.png',
    'icon48.png',
    'icon128.png',
    'rule_endic.json'
  ]) {
    assert.equal(files.has(file), true, `${file} should be manifest-required`)
  }
})

test('package validator follows raw background and content imports', () => {
  const dependencies = collectSourceDependencies(projectRoot)

  for (const file of [
    'background-handler.mjs',
    'content.js',
    'content-interaction.mjs',
    'content-storage.mjs',
    'messaging.mjs',
    'settings.mjs',
    'translation-provider.mjs',
    'dictionary/parser.mjs',
    'dictionary/normalizer.mjs'
  ]) {
    assert.equal(dependencies.has(file), true, `${file} should be an imported package dependency`)
  }
})
