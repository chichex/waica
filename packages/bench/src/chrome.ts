import { execFileSync } from 'node:child_process'
import { accessSync, realpathSync } from 'node:fs'
import { CHROME_CANDIDATES } from './chrome-candidates.ts'

const candidates: readonly string[] =
  process.platform === 'darwin' ? CHROME_CANDIDATES.darwin : CHROME_CANDIDATES.linux

export interface ChromeInstall {
  executablePath: string
  version: string
}

export function discoverChrome(): ChromeInstall {
  for (const candidate of candidates) {
    try {
      accessSync(candidate)
      const executablePath = realpathSync(candidate)
      const version = execFileSync(executablePath, ['--version'], { encoding: 'utf8' }).trim()
      return { executablePath, version }
    } catch {
      // Try the next candidate; none at all is a failure below, never a skip.
    }
  }
  throw new Error(`bench: no Chrome/Chromium found. Checked: ${candidates.join(', ')}`)
}
