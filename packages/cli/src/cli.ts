#!/usr/bin/env node
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import readline from 'node:readline/promises'
import { fileURLToPath } from 'node:url'
import {
  DEFAULT_PORT,
  type CliArgs,
  compareVersions,
  createEditorServer,
  fetchLatestVersion,
  listenOnFreePort,
  listenWithRetry,
  parseArgs,
  probeWaica,
} from './server.js'

const here = path.dirname(fileURLToPath(import.meta.url))
const HOST = '127.0.0.1'

const HELP = `waica — the waica editor, one command away

Usage: waica [options]

Options:
  --port <n>   preferred port (default ${DEFAULT_PORT}; the next free one is used if taken)
  --no-open    do not open the browser
  --version    print the version
  --help       show this help`

interface Pkg {
  name: string
  version: string
}

async function readPkg(): Promise<Pkg> {
  const raw = await readFile(path.join(here, '..', 'package.json'), 'utf8')
  return JSON.parse(raw) as Pkg
}

const interactive = process.stdin.isTTY === true && process.stdout.isTTY === true
// npx runs the binary out of its cache dir; `npm i -g` cannot update that.
const runByNpx = (process.argv[1] ?? '').includes(`${path.sep}_npx${path.sep}`)

async function confirm(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  try {
    return /^y(es)?$/i.test((await rl.question(question)).trim())
  } finally {
    rl.close()
  }
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

/**
 * Checks the registry for a newer version; in an interactive global install it
 * offers to update in place and re-executes itself. Silent when offline.
 */
async function maybeSelfUpdate(pkg: Pkg): Promise<void> {
  const url = `https://registry.npmjs.org/${pkg.name.replace('/', '%2f')}/latest`
  const latest = await fetchLatestVersion(url, 1500)
  if (latest === null || compareVersions(latest, pkg.version) <= 0) return

  console.log(`  update available: ${pkg.version} → ${latest}`)
  const canSelfUpdate = interactive && !runByNpx && process.env['WAICA_UPDATED'] !== '1'
  if (!canSelfUpdate) {
    console.log(`  run: ${runByNpx ? `npx ${pkg.name}@latest` : `npm install -g ${pkg.name}@latest`}`)
    return
  }
  if (!(await confirm('  update now? [y/N] '))) return

  const install = spawnSync('npm', ['install', '-g', `${pkg.name}@${latest}`], {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (install.status !== 0) {
    console.error('waica: update failed — continuing with the current version')
    return
  }
  console.log('  ✔ updated — restarting…')
  const child = spawn(process.execPath, [process.argv[1] ?? '', ...process.argv.slice(2)], {
    stdio: 'inherit',
    env: { ...process.env, WAICA_UPDATED: '1' },
  })
  process.exit(await new Promise<number>((resolve) => child.on('exit', (code) => resolve(code ?? 0))))
}

/**
 * Binds the preferred port. If another waica holds it, offers to stop that
 * instance and take its place; declining (or no TTY) reuses the running one.
 * A port held by anything else falls back to walking forward, as before.
 */
async function startServer(
  editorRoot: string,
  pkg: Pkg,
  args: CliArgs,
): Promise<{ port: number } | null> {
  const server = createEditorServer(editorRoot, pkg.version)
  try {
    await listenWithRetry(server, args.port, HOST, 1, 0)
    return { port: args.port }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw error
  }

  const running = await probeWaica(HOST, args.port, 1000)
  if (running === null) {
    const port = await listenOnFreePort(server, args.port + 1, HOST)
    return { port }
  }

  const url = `http://localhost:${args.port}`
  console.log(`  waica editor v${running.version} is already running at ${url} (pid ${running.pid})`)
  if (interactive && (await confirm('  stop it and take its place? [y/N] '))) {
    try {
      process.kill(running.pid)
    } catch {
      console.error(`waica: could not signal pid ${running.pid} — is it yours?`)
    }
    await listenWithRetry(server, args.port, HOST, 30, 100)
    return { port: args.port }
  }
  console.log('  using the already-running editor')
  if (args.open) openBrowser(url)
  return null
}

async function main(): Promise<void> {
  let args
  try {
    args = parseArgs(process.argv.slice(2))
  } catch (error) {
    console.error(`waica: ${(error as Error).message}`)
    process.exit(1)
  }

  const pkg = await readPkg()
  if (args.help) {
    console.log(HELP)
    return
  }
  if (args.version) {
    console.log(pkg.version)
    return
  }

  const editorRoot = path.join(here, 'editor')
  if (!existsSync(path.join(editorRoot, 'index.html'))) {
    console.error('waica: bundled editor is missing — this install looks broken, try reinstalling')
    process.exit(1)
  }

  console.log()
  await maybeSelfUpdate(pkg)

  const started = await startServer(editorRoot, pkg, args)
  if (started === null) return

  const url = `http://localhost:${started.port}`
  console.log(`  waica editor v${pkg.version}`)
  console.log(`  ➜ ${url}`)
  console.log()
  if (args.open) openBrowser(url)
}

void main()
