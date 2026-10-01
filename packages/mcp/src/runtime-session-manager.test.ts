import { describe, expect, it } from 'vitest'
import {
  RuntimeSessionManager,
  type RuntimeBrowser,
  type RuntimeDevServer,
  type RuntimeSessionAdapters,
} from './runtime-session-manager.js'
import type { RuntimePreflightResult } from './runtime-preflight.js'
import { defined, match } from '../../engine/src/test-support.js'

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
  capabilities: ['click'],
  initialSnapshot: {
    bridgeVersion: 1,
    mode: 'paused',
    frame: 0,
    simulationTime: 0,
    entities: [],
  },
}

function preflight(projectPath: string, timeoutMs = 30_000): RuntimePreflightResult {
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
    timeoutMs,
    headless: true,
    browserExecutablePath: '/chrome',
    engine: { package: '@waica/engine', version: '0.5.0', source: 'project' },
  }
}

function fakeBrowser(): RuntimeBrowser {
  return {
    ready: async () => ready,
    metadata: async () => ({ ...ready }),
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
          metadata: async () => ({ ...ready }),
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
      metadata: match.objectContaining({ projectPath: '/a', frame: 3 }),
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
        diagnostics: match.objectContaining({ portOpen: false }),
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
      metadata: async () => ({ ...ready }),
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

  it('rejects a click on a pre-CA-10 engine build instead of silently no-opping it (review finding #4)', async () => {
    // A mixed-version scenario: the MCP server knows about 'click', but this
    // Project's own @waica/engine build predates it and never reports the
    // capability — protocol stays 1 either way, so bridgeVersion alone can't
    // tell the two apart.
    const oldEngineReady = { ...ready, engineVersion: '0.9.0', capabilities: [] }
    let controlCalls = 0
    const browser: RuntimeBrowser = {
      ready: async () => oldEngineReady,
      metadata: async () => ({ ...oldEngineReady }),
      inspect: async () => ({ ...oldEngineReady, snapshot: { entities: [] } }),
      control: async (request) => {
        controlCalls += 1
        // What a pre-CA-10 bridge actually does with an operation it
        // doesn't recognize: silently ignore it and report success anyway.
        return { ...oldEngineReady, heldActions: request.operation === 'hold' ? ['right'] : [] }
      },
      captureScreenshot: async () => ({ ...oldEngineReady, data: 'png' }),
      close: async () => {},
      setLifecycleHandlers: () => {},
    }
    const adapters: RuntimeSessionAdapters = {
      canonicalize: async () => '/old-engine',
      preflight: async () => preflight('/old-engine'),
      startDevServer: async () => ({
        url: 'http://127.0.0.1:41004/',
        stop: async () => {},
        diagnostics: () => ({}),
      }),
      startBrowser: async () => browser,
    }
    const manager = new RuntimeSessionManager(adapters)
    await manager.start({ projectPath: '/old-engine' })

    await expect(
      manager.control({ projectPath: '/old-engine', operation: 'click', x: 1, y: 2 }),
    ).rejects.toMatchObject({
      body: {
        code: 'runtime-incompatible',
        stage: 'control',
        diagnostics: { engineVersion: '0.9.0' },
      },
    })
    expect(controlCalls).toBe(0) // rejected before ever reaching the old bridge

    // Same story for 'scene' (CA-15): pre-CA-10 engines never report it either.
    await expect(
      manager.control({ projectPath: '/old-engine', operation: 'scene', scene: 'cave' }),
    ).rejects.toMatchObject({
      body: {
        code: 'runtime-incompatible',
        stage: 'control',
        diagnostics: { engineVersion: '0.9.0' },
      },
    })
    expect(controlCalls).toBe(0)

    // An operation the old engine does support still goes through normally.
    await expect(
      manager.control({ projectPath: '/old-engine', operation: 'hold', action: 'right' }),
    ).resolves.toMatchObject({ heldActions: ['right'] })
    expect(controlCalls).toBe(1)

    await manager.close()
  })
  it('relays actionValues beside heldActions (issue #75 CA-13)', async () => {
    const analogReady = { ...ready, capabilities: ['click', 'analog-actions'] }
    const requests: unknown[] = []
    const browser: RuntimeBrowser = {
      ...fakeBrowser(),
      ready: async () => analogReady,
      metadata: async () => ({ ...analogReady }),
      control: async (request) => {
        requests.push(request)
        return { ...analogReady, heldActions: ['right'], actionValues: { right: 0.5 } }
      },
    }
    const manager = new RuntimeSessionManager(singleBrowserAdapters('/analog', browser))
    await manager.start({ projectPath: '/analog' })

    await expect(
      manager.control({ projectPath: '/analog', operation: 'hold', action: 'right', value: 0.5 }),
    ).resolves.toMatchObject({ heldActions: ['right'], actionValues: { right: 0.5 } })
    expect(requests).toEqual([{ operation: 'hold', action: 'right', value: 0.5 }])
    await manager.close()
  })

  it('rejects an analog hold on an engine without analog-actions instead of holding at 1 (issue #75 CA-12)', async () => {
    const oldEngineReady = { ...ready, engineVersion: '0.21.0', capabilities: ['click', 'scene'] }
    let controlCalls = 0
    const browser: RuntimeBrowser = {
      ...fakeBrowser(),
      ready: async () => oldEngineReady,
      metadata: async () => ({ ...oldEngineReady }),
      control: async () => {
        controlCalls += 1
        return { ...oldEngineReady, heldActions: ['right'] }
      },
    }
    const manager = new RuntimeSessionManager(singleBrowserAdapters('/old-analog', browser))
    await manager.start({ projectPath: '/old-analog' })

    await expect(
      manager.control({ projectPath: '/old-analog', operation: 'hold', action: 'right', value: 0.5 }),
    ).rejects.toMatchObject({
      body: { code: 'runtime-incompatible', stage: 'control', diagnostics: { engineVersion: '0.21.0' } },
    })
    expect(controlCalls).toBe(0)
    await expect(
      manager.control({ projectPath: '/old-analog', operation: 'hold', action: 'right' }),
    ).resolves.toMatchObject({ heldActions: ['right'] })
    expect(controlCalls).toBe(1)
    await manager.close()
  })
})

