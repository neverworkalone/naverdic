import {readdirSync, readFileSync, statSync} from 'node:fs'
import path from 'node:path'
import {execFileSync} from 'node:child_process'
import {fileURLToPath} from 'node:url'
import {compileScript, parse} from '@vue/compiler-sfc'

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

function filesUnder(directory) {
  const result = []
  for (const entry of readdirSync(directory)) {
    const filePath = path.join(directory, entry)
    if (statSync(filePath).isDirectory()) {
      result.push(...filesUnder(filePath))
    } else {
      result.push(filePath)
    }
  }
  return result
}

const sourceFiles = [
  ...filesUnder(path.join(projectRoot, 'src')),
  ...filesUnder(path.join(projectRoot, 'tests'))
]

for (const filePath of sourceFiles.filter(filePath => /\.(m?js)$/.test(filePath))) {
  execFileSync(process.execPath, ['--check', filePath], {stdio: 'inherit'})
}

for (const filePath of sourceFiles.filter(filePath => filePath.endsWith('.vue'))) {
  const source = readFileSync(filePath, 'utf8')
  const parsed = parse(source, {filename: filePath})
  if (parsed.errors.length) {
    throw new Error(`${filePath}: Vue SFC parse failed`)
  }
  if (parsed.descriptor.scriptSetup) {
    compileScript(parsed.descriptor, {id: path.basename(filePath), inlineTemplate: true})
  }
}

for (const filePath of filesUnder(path.join(projectRoot, 'src/_locales')).filter(filePath => filePath.endsWith('.json'))) {
  JSON.parse(readFileSync(filePath, 'utf8'))
}

console.log(`Checked ${sourceFiles.length} source, test, component, and locale files.`)
