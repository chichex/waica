import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import type { Server } from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import {
  DEFAULT_PORT,
  contentType,
  createEditorServer,
  listenOnFreePort,
  parseArgs,
  resolveFile,
} from './server.js'

describe('parseArgs', () => {
  it('defaults to the standard port, opening the browser', () => {
    expect(parseArgs([])).toEqual({ port: DEFAULT_PORT, open: true, help: false, version: false })
  })

  it('accepts --port and --no-open', () => {
    expect(parseArgs(['--port', '4000', '--no-open'])).toEqual({
      port: 4000,
      open: false,
      help: false,
      version: false,
    })
  })

  it('recognizes --help and --version', () => {
    expect(parseArgs(['--help']).help).toBe(true)
    expect(parseArgs(['--version']).version).toBe(true)
  })

  it('rejects a non-numeric or missing port', () => {
    expect(() => parseArgs(['--port', 'abc'])).toThrow(/--port/)
    expect(() => parseArgs(['--port'])).toThrow(/--port/)
  })

  it('rejects unknown flags', () => {
    expect(() => parseArgs(['--wat'])).toThrow(/--wat/)
  })
})

describe('contentType', () => {
  it('maps the extensions the editor build ships', () => {
    expect(contentType('index.html')).toBe('text/html; charset=utf-8')
    expect(contentType('assets/app.js')).toBe('text/javascript; charset=utf-8')
    expect(contentType('assets/style.css')).toBe('text/css; charset=utf-8')
    expect(contentType('art/dog.png')).toBe('image/png')
    expect(contentType('font/codicon.ttf')).toBe('font/ttf')
  })

  it('falls back to octet-stream for unknown extensions', () => {
    expect(contentType('data.xyz')).toBe('application/octet-stream')
  })
})

describe('resolveFile', () => {
  const root = path.join(os.tmpdir(), 'waica-root')

  it('resolves url paths inside the root', () => {
    expect(resolveFile(root, '/assets/app.js')).toBe(path.join(root, 'assets', 'app.js'))
    expect(resolveFile(root, '/')).toBe(root)
  })

  it('ignores query strings and hashes', () => {
    expect(resolveFile(root, '/assets/app.js?v=1#top')).toBe(path.join(root, 'assets', 'app.js'))
  })

  it('refuses paths that escape the root, even percent-encoded', () => {
    expect(resolveFile(root, '/../secret.txt')).toBeNull()
    expect(resolveFile(root, '/%2e%2e/secret.txt')).toBeNull()
    expect(resolveFile(root, '/assets/%2e%2e/%2e%2e/secret.txt')).toBeNull()
  })
})

describe('createEditorServer', () => {
  let root: string
  let server: Server
  let base: string
  let port: number

  beforeAll(async () => {
    root = mkdtempSync(path.join(os.tmpdir(), 'waica-cli-test-'))
    writeFileSync(path.join(root, 'index.html'), '<!doctype html><title>waica</title>')
    mkdirSync(path.join(root, 'assets'))
    writeFileSync(path.join(root, 'assets', 'app.js'), 'console.log("waica")')

    server = createEditorServer(root)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('no server port')
    port = address.port
    base = `http://127.0.0.1:${port}`
  })

  afterAll(async () => {
    await new Promise((resolve) => server.close(resolve))
    rmSync(root, { recursive: true, force: true })
  })

  it('serves index.html at the root', async () => {
    const res = await fetch(`${base}/`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8')
    expect(await res.text()).toContain('waica')
  })

  it('serves assets with their content type', async () => {
    const res = await fetch(`${base}/assets/app.js`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('text/javascript; charset=utf-8')
    expect(await res.text()).toBe('console.log("waica")')
  })

  it('404s missing files that look like assets', async () => {
    const res = await fetch(`${base}/assets/missing.js`)
    expect(res.status).toBe(404)
  })

  it('falls back to index.html for extension-less routes', async () => {
    const res = await fetch(`${base}/some/client/route`)
    expect(res.status).toBe(200)
    expect(await res.text()).toContain('waica')
  })

  // fetch normalizes dot segments away per the URL spec, so the traversal
  // has to go over a raw socket to ever reach the server.
  it('refuses traversal attempts sent raw', async () => {
    const status = await new Promise<number>((resolve, reject) => {
      const socket = net.connect(port, '127.0.0.1', () => {
        socket.write('GET /../secret.txt HTTP/1.0\r\n\r\n')
      })
      socket.once('data', (data) => {
        const statusLine = data.toString().split('\r\n')[0] ?? ''
        socket.end()
        resolve(Number(statusLine.split(' ')[1]))
      })
      socket.once('error', reject)
    })
    expect(status).toBe(403)
  })

  it('rejects non-GET methods', async () => {
    const res = await fetch(`${base}/`, { method: 'POST' })
    expect(res.status).toBe(405)
  })
})

describe('listenOnFreePort', () => {
  it('walks past a port already in use', async () => {
    const taken = createEditorServer(os.tmpdir())
    await new Promise<void>((resolve) => taken.listen(0, '127.0.0.1', resolve))
    const address = taken.address()
    if (address === null || typeof address === 'string') throw new Error('no server port')

    const server = createEditorServer(os.tmpdir())
    const port = await listenOnFreePort(server, address.port, '127.0.0.1')
    expect(port).toBeGreaterThan(address.port)
    expect(server.listening).toBe(true)

    await new Promise((resolve) => server.close(resolve))
    await new Promise((resolve) => taken.close(resolve))
  })
})