function singleBrowserAdapters(projectPath: string, browser: RuntimeBrowser): RuntimeSessionAdapters {
  return {
    canonicalize: async () => projectPath,
    preflight: async () => preflight(projectPath),
    startDevServer: async () => ({
      url: 'http://127.0.0.1:41010/',
      stop: async () => {},
      diagnostics: () => ({}),
    }),
    startBrowser: async () => browser,
  }
}

interface AssetNumbers {
  pending: number
  loaded: number
  failed: number
}

/**
 * A browser whose engine reports the 'assets' capability and whose bridge
 * reads — metadata(), and the one a capture makes right before its PNG —
 * serve `script` one entry per read, repeating the last one: what a Run
 * Session sees while a scene's images trickle in.
 */
function assetsBrowser(script: AssetNumbers[]): {
  browser: RuntimeBrowser
  metadataCalls: () => number
} {
  let reads = 0
  const current = (): AssetNumbers => defined(script[Math.min(Math.max(reads - 1, 0), script.length - 1)])
  const base = { ...ready, capabilities: ['click', 'scene', 'fixed-step', 'assets'] }
  const { initialSnapshot: _snapshot, ...metadata } = base
  const browser: RuntimeBrowser = {
    ready: async () => ({ ...base, assets: defined(script[0]) }),
    metadata: async () => {
      reads += 1
      return { ...metadata, assets: current() }
    },
    inspect: async () => ({ ...metadata, assets: current(), snapshot: { entities: [] } }),
    control: async (request) => ({
      ...metadata,
      assets: current(),
      heldActions: request.operation === 'hold' ? ['right'] : [],
    }),
    captureScreenshot: async () => {
      reads += 1
      return { ...metadata, assets: current(), data: 'png' }
    },
    close: async () => {},
    setLifecycleHandlers: () => {},
  }
  return { browser, metadataCalls: () => reads }
}

function assetsAdapters(browser: RuntimeBrowser, timeoutMs?: number): RuntimeSessionAdapters {
  return {
    canonicalize: async () => '/assets',
    preflight: async () => preflight('/assets', timeoutMs),
    startDevServer: async () => ({
      url: 'http://127.0.0.1:41010/',
      stop: async () => {},
      diagnostics: () => ({ portOpen: true }),
    }),
    startBrowser: async () => browser,
  }
}

