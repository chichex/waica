import { writeFile } from 'node:fs/promises'
import net from 'node:net'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { cleanup, tempDir } from './test-helpers.js'
import { startRuntimeDevServer } from './runtime-dev-server.js'
import type { RuntimePreflightResult } from './runtime-preflight.js'

const roots: string[] = []
afterEach(async () => cleanup(...roots.splice(0)))

async function script(source: string): Promise<{ root: string; file: string }> {
  const root = await tempDir('waica-runtime-process-')
  roots.push(root)
  const file = path.join(root, 'server.mjs')
  await writeFile(file, source)
  return { root, file }
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (!address || typeof address === 'string') return reject(new Error('missing port'))
      server.close((error) => (error ? reject(error) : resolve(address.port)))
    })
  })
}

function checked(root: string, file: string, timeoutMs = 5_000): RuntimePreflightResult {
  return {
    projectPath: root,
    packageManager: 'npm',
    command: process.execPath,
    args: [file],
    viewport: { width: 640, height: 360 },
    timeoutMs,
    headless: true,
    browserExecutablePath: '/chrome',
    engine: { package: '@waica/engine', version: '0.5.0', source: 'project' },
  }
}

describe('Runtime dev-server process', () => {
  it('parses and probes a loopback URL, bounds diagnostics, then closes the group and port', async () => {
    const fixture = await script(`
      import http from 'node:http'
      process.stdout.write('x'.repeat(70_000))
      const server = http.createServer((_request, response) => response.end('ready'))
      server.listen(0, '127.0.0.1', () => {
        const address = server.address()
        console.log('\\n  Local: http://127.0.0.1:' + address.port + '/')
      })
      process.on('SIGTERM', () => server.close(() => process.exit(0)))
    `)

    const server = await startRuntimeDevServer(checked(fixture.root, fixture.file), { graceMs: 100 })

    expect(server.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/)
    await expect(fetch(server.url).then((response) => response.text())).resolves.toBe('ready')
    expect(Buffer.byteLength(String(server.diagnostics().stdout))).toBeLessThanOrEqual(65_536)

    await server.stop()

    await expect(fetch(server.url)).rejects.toThrow()
  })

  it('replaces the runtime port placeholder before executing the trusted script', async () => {
    const fixture = await script(`
      import http from 'node:http'
      const index = process.argv.indexOf('--port')
      const port = Number(process.argv[index + 1])
      if (!Number.isInteger(port) || port <= 0) throw new Error('port was not allocated')
      const server = http.createServer((_request, response) => response.end(String(port)))
      server.listen(port, '127.0.0.1', () => console.log('http://127.0.0.1:' + port + '/'))
      process.on('SIGTERM', () => server.close(() => process.exit(0)))
    `)
    const preflight = checked(fixture.root, fixture.file)
    preflight.args.push('--port', '__WAICA_RUNTIME_PORT__')

    const server = await startRuntimeDevServer(preflight, { graceMs: 100 })

    const actualPort = new URL(server.url).port
    await expect(fetch(server.url).then((response) => response.text())).resolves.toBe(actualPort)
    await server.stop()
  })

  it('retries a detected bind collision with a newly allocated port', async () => {
    const fixture = await script(`
      import { existsSync, writeFileSync } from 'node:fs'
      import http from 'node:http'
      import path from 'node:path'
      const marker = path.join(process.cwd(), 'attempted')
      if (!existsSync(marker)) {
        writeFileSync(marker, 'first')
        console.error('EADDRINUSE: Port is already in use')
        process.exit(1)
      }
      const index = process.argv.indexOf('--port')
      const port = Number(process.argv[index + 1])
      const server = http.createServer((_request, response) => response.end('retried'))
      server.listen(port, '127.0.0.1', () => console.log('http://127.0.0.1:' + port + '/'))
      process.on('SIGTERM', () => server.close(() => process.exit(0)))
    `)
    const preflight = checked(fixture.root, fixture.file)
    preflight.args.push('--port', '__WAICA_RUNTIME_PORT__')
    const ports = [await freePort(), await freePort()]
    let allocations = 0

    const server = await startRuntimeDevServer(preflight, {
      graceMs: 100,
      allocatePort: async () => ports[allocations++]!,
    })

    expect(allocations).toBe(2)
    expect(new URL(server.url).port).toBe(String(ports[1]))
    await server.stop()
  })

  it('force-kills a process group that ignores graceful termination', async () => {
    const fixture = await script(`
      import http from 'node:http'
      const server = http.createServer((_request, response) => response.end('ready'))
      server.listen(0, '127.0.0.1', () => {
        const address = server.address()
        console.log('http://127.0.0.1:' + address.port + '/')
      })
      process.on('SIGTERM', () => {})
    `)
    const server = await startRuntimeDevServer(checked(fixture.root, fixture.file), { graceMs: 25 })

    await server.stop()

    await expect(fetch(server.url)).rejects.toThrow()
  })

  it('reports an exited script with bounded stdout and stderr diagnostics', async () => {
    const fixture = await script(`
      console.log('before exit')
      console.error('dev exploded')
      process.exit(7)
    `)

    await expect(
      startRuntimeDevServer(checked(fixture.root, fixture.file, 1_000), { graceMs: 25 }),
    ).rejects.toMatchObject({
      body: {
        code: 'runtime-start-failed',
        stage: 'dev-server',
        projectPath: fixture.root,
        diagnostics: expect.objectContaining({
          stdout: expect.stringContaining('before exit'),
          stderr: expect.stringContaining('dev exploded'),
          exitCode: 7,
        }),
      },
    })
  })
})
