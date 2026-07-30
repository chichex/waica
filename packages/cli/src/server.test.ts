import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { createServer, type Server, type ServerResponse } from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import {
  DEFAULT_PORT,
  HEALTH_PATH,
  compareVersions,
  contentType,
  createEditorServer,
  fetchLatestVersion,
  listenOnFreePort,
  listenWithRetry,
  parseArgs,
  probeWaica,
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

    server = createEditorServer(root, '1.2.3-test')
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

  it('reports itself on the health endpoint', async () => {
    const res = await fetch(`${base}${HEALTH_PATH}`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/json')
    expect(await res.json()).toEqual({ name: 'waica', version: '1.2.3-test', pid: process.pid })
  })

  it('is recognized by probeWaica', async () => {
    expect(await probeWaica('127.0.0.1', port, 1000)).toEqual({
      version: '1.2.3-test',
      pid: process.pid,
    })
  })
})

describe('probeWaica', () => {
  it('returns null for a server that is not waica', async () => {
    const impostor = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html' }).end('<html>hola</html>')
    })
    await new Promise<void>((resolve) => impostor.listen(0, '127.0.0.1', resolve))
    const address = impostor.address()
    if (address === null || typeof address === 'string') throw new Error('no server port')

    expect(await probeWaica('127.0.0.1', address.port, 1000)).toBeNull()
    await new Promise((resolve) => impostor.close(resolve))
  })

  it('returns null when nothing listens on the port', async () => {
    const free = createServer()
    await new Promise<void>((resolve) => free.listen(0, '127.0.0.1', resolve))
    const address = free.address()
    if (address === null || typeof address === 'string') throw new Error('no server port')
    await new Promise((resolve) => free.close(resolve))

    expect(await probeWaica('127.0.0.1', address.port, 1000)).toBeNull()
  })
})

describe('compareVersions', () => {
  it('orders semver-style versions numerically', () => {
    expect(compareVersions('0.2.0', '0.1.0')).toBe(1)
    expect(compareVersions('0.1.0', '0.2.0')).toBe(-1)
    expect(compareVersions('0.1.0', '0.1.0')).toBe(0)
    expect(compareVersions('0.10.0', '0.9.9')).toBe(1)
    expect(compareVersions('1.0.0', '0.99.99')).toBe(1)
  })

  it('treats missing segments as zero', () => {
    expect(compareVersions('1.0', '1.0.0')).toBe(0)
    expect(compareVersions('1.0.1', '1.0')).toBe(1)
  })
})

describe('fetchLatestVersion', () => {
  async function registryStub(handler: (res: ServerResponse) => void): Promise<{
    url: string
    close: () => Promise<unknown>
  }> {
    const server = createServer((_req, res) => handler(res))
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('no server port')
    return {
      url: `http://127.0.0.1:${address.port}/latest`,
      close: () => new Promise((resolve) => server.close(resolve)),
    }
  }

  it('returns the version the registry reports', async () => {
    const stub = await registryStub((res) => {
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ name: '@chichex/waica', version: '9.9.9' }))
    })
    expect(await fetchLatestVersion(stub.url, 1000)).toBe('9.9.9')
    await stub.close()
  })

  it('returns null on registry errors or bad payloads', async () => {
    const failing = await registryStub((res) => res.writeHead(500).end())
    expect(await fetchLatestVersion(failing.url, 1000)).toBeNull()
    await failing.close()

    const garbage = await registryStub((res) => {
      res.writeHead(200, { 'content-type': 'application/json' }).end('{"nope":true}')
    })
    expect(await fetchLatestVersion(garbage.url, 1000)).toBeNull()
    await garbage.close()
  })
})

describe('listenWithRetry', () => {
  it('binds once the port frees up', async () => {
    const occupant = createEditorServer(os.tmpdir())
    await new Promise<void>((resolve) => occupant.listen(0, '127.0.0.1', resolve))
    const address = occupant.address()
    if (address === null || typeof address === 'string') throw new Error('no server port')
    const targetPort = address.port

    setTimeout(() => void occupant.close(), 150)
    const server = createEditorServer(os.tmpdir())
    await listenWithRetry(server, targetPort, '127.0.0.1', 30, 50)
    expect(server.listening).toBe(true)
    await new Promise((resolve) => server.close(resolve))
  })

  it('gives up with EADDRINUSE when the port never frees', async () => {
    const occupant = createEditorServer(os.tmpdir())
    await new Promise<void>((resolve) => occupant.listen(0, '127.0.0.1', resolve))
    const address = occupant.address()
    if (address === null || typeof address === 'string') throw new Error('no server port')

    const server = createEditorServer(os.tmpdir())
    await expect(listenWithRetry(server, address.port, '127.0.0.1', 2, 10)).rejects.toMatchObject({
      code: 'EADDRINUSE',
    })
    await new Promise((resolve) => occupant.close(resolve))
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
