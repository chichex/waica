import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

export const DEFAULT_PORT = 5178

export interface CliArgs {
  port: number
  open: boolean
  help: boolean
  version: boolean
}

export function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { port: DEFAULT_PORT, open: true, help: false, version: false }
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i]
    switch (flag) {
      case '--port': {
        const port = Number(argv[++i])
        if (!Number.isInteger(port) || port < 1 || port > 65535) {
          throw new Error('--port expects a number between 1 and 65535')
        }
        args.port = port
        break
      }
      case '--no-open':
        args.open = false
        break
      case '--help':
        args.help = true
        break
      case '--version':
        args.version = true
        break
      default:
        throw new Error(`unknown option "${flag}" — try --help`)
    }
  }
  return args
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.map': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.wasm': 'application/wasm',
  '.txt': 'text/plain; charset=utf-8',
}

export function contentType(filePath: string): string {
  return MIME[path.extname(filePath).toLowerCase()] ?? 'application/octet-stream'
}

/**
 * Maps a request url to an absolute path under root, or null when the path
 * would escape it (traversal, including percent-encoded dots).
 */
export function resolveFile(root: string, url: string): string | null {
  const pathname = url.split(/[?#]/, 1)[0] ?? url
  let decoded: string
  try {
    decoded = decodeURIComponent(pathname)
  } catch {
    return null
  }
  const resolved = path.resolve(root, decoded.replace(/^\/+/, ''))
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null
  return resolved
}

/**
 * Health endpoint every waica server exposes, so a starting instance can tell
 * "that port is another waica" apart from "that port is some other app".
 */
export const HEALTH_PATH = '/__waica.json'

/**
 * Static server for the bundled editor: files by content type, index.html for
 * extension-less routes (the editor is a SPA).
 */
export function createEditorServer(root: string, version = '0.0.0'): Server {
  return createServer((req, res) => {
    void handle(root, version, req, res)
  })
}

async function handle(
  root: string,
  version: string,
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' }).end()
    return
  }
  if ((req.url ?? '').split(/[?#]/, 1)[0] === HEALTH_PATH) {
    const body = JSON.stringify({ name: 'waica', version, pid: process.pid })
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(req.method === 'HEAD' ? undefined : body)
    return
  }
  const target = resolveFile(root, req.url ?? '/')
  if (target === null) {
    res.writeHead(403).end()
    return
  }
  const file =
    target === root || path.extname(target) === '' ? path.join(root, 'index.html') : target
  try {
    const body = await readFile(file)
    res.writeHead(200, {
      'content-type': contentType(file),
      'content-length': body.byteLength,
      'cache-control': 'no-cache',
    })
    res.end(req.method === 'HEAD' ? undefined : body)
  } catch {
    res.writeHead(404).end()
  }
}

export interface RunningWaica {
  version: string
  pid: number
}

/**
 * Asks whatever listens on host:port whether it is a waica server. Any network
 * error, timeout or unexpected payload means "not waica" — never throws.
 */
export async function probeWaica(
  host: string,
  port: number,
  timeoutMs: number,
): Promise<RunningWaica | null> {
  try {
    const res = await fetch(`http://${host}:${port}${HEALTH_PATH}`, {
      signal: AbortSignal.timeout(timeoutMs),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { name?: unknown; version?: unknown; pid?: unknown }
    if (data.name !== 'waica' || typeof data.version !== 'string' || typeof data.pid !== 'number') {
      return null
    }
    return { version: data.version, pid: data.pid }
  } catch {
    return null
  }
}

/** Numeric segment-wise version compare: 1 if a > b, -1 if a < b, 0 if equal. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map((s) => Number.parseInt(s, 10) || 0)
  const pb = b.split('.').map((s) => Number.parseInt(s, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return Math.sign(diff)
  }
  return 0
}

/**
 * Fetches {version} from a registry "latest" URL. Null on any failure — the
 * update check must never break or delay startup beyond its timeout.
 */
export async function fetchLatestVersion(url: string, timeoutMs: number): Promise<string | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) })
    if (!res.ok) return null
    const data = (await res.json()) as { version?: unknown }
    return typeof data.version === 'string' ? data.version : null
  } catch {
    return null
  }
}

/**
 * Listens on one fixed port, retrying while it is still in use — for taking
 * over a port whose previous owner was just asked to exit.
 */
export async function listenWithRetry(
  server: Server,
  port: number,
  host: string,
  attempts: number,
  delayMs: number,
): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(port, host, () => {
          server.off('error', reject)
          resolve()
        })
      })
      return
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE' || attempt >= attempts) throw error
      await new Promise((resolve) => setTimeout(resolve, delayMs))
    }
  }
}

/**
 * Listens on the preferred port, walking forward past ports already in use.
 * Returns the port that actually got bound.
 */
export async function listenOnFreePort(
  server: Server,
  preferredPort: number,
  host: string,
): Promise<number> {
  const last = Math.min(preferredPort + 9, 65535)
  for (let port = preferredPort; port <= last; port++) {
    try {
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(port, host, () => {
          server.off('error', reject)
          resolve()
        })
      })
      return port
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EADDRINUSE') throw error
    }
  }
  throw new Error(`ports ${preferredPort}-${last} are all in use — pick one with --port`)
}
