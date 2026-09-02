import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import {fileURLToPath} from 'node:url'

import {
  PACKAGE_ASSETS,
  collectManifestFiles,
  collectSourceDependencies,
  RELEASE_MANIFEST_VERSION,
  RELEASE_PACKAGE_VERSION
} from '../scripts/validate-package.mjs'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packageJson = JSON.parse(
  fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8')
)
const packScript = fs.readFileSync(path.join(projectRoot, 'pack.sh'), 'utf8')
const manifest = JSON.parse(
  fs.readFileSync(path.join(projectRoot, 'public/manifest.json'), 'utf8')
)

test('release packaging opts into minification while direct pack.sh stays raw by default', () => {
  assert.equal(packageJson.scripts.package, 'bash pack.sh --minify')
  assert.match(packScript, /MINIFY=false/)
  assert.match(packScript, /--minify\)/)
  assert.match(packScript, /if \[\[ "\$MINIFY" == true \]\]; then/)
})

test('package validator covers manifest entry points and web resources', () => {
  const files = collectManifestFiles(manifest)

  assert.equal(manifest.version, RELEASE_MANIFEST_VERSION)
  assert.equal(packageJson.version, RELEASE_PACKAGE_VERSION)
  assert.equal(manifest.options_ui?.open_in_tab, true)

  assert.equal(
    (manifest.content_scripts || []).some(script => Array.isArray(script.css)),
    false,
    'popup CSS should stay inside its Shadow DOM'
  )

  for (const file of [
    'manifest.json',
    'contentWrapper.js',
    'background.js',
    'popup.html',
    'options.html',
    'content.css',
    'content-data.mjs',
    'content-position.mjs',
    'content-popup.mjs',
    'content-request.mjs',
    'messaging.mjs',
    'dictionary/parser.mjs',
    'dictionary/normalizer.mjs',
    'icon16.png',
    'icon32.png',
    'icon48.png',
    'icon128.png',
    'rule_endic.json',
    'popup-state.mjs',
    'dictionary/result-model.mjs'
  ]) {
    assert.equal(files.has(file), true, `${file} should be manifest-required`)
  }

  assert.deepEqual(PACKAGE_ASSETS, ['audio-play.svg'])
})

test('package validator follows raw background and content imports', () => {
  const dependencies = collectSourceDependencies(projectRoot)

  for (const file of [
    'background-handler.mjs',
    'content.js',
    'content-interaction.mjs',
    'messaging.mjs',
    'settings.mjs',
    'translation-provider.mjs',
    'dictionary/parser.mjs',
    'dictionary/normalizer.mjs',
    'dictionary/result-model.mjs',
    'popup-state.mjs'
  ]) {
    assert.equal(dependencies.has(file), true, `${file} should be an imported package dependency`)
  }
})
