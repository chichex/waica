import { statSync } from 'node:fs'
import path from 'node:path'

/** The page loads from app://game/, a standard secure origin (ADR 0032). */
export const APP_SCHEME = 'app'
export const APP_ORIGIN = `${APP_SCHEME}://game`

/** Registered with protocol.registerSchemesAsPrivileged before the app is ready (H-5). */
export const APP_SCHEME_PRIVILEGES = { standard: true, secure: true, supportFetchAPI: true, stream: true } as const

/** What the shell serves from a Vite build; anything else is application/octet-stream. */
const MIME: Readonly<Record<string, string>> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ogg': 'audio/ogg',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ttf': 'font/ttf',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
}

export type AppRequestResult = { status: 200; file: string; mimeType: string } | { status: 404 }

function isFile(file: string): boolean {
  try {
    return statSync(file).isFile()
  } catch {
    return false
  }
}

function decodedPath(url: string): string | null {
  try {
    const parsed = new URL(url)
    if (parsed.host !== 'game') return null
    return decodeURIComponent(parsed.pathname)
  } catch {
    return null
  }
}

/**
 * Maps an app:// request into `dist` (CA-9): `/` is index.html, a path that
 * leaves `dist` (`..`, also percent-encoded) or names no file answers 404.
 */
export function resolveAppRequest(dist: string, url: string, exists: (file: string) => boolean = isFile): AppRequestResult {
  const pathname = decodedPath(url)
  if (pathname === null) return { status: 404 }
  const root = path.resolve(dist)
  const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`)
  if (!file.startsWith(root + path.sep) || !exists(file)) return { status: 404 }
  return { status: 200, file, mimeType: MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream' }
}
