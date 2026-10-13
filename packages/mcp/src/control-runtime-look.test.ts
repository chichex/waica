import { expect, it } from 'vitest'
import { TOOLS } from './server.js'
import {
  RuntimeSessionManager,
  type RuntimeBrowser,
  type RuntimeSessionAdapters,
} from './runtime-session-manager.js'
import type { RuntimePreflightResult } from './runtime-preflight.js'
import { defined } from '../../engine/src/test-support.js'

// Issue #181 CA-4: control_runtime's `look`, a mouse delta injected as if the
// pointer were locked. Its argument errors are covered in runtime-arguments.test.ts.

function controlSchema(): Record<string, unknown> {
  return defined(TOOLS.find((tool) => tool.name === 'control_runtime'), 'control_runtime').inputSchema
}

it('publishes look with a required finite dx and dy in the control_runtime schema (CA-4)', () => {
  const schema = controlSchema()
  const properties = schema.properties as Record<string, { enum?: string[]; type?: string }>

  expect(properties.operation?.enum).toContain('look')
  expect(properties.dx).toEqual({ type: 'number' })
  expect(properties.dy).toEqual({ type: 'number' })
  const branches = schema.oneOf as { properties: { operation: { const?: string } }; required?: string[] }[]
  const look = branches.find((branch) => branch.properties.operation.const === 'look')
  expect(look?.required).toEqual(['dx', 'dy'])
})

const readyAt = (capabilities: string[]): Awaited<ReturnType<RuntimeBrowser['ready']>> => ({
  engineVersion: '0.28.0',
  bridgeVersion: 1,
  mode: 'paused',
  frame: 0,
  simulationTime: 0,
  capabilities,
  initialSnapshot: { entities: [] },
})

function browserWith(capabilities: string[], requests: unknown[]): RuntimeBrowser {
  const ready = readyAt(capabilities)
  return {
    ready: () => Promise.resolve(ready),
    metadata: () => Promise.resolve({ ...ready }),
    inspect: () => Promise.resolve({ ...ready, snapshot: { entities: [] } }),
    control: (request) => {
      requests.push(request)
      return Promise.resolve({ ...ready, heldActions: [] })
    },
    captureScreenshot: () => Promise.resolve({ ...ready, data: 'png' }),
    close: () => Promise.resolve(),
    setLifecycleHandlers: () => {},
  }
}

function adapters(projectPath: string, browser: RuntimeBrowser): RuntimeSessionAdapters {
  const preflight: RuntimePreflightResult = {
    projectPath,
    packageManager: 'npm',
    command: 'npm',
    args: ['run', 'dev'],
    viewport: { width: 640, height: 360 },
    timeoutMs: 30_000,
    headless: true,
    browserExecutablePath: '/chrome',
    engine: { package: '@waica/engine', version: '0.28.0', source: 'project' },
  }
  return {
    canonicalize: () => Promise.resolve(projectPath),
    preflight: () => Promise.resolve(preflight),
    startDevServer: () =>
      Promise.resolve({ url: 'http://127.0.0.1:41020/', stop: () => Promise.resolve(), diagnostics: () => ({}) }),
    startBrowser: () => Promise.resolve(browser),
  }
}

it('relays look to an engine that reports the look capability (CA-4)', async () => {
  const requests: unknown[] = []
  const manager = new RuntimeSessionManager(adapters('/look', browserWith(['click', 'look'], requests)))
  await manager.start({ projectPath: '/look' })

  await manager.control({ projectPath: '/look', operation: 'look', dx: 90, dy: -5 })

  expect(requests).toEqual([{ operation: 'look', dx: 90, dy: -5 }])
  await manager.close()
})

it('rejects look on an engine without the look capability instead of no-opping (CA-4)', async () => {
  const requests: unknown[] = []
  const manager = new RuntimeSessionManager(adapters('/old-look', browserWith(['click', 'scene'], requests)))
  await manager.start({ projectPath: '/old-look' })

  await expect(
    manager.control({ projectPath: '/old-look', operation: 'look', dx: 1, dy: 0 }),
  ).rejects.toMatchObject({ body: { code: 'runtime-incompatible', stage: 'control' } })
  expect(requests).toEqual([])
  await manager.close()
})
