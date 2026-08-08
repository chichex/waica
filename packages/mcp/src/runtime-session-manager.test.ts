import { describe, expect, it } from 'vitest'
import {
  RuntimeSessionManager,
  type RuntimeBrowser,
  type RuntimeDevServer,
  type RuntimeSessionAdapters,
} from './runtime-session-manager.js'
import type { RuntimePreflightResult } from './runtime-preflight.js'

function deferred<T>(): {
  promise: Promise<T>
  resolve(value: T): void
  reject(error: unknown): void
} {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((accept, decline) => {
    resolve = accept
    reject = decline
  })
  return { promise, resolve, reject }
}

const ready = {
  engineVersion: '0.5.0',
  bridgeVersion: 1,
  mode: 'paused' as const,
  frame: 0,
  simulationTime: 0,
  initialSnapshot: {
    bridgeVersion: 1,
    mode: 'paused',
    frame: 0,
    simulationTime: 0,
    entities: [],
  },
}

function preflight(projectPath: string): RuntimePreflightResult {
  return {
    projectPath,
    packageManager: 'npm',
    command: 'npm',
    args: [
      'run',
      'dev',
      '--',
      '--host',
      '127.0.0.1',
      '--port',
      '__WAICA_RUNTIME_PORT__',
      '--strictPort',
    ],
    viewport: { width: 640, height: 360 },
    timeoutMs: 30_000,
    headless: true,
    browserExecutablePath: '/chrome',
    engine: { package: '@waica/engine', version: '0.5.0', source: 'project' },
  }
}

function fakeBrowser(): RuntimeBrowser {
  return {
    ready: async () => ready,
    inspect: async () => ({ ...ready, snapshot: ready.initialSnapshot }),
    control: async () => ({ ...ready, heldActions: [] }),
    captureScreenshot: async () => ({ ...ready, data: 'png' }),
    close: async () => {},
    setLifecycleHandlers: () => {},
  }
}

