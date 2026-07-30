#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEFAULT_PORT, createEditorServer, listenOnFreePort, parseArgs } from './server.js'

const here = path.dirname(fileURLToPath(import.meta.url))

const HELP = `waica — the waica editor, one command away

Usage: waica [options]

Options:
  --port <n>   preferred port (default ${DEFAULT_PORT}; the next free one is used if taken)
  --no-open    do not open the browser
  --version    print the version
  --help       show this help`

async function version(): Promise<string> {
  const raw = await readFile(path.join(here, '..', 'package.json'), 'utf8')
  return (JSON.parse(raw) as { version: string }).version
}

function openBrowser(url: string): void {
  const [command, args]: [string, string[]] =
    process.platform === 'darwin'
      ? ['open', [url]]
      : process.platform === 'win32'
        ? ['cmd', ['/c', 'start', '', url]]
        : ['xdg-open', [url]]
  const child = spawn(command, args, { stdio: 'ignore', detached: true })
  child.on('error', () => {})
  child.unref()
}

async function main(): Promise<void> {
  let args
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (error) {
    console.error(`waica: ${(error as Error).message}`)
    process.exit(1)
  }

  if (args.help) {
    console.log(HELP)
    return
  }
  if (args.version) {
    console.log(await version())
    return
  }

  const editorRoot = path.join(here, 'editor')
  if (!existsSync(path.join(editorRoot, 'index.html'))) {
    console.error('waica: bundled editor is missing — this install looks broken, try reinstalling')
    process.exit(1)
  }

  const server = createEditorServer(editorRoot)
  const port = await listenOnFreePort(server, args.port, '127.0.0.1')
  const url = `http://localhost:${port}`

  console.log()
  console.log(`  waica editor v${await version()}`)
  console.log(`  ➜ ${url}`)
  console.log()
  if (args.open) openBrowser(url)
}

void main()
