// Writes the Electron version `waica export desktop` packages with into
// dist/export-desktop/electron-version.json. The pin lives in this package's
// devDependencies (exact, so Dependabot bumps it), but the release drops
// devDependencies from the published manifest, so the build carries it.
// Runs after tsc in this package's build script.
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const target = path.join(here, 'dist', 'export-desktop')

function fail(message) {
  console.error(`waica: ${message}`)
  process.exit(1)
}

const manifest = JSON.parse(readFileSync(path.join(here, 'package.json'), 'utf8'))
const electron = manifest.devDependencies?.electron
if (typeof electron !== 'string' || !/^\d+\.\d+\.\d+$/.test(electron)) {
  fail(`devDependencies.electron must be an exact version, found ${JSON.stringify(electron)}`)
}
if (!existsSync(path.join(target, 'shell', 'main.js'))) fail('the desktop shell was not compiled — run tsc first')
writeFileSync(path.join(target, 'electron-version.json'), `${JSON.stringify({ devDependencies: { electron } }, null, 2)}\n`)
console.log(`waica: desktop export pinned to Electron ${electron}`)