describe('RuntimeSessionManager', () => {
  it('coalesces canonical aliases and concurrent starts into one owned session', async () => {
    const canonical = '/canonical/game'
    const aliases = new Map([
      ['/alias/one', canonical],
      ['/alias/two', canonical],
      [canonical, canonical],
    ])
    const devStarted = deferred<RuntimeDevServer>()
    let preflightCalls = 0
    let processStarts = 0
    let browserStarts = 0
    const adapters: RuntimeSessionAdapters = {
      canonicalize: async (projectPath) => aliases.get(projectPath) ?? projectPath,
      preflight: async (input) => {
        preflightCalls += 1
        return preflight(aliases.get(input.projectPath) ?? input.projectPath)
      },
      startDevServer: async () => {
        processStarts += 1
        return devStarted.promise
      },
      startBrowser: async () => {
        browserStarts += 1
        return fakeBrowser()
      },
    }
    const manager = new RuntimeSessionManager(adapters)
    const dev: RuntimeDevServer = {
      url: 'http://127.0.0.1:43123/',
      stop: async () => {},
      diagnostics: () => ({}),
    }

    const first = manager.start({ projectPath: '/alias/one' })
    const second = manager.start({ projectPath: '/alias/two' })
    await Promise.resolve()
    devStarted.resolve(dev)
    const [firstResult, secondResult] = await Promise.all([first, second])

    expect(preflightCalls).toBe(1)
    expect(processStarts).toBe(1)
    expect(browserStarts).toBe(1)
    expect([firstResult.reused, secondResult.reused].sort()).toEqual([false, true])
    expect(firstResult).toMatchObject({
      projectPath: canonical,
      url: dev.url,
      viewport: { width: 640, height: 360 },
      engineVersion: '0.5.0',
      bridgeVersion: 1,
      mode: 'paused',
      frame: 0,
      simulationTime: 0,
      provenance: [{ package: '@waica/engine', version: '0.5.0', source: 'project' }],
    })
    await manager.close()
  })

  it('runs different Projects concurrently and owns every operation and cleanup', async () => {
    const events: string[] = []
    const browsers = new Map<string, RuntimeBrowser>()
    const frames = new Map<string, number>()
    const adapters: RuntimeSessionAdapters = {
      canonicalize: async (projectPath) => projectPath,
      preflight: async ({ projectPath }) => preflight(projectPath),
      startDevServer: async (checked) => ({
        url: `http://127.0.0.1:${checked.projectPath === '/a' ? 41001 : 41002}/`,
        stop: async () => {
          events.push(`process:${checked.projectPath}`)
        },
        diagnostics: () => ({}),
      }),
      startBrowser: async (checked) => {
        const browser: RuntimeBrowser = {
          ready: async () => ready,
          inspect: async (filters) => ({
            ...ready,
            frame: frames.get(checked.projectPath) ?? 0,
            snapshot: { entities: [], filters },
          }),
          control: async (request) => {
            if (request.operation === 'step') frames.set(checked.projectPath, 3)
            return {
              ...ready,
              frame: frames.get(checked.projectPath) ?? 0,
              heldActions: request.operation === 'hold' ? ['right'] : [],
            }
          },
          captureScreenshot: async () => ({ ...ready, frame: 3, data: 'png-data' }),
          close: async () => {
            events.push(`browser:${checked.projectPath}`)
          },
          setLifecycleHandlers: () => {},
        }
        browsers.set(checked.projectPath, browser)
        return browser
      },
    }
    const manager = new RuntimeSessionManager(adapters)

    await Promise.all([manager.start({ projectPath: '/a' }), manager.start({ projectPath: '/b' })])
    expect(browsers.size).toBe(2)
    await expect(
      manager.inspect({ projectPath: '/a', entityNames: ['Player'] }),
    ).resolves.toMatchObject({
      projectPath: '/a',
      snapshot: { entities: [], filters: { entityNames: ['Player'] } },
    })
    await expect(
      manager.control({ projectPath: '/a', operation: 'hold', action: 'right' }),
    ).resolves.toMatchObject({ projectPath: '/a', heldActions: ['right'] })
    await manager.control({ projectPath: '/a', operation: 'step', frames: 3 })
    await expect(manager.start({ projectPath: '/a' })).resolves.toMatchObject({
      reused: true,
      frame: 3,
    })
    await expect(manager.captureScreenshot('/a')).resolves.toEqual({
      metadata: expect.objectContaining({ projectPath: '/a', frame: 3 }),
      data: 'png-data',
    })

    await expect(manager.stop('/missing')).resolves.toEqual({
      projectPath: '/missing',
      stopped: false,
    })
    await expect(manager.stop('/a')).resolves.toEqual({ projectPath: '/a', stopped: true })
    expect(events).toEqual(['browser:/a', 'process:/a'])
    await expect(manager.stop('/a')).resolves.toEqual({ projectPath: '/a', stopped: false })

    await manager.close()
    expect(events).toEqual(['browser:/a', 'process:/a', 'browser:/b', 'process:/b'])
  })

  it('reports cleanup proof failures and still removes the ended session', async () => {
    let processStops = 0
    const browser = fakeBrowser()
    browser.close = async () => {
      throw new Error('context remained open')
    }
    const manager = new RuntimeSessionManager({
      canonicalize: async () => '/game',
      preflight: async () => preflight('/game'),
      startDevServer: async () => ({
        url: 'http://127.0.0.1:41004/',
        stop: async () => {
          processStops += 1
        },
        diagnostics: () => ({ portOpen: false }),
      }),
      startBrowser: async () => browser,
    })
    await manager.start({ projectPath: '/game' })

    await expect(manager.stop('/game')).rejects.toMatchObject({
      body: {
        code: 'runtime-operation-failed',
        stage: 'cleanup',
        diagnostics: expect.objectContaining({ portOpen: false }),
      },
    })
    expect(processStops).toBe(1)
    await expect(manager.stop('/game')).resolves.toEqual({ projectPath: '/game', stopped: false })
  })

  it('rejects operations while reloading, resets the baseline, and ends a failed session', async () => {
    let lifecycle: Parameters<RuntimeBrowser['setLifecycleHandlers']>[0] | undefined
    let browserClosed = 0
    let processStopped = 0
    const browser: RuntimeBrowser = {
      ready: async () => ready,
      inspect: async () => ({ ...ready, snapshot: { entities: [] } }),
      control: async () => ({ ...ready, heldActions: [] }),
      captureScreenshot: async () => ({ ...ready, data: 'png' }),
      close: async () => {
        browserClosed += 1
      },
      setLifecycleHandlers: (handlers) => {
        lifecycle = handlers
      },
    }
    const adapters: RuntimeSessionAdapters = {
      canonicalize: async () => '/game',
      preflight: async () => preflight('/game'),
      startDevServer: async () => ({
        url: 'http://127.0.0.1:41003/',
        stop: async () => {
          processStopped += 1
        },
        diagnostics: () => ({}),
      }),
      startBrowser: async () => browser,
    }
    const manager = new RuntimeSessionManager(adapters)
    await manager.start({ projectPath: '/game' })

    lifecycle?.reloading()
    await expect(manager.inspect({ projectPath: '/game' })).rejects.toMatchObject({
      body: { code: 'runtime-invalid-state', stage: 'game' },
    })

    const fresh = {
      ...ready,
      frame: 0,
      simulationTime: 0,
      initialSnapshot: { ...ready.initialSnapshot, entities: [{ name: 'Reloaded' }] },
    }
    lifecycle?.reloaded(fresh)
    await expect(manager.start({ projectPath: '/game' })).resolves.toMatchObject({
      reused: true,
      frame: 0,
      simulationTime: 0,
      initialSnapshot: { entities: [{ name: 'Reloaded' }] },
    })

    lifecycle?.failed(new Error('page crashed'))
    lifecycle?.failed(new Error('browser disconnected'))
    await new Promise((resolve) => setTimeout(resolve, 0))
    await expect(manager.inspect({ projectPath: '/game' })).rejects.toMatchObject({
      body: { code: 'runtime-not-running' },
    })
    expect(browserClosed).toBe(1)
    expect(processStopped).toBe(1)
    await manager.close()
  })
})
