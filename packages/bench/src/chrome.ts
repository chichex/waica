import { execFileSync } from 'node:child_process'
import { accessSync, realpathSync } from 'node:fs'

// The same fixed candidate list as scripts/runtime-e2e.mjs: playwright-core
// downloads no browser, so the host's Chrome is the one under test.
const CHROME_CANDIDATES =
  process.platform === 'darwin'
    ? [
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        '/Applications/Chromium.app/Contents/MacOS/Chromium',
      ]
    : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser']

export interface ChromeInstall {
  executablePath: string
  version: string
}

export function discoverChrome(): ChromeInstall {
  for (const candidate of CHROME_CANDIDATES) {
    try {
      accessSync(candidate)
      const executablePath = realpathSync(candidate)
      const version = execFileSync(executablePath, ['--version'], { encoding: 'utf8' }).trim()
      return { executablePath, version }
    } catch {
      // Try the next candidate; none at all is a failure below, never a skip.
    }
  }
  throw new Error(`bench: no Chrome/Chromium found. Checked: ${CHROME_CANDIDATES.join(', ')}`)
}
