import {execFileSync} from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const SOURCE_ENTRYPOINTS = [
  'src/background.js',
  'src/content.js'
]

export const RELEASE_MANIFEST_VERSION = '7.1'
export const RELEASE_PACKAGE_VERSION = '7.1.0'
export const PACKAGE_ASSETS = Object.freeze([
  'audio-play.svg'
])

const FORBIDDEN_PACKAGE_PATHS = [
  /^(src|tests|node_modules|\.git)(\/|$)/,
  /(^|\/)(package\.json|yarn\.lock|vite\.config\.js|pack\.sh|pack\.py)$/,
  /(^|\/)\.DS_Store$/,
  /\.map$/,
  /^index\.html$/,
  /^favicon\.ico$/,
  /^(logo|icon)\.png$/,
  /^assets\/index-[^/]+$/
]

function normalizeEntry(value) {
  return String(value)
    .replaceAll('\\', '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '')
}

function addManifestPath(paths, value) {
  if (typeof value === 'string' && value && !value.includes('*')) {
    paths.add(normalizeEntry(value))
  }
}

export function collectManifestFiles(manifest) {
  const files = new Set(['manifest.json'])

  Object.values(manifest.icons || {}).forEach(value => addManifestPath(files, value))
  addManifestPath(files, manifest.options_ui?.page)
  addManifestPath(files, manifest.action?.default_popup)
  addManifestPath(files, manifest.background?.service_worker)

  for (const contentScript of manifest.content_scripts || []) {
    for (const file of contentScript.js || []) {
      addManifestPath(files, file)
    }
    for (const file of contentScript.css || []) {
      addManifestPath(files, file)
    }
  }

  for (const ruleResource of manifest.declarative_net_request?.rule_resources || []) {
    addManifestPath(files, ruleResource.path)
  }

  for (const resourceGroup of manifest.web_accessible_resources || []) {
    for (const file of resourceGroup.resources || []) {
      addManifestPath(files, file)
    }
  }

  return files
}

function localImportSpecs(source) {
  const specs = new Set()
  const patterns = [
    /\bfrom\s*["'](\.[^"']+)["']/g,
    /\bimport\s*\(\s*["'](\.[^"']+)["']\s*\)/g,
    /\bimport\s*["'](\.[^"']+)["']/g
  ]

  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      specs.add(match[1])
    }
  }

  return specs
}

function sourceToPackagePath(projectRoot, sourcePath) {
  const sourceRoot = path.join(projectRoot, 'src')
  const relativeSource = normalizeEntry(path.relative(sourceRoot, sourcePath))
  return relativeSource.startsWith('dictionary/')
    ? relativeSource
    : relativeSource
}

/**
 * Follow the raw background/content imports that Vite copies for unpacked
 * extension loading. The pack step may bundle these files, but keeping their
 * static counterparts makes the Vite and ZIP outputs compatible.
 */
export function collectSourceDependencies(projectRoot) {
  const queue = SOURCE_ENTRYPOINTS.map(entry => path.join(projectRoot, entry))
  const visited = new Set()
  const dependencies = new Set()
  const sourceRoot = path.join(projectRoot, 'src')

  while (queue.length > 0) {
    const sourcePath = path.resolve(queue.shift())
    if (visited.has(sourcePath) || !sourcePath.startsWith(`${sourceRoot}${path.sep}`)) {
      continue
    }
    visited.add(sourcePath)

    if (!fs.existsSync(sourcePath)) {
      continue
    }

    dependencies.add(sourceToPackagePath(projectRoot, sourcePath))
    const source = fs.readFileSync(sourcePath, 'utf8')
    for (const spec of localImportSpecs(source)) {
      const importedPath = path.resolve(path.dirname(sourcePath), spec)
      if (fs.existsSync(importedPath)) {
        queue.push(importedPath)
      }
    }
  }

  return dependencies
}

function listFiles(root, current = root) {
  const files = []
  for (const entry of fs.readdirSync(current, {withFileTypes: true})) {
    const absolutePath = path.join(current, entry.name)
    if (entry.isDirectory()) {
      files.push(...listFiles(root, absolutePath))
    } else if (entry.isFile()) {
      files.push(normalizeEntry(path.relative(root, absolutePath)))
    }
  }
  return files
}

function missingAndExtra(expected, actual) {
  const expectedSet = new Set(expected)
  const actualSet = new Set(actual)
  return {
    missing: [...expectedSet].filter(file => !actualSet.has(file)).sort(),
    extra: [...actualSet].filter(file => !expectedSet.has(file)).sort()
  }
}

function packageForbiddenFiles(files) {
  return files.filter(file => FORBIDDEN_PACKAGE_PATHS.some(pattern => pattern.test(file))).sort()
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'))
}