describe('Assets Ready over the Run Session (CA-10)', () => {
  it('waits at readiness until assets.pending is 0 and reports assets on every tool result', async () => {
    const { browser, metadataCalls } = assetsBrowser([
      { pending: 2, loaded: 5, failed: 0 },
      { pending: 1, loaded: 6, failed: 0 },
      { pending: 0, loaded: 7, failed: 0 },
    ])
    const manager = new RuntimeSessionManager(assetsAdapters(browser))

    const started = await manager.start({ projectPath: '/assets' })

    expect(metadataCalls()).toBe(3)
    expect(started).toMatchObject({ frame: 0, assets: { pending: 0, loaded: 7, failed: 0 } })
    await expect(manager.start({ projectPath: '/assets' })).resolves.toMatchObject({
      reused: true,
      assets: { pending: 0, loaded: 7, failed: 0 },
    })
    await expect(manager.inspect({ projectPath: '/assets' })).resolves.toMatchObject({
      assets: { pending: 0, loaded: 7, failed: 0 },
    })
    await expect(
      manager.control({ projectPath: '/assets', operation: 'step', frames: 1 }),
    ).resolves.toMatchObject({ assets: { pending: 0, loaded: 7, failed: 0 } })
    await expect(manager.captureScreenshot('/assets')).resolves.toMatchObject({
      metadata: { assets: { pending: 0, loaded: 7, failed: 0 } },
      data: 'png',
    })
    await manager.close()
  })

  it('never waits and carries no assets for an engine that does not report the capability', async () => {
    let reads = 0
    const browser = fakeBrowser()
    browser.metadata = async () => {
      reads += 1
      return { ...ready }
    }
    const manager = new RuntimeSessionManager({
      canonicalize: async () => '/old',
      preflight: async () => preflight('/old'),
      startDevServer: async () => ({ url: 'http://127.0.0.1:41011/', stop: async () => {}, diagnostics: () => ({}) }),
      startBrowser: async () => browser,
    })

    const started = await manager.start({ projectPath: '/old' })
    const inspected = await manager.inspect({ projectPath: '/old' })
    const controlled = await manager.control({ projectPath: '/old', operation: 'step' })
    const shot = await manager.captureScreenshot('/old')

    expect(reads).toBe(0)
    expect(started).not.toHaveProperty('assets')
    expect(inspected).not.toHaveProperty('assets')
    expect(controlled).not.toHaveProperty('assets')
    expect(shot.metadata).not.toHaveProperty('assets')
    await manager.close()
  })

  it("waits after a 'scene' operation and returns the settled numbers; step, press and inspect never wait", async () => {
    const { browser, metadataCalls } = assetsBrowser([
      { pending: 0, loaded: 7, failed: 0 },
      { pending: 3, loaded: 7, failed: 0 },
      { pending: 0, loaded: 10, failed: 0 },
    ])
    const manager = new RuntimeSessionManager(assetsAdapters(browser))
    await manager.start({ projectPath: '/assets' })
    expect(metadataCalls()).toBe(1)

    const swapped = await manager.control({ projectPath: '/assets', operation: 'scene', scene: 'cave' })

    expect(metadataCalls()).toBe(3)
    expect(swapped).toMatchObject({ frame: 0, heldActions: [], assets: { pending: 0, loaded: 10, failed: 0 } })

    await manager.control({ projectPath: '/assets', operation: 'step', frames: 2 })
    await manager.control({ projectPath: '/assets', operation: 'press', action: 'jump' })
    await manager.inspect({ projectPath: '/assets' })
    expect(metadataCalls()).toBe(3)
    await manager.close()
  })

  it("captures a settled session with one bridge read — the capture's own — and answers with its numbers", async () => {
    const { browser, metadataCalls } = assetsBrowser([{ pending: 0, loaded: 7, failed: 0 }])
    const manager = new RuntimeSessionManager(assetsAdapters(browser))
    await manager.start({ projectPath: '/assets' })
    expect(metadataCalls()).toBe(1)

    const shot = await manager.captureScreenshot('/assets')

    expect(metadataCalls()).toBe(2)
    expect(shot).toMatchObject({ metadata: { assets: { pending: 0, loaded: 7, failed: 0 } }, data: 'png' })
    await manager.close()
  })

  it('waits for Assets Ready and captures again when the capture finds art still arriving', async () => {
    const { browser, metadataCalls } = assetsBrowser([
      { pending: 0, loaded: 7, failed: 0 },
      { pending: 2, loaded: 7, failed: 0 },
      { pending: 0, loaded: 9, failed: 0 },
    ])
    const manager = new RuntimeSessionManager(assetsAdapters(browser))
    await manager.start({ projectPath: '/assets' })

    const shot = await manager.captureScreenshot('/assets')

    // The capture's read (pending 2), one poll (pending 0), the capture again.
    expect(metadataCalls()).toBe(4)
    expect(shot).toMatchObject({ metadata: { assets: { pending: 0, loaded: 9, failed: 0 } }, data: 'png' })
    await manager.close()
  })

  it('fails structurally, naming the last assets numbers, when the wait outlives the session timeout', async () => {
    const stuckAtStart = assetsBrowser([{ pending: 1, loaded: 6, failed: 0 }])
    const failing = new RuntimeSessionManager(assetsAdapters(stuckAtStart.browser, 100))
    await expect(failing.start({ projectPath: '/assets' })).rejects.toMatchObject({
      body: {
        code: 'runtime-start-failed',
        stage: 'game',
        diagnostics: match.objectContaining({ portOpen: true, assets: { pending: 1, loaded: 6, failed: 0 } }),
      },
    })
    expect(stuckAtStart.metadataCalls()).toBeGreaterThan(1)
    await failing.close()

    const stuckLater = assetsBrowser([
      { pending: 0, loaded: 7, failed: 0 },
      { pending: 1, loaded: 7, failed: 0 },
    ])
    const manager = new RuntimeSessionManager(assetsAdapters(stuckLater.browser, 100))
    await manager.start({ projectPath: '/assets' })
    await expect(manager.captureScreenshot('/assets')).rejects.toMatchObject({
      body: {
        code: 'runtime-operation-failed',
        diagnostics: match.objectContaining({ assets: { pending: 1, loaded: 7, failed: 0 } }),
      },
    })
    await expect(
      manager.control({ projectPath: '/assets', operation: 'scene', scene: 'cave' }),
    ).rejects.toMatchObject({
      body: {
        code: 'runtime-operation-failed',
        stage: 'control',
        diagnostics: match.objectContaining({ assets: { pending: 1, loaded: 7, failed: 0 } }),
      },
    })
    // The session survives a timed-out wait: the Game is fine, only its art is late.
    await expect(manager.inspect({ projectPath: '/assets' })).resolves.toMatchObject({ frame: 0 })
    await manager.close()
  })
})
