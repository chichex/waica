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
 * Static server for the bundled editor: files by content type, index.html for
 * extension-less routes (the editor is a SPA).
 */
export function createEditorServer(root: string): Server {
  return createServer((req, res) => {
    void handle(root, req, res)
  })
}

async function handle(root: string, req: IncomingMessage, res: ServerResponse): Promise<void> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' }).end()
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