export function validatePackageDirectory({projectRoot, packageDir}) {
  const errors = []
  const manifestPath = path.join(packageDir, 'manifest.json')
  const actualFiles = fs.existsSync(packageDir) ? listFiles(packageDir) : []

  if (!fs.existsSync(manifestPath)) {
    return {
      errors: [`Missing ${path.relative(packageDir, manifestPath)}.`],
      actualFiles,
      expectedFiles: []
    }
  }

  let manifest
  try {
    manifest = readJson(manifestPath)
  } catch (error) {
    return {
      errors: [`Manifest is not valid JSON: ${error.message}`],
      actualFiles,
      expectedFiles: []
    }
  }

  const expectedFiles = new Set([
    ...collectManifestFiles(manifest),
    ...collectSourceDependencies(projectRoot),
    ...PACKAGE_ASSETS
  ])
  const differences = missingAndExtra(expectedFiles, actualFiles)

  if (differences.missing.length > 0) {
    errors.push(`Manifest/import files missing from package: ${differences.missing.join(', ')}`)
  }

  const forbidden = packageForbiddenFiles(actualFiles)
  if (forbidden.length > 0) {
    errors.push(`Development files found in package: ${forbidden.join(', ')}`)
  }

  const packageJsonPath = path.join(projectRoot, 'package.json')
  if (fs.existsSync(packageJsonPath)) {
    const packageVersion = String(readJson(packageJsonPath).version || '')
    const manifestVersion = String(manifest.version || '')
    if (!manifestVersion || !packageVersion.startsWith(`${manifestVersion}.`)) {
      errors.push(`Version mismatch: manifest ${manifestVersion || '(missing)'} vs package ${packageVersion || '(missing)'}.`)
    }
    if (manifestVersion !== RELEASE_MANIFEST_VERSION || packageVersion !== RELEASE_PACKAGE_VERSION) {
      errors.push(`Release version mismatch: expected manifest ${RELEASE_MANIFEST_VERSION} and package ${RELEASE_PACKAGE_VERSION}; received manifest ${manifestVersion || '(missing)'} and package ${packageVersion || '(missing)'}.`)
    }
  }

  return {
    errors,
    actualFiles,
    expectedFiles: [...expectedFiles].sort(),
    manifest
  }
}

function listZipFiles(zipPath) {
  execFileSync('unzip', ['-t', zipPath], {stdio: 'ignore'})
  const output = execFileSync('unzip', ['-Z1', zipPath], {encoding: 'utf8'})
  return output
    .split(/\r?\n/)
    .map(normalizeEntry)
    .filter(file => file && !file.endsWith('/'))
}

export function validatePackageZip({projectRoot, zipPath, packageFiles, manifestVersion}) {
  const errors = []
  let zipFiles

  try {
    zipFiles = listZipFiles(zipPath)
  } catch (error) {
    return {errors: [`ZIP could not be read or tested: ${error.message}`], zipFiles: []}
  }

  const differences = missingAndExtra(packageFiles, zipFiles)
  if (differences.missing.length > 0 || differences.extra.length > 0) {
    if (differences.missing.length > 0) {
      errors.push(`ZIP is missing files from the unpacked build: ${differences.missing.join(', ')}`)
    }
    if (differences.extra.length > 0) {
      errors.push(`ZIP has files not present in the unpacked build: ${differences.extra.join(', ')}`)
    }
  }

  const forbidden = packageForbiddenFiles(zipFiles)
  if (forbidden.length > 0) {
    errors.push(`Development files found in ZIP: ${forbidden.join(', ')}`)
  }

  const expectedName = `${path.basename(projectRoot)}_${manifestVersion}.zip`
  if (path.basename(zipPath) !== expectedName) {
    errors.push(`ZIP name mismatch: expected ${expectedName}, received ${path.basename(zipPath)}.`)
  }

  return {errors, zipFiles}
}

export function validatePackage({projectRoot, packageDir, zipPath}) {
  const directoryResult = validatePackageDirectory({projectRoot, packageDir})
  const errors = [...directoryResult.errors]
  let zipResult = {errors: [], zipFiles: []}

  if (zipPath && directoryResult.errors.length === 0) {
    zipResult = validatePackageZip({
      projectRoot,
      zipPath,
      packageFiles: directoryResult.actualFiles,
      manifestVersion: directoryResult.manifest.version
    })
    errors.push(...zipResult.errors)
  }

  return {...directoryResult, ...zipResult, errors}
}

function optionValue(args, name, fallback) {
  const index = args.indexOf(name)
  return index === -1 ? fallback : args[index + 1]
}

function main() {
  const projectRoot = path.resolve(optionValue(process.argv.slice(2), '--project-root', process.cwd()))
  const packageDir = path.resolve(optionValue(process.argv.slice(2), '--dir', path.join(projectRoot, 'dist')))
  const zipOption = optionValue(process.argv.slice(2), '--zip', '')
  const result = validatePackage({
    projectRoot,
    packageDir,
    zipPath: zipOption ? path.resolve(zipOption) : null
  })

  if (result.errors.length > 0) {
    console.error(result.errors.map(error => `- ${error}`).join('\n'))
    process.exitCode = 1
    return
  }

  const zipSummary = zipOption ? ` and ZIP (${result.zipFiles.length} files)` : ''
  console.log(`Package validation passed: ${result.actualFiles.length} unpacked files${zipSummary}.`)
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  main()
}
