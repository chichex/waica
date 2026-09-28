import { expect, it } from 'vitest'
import type { RuntimePreflightResult } from './runtime-preflight.js'
import {
  RuntimeSessionManager,
  type RuntimeBridgeReady,
  type RuntimeBrowser,
  type RuntimeDevServer,
  type RuntimeSessionAdapters,
} from './runtime-session-manager.js'

// CA-13 (issue #100): the host's cancellation signal reaches every stage of
// a Run Session call, and an aborted call leaves no half-registered session.

const ready: RuntimeBridgeReady = {
  engineVersion: '0.5.0',
  bridgeVersion: 1,
  mode: 'paused',
  frame: 0,
  simulationTime: 0,
  capabilities: ['click', 'scene'],
  initialSnapshot: { entities: [] },
}

function preflight(projectPath: string): RuntimePreflightResult {
  return {
    projectPath,
    packageManager: 'npm',
    command: 'npm',
    args: ['run', 'dev'],
    viewport: { width: 640, height: 360 },
    timeoutMs: 30_000,
    headless: true,
    browserExecutablePath: '/chrome',
    engine: { package: '@waica/engine', version: '0.5.0', source: 'project' },
  }
}

function browser(overrides: Partial<RuntimeBrowser> = {}): RuntimeBrowser {
  return {
    ready: () => Promise.resolve(ready),
    metadata: () => Promise.resolve({ ...ready }),
    inspect: () => Promise.resolve({ ...ready, snapshot: ready.initialSnapshot }),
    control: () => Promise.resolve({ ...ready, heldActions: [] }),
    captureScreenshot: () => Promise.resolve({ ...ready, data: 'png' }),
    close: () => Promise.resolve(),
    setLifecycleHandlers: () => {},
    ...overrides,
  }
}

function devServer(stops: string[] = []): RuntimeDevServer {
  return {
    url: 'http://127.0.0.1:43123/',
    stop: () => {
      stops.push('dev-server')
      return Promise.resolve()
    },
    diagnostics: () => ({}),
  }
}

function manager(adapters: Partial<RuntimeSessionAdapters> = {}): RuntimeSessionManager {
  return new RuntimeSessionManager({
    canonicalize: (projectPath) => Promise.resolve(projectPath),
    preflight: ({ projectPath }) => Promise.resolve(preflight(projectPath)),
    startDevServer: () => Promise.resolve(devServer()),
    startBrowser: () => Promise.resolve(browser()),
    ...adapters,
  })
}

function abortReason(): Error {
  const reason = new Error('host cancelled')
  reason.name = 'AbortError'
  return reason
}

it('hands the signal to the dev server and browser starts', async () => {
  const seen: (AbortSignal | undefined)[] = []
  const sessions = manager({
    startDevServer: (_checked, signal) => {
      seen.push(signal)
      return Promise.resolve(devServer())
    },
    startBrowser: (_checked, _dev, signal) => {
      seen.push(signal)
      return Promise.resolve(browser())
    },
  })
  const controller = new AbortController()
  await sessions.start({ projectPath: '/game' }, { signal: controller.signal })
  expect(seen).toEqual([controller.signal, controller.signal])
  await sessions.close()
})

it('rejects with the abort reason, closes what it opened and keeps no session', async () => {
  const stops: string[] = []
  const controller = new AbortController()
  const reason = abortReason()
  // The host cancels while the browser starts; this adapter ignores the
  // signal and hands back a live browser the manager must close.
  let cancelNext = true
  const sessions = manager({
    startDevServer: () => Promise.resolve(devServer(stops)),
    startBrowser: () => {
      if (cancelNext) controller.abort(reason)
      cancelNext = false
      return Promise.resolve(
        browser({
          close: () => {
            stops.push('browser')
            return Promise.resolve()
          },
        }),
      )
    },
  })
  await expect(sessions.start({ projectPath: '/game' }, { signal: controller.signal })).rejects.toBe(reason)
  expect(stops.sort()).toEqual(['browser', 'dev-server'])
  await expect(sessions.inspect({ projectPath: '/game' })).rejects.toMatchObject({
    body: { code: 'runtime-not-running' },
  })
  await expect(sessions.start({ projectPath: '/game' })).resolves.toMatchObject({ reused: false })
  await sessions.close()
})
it('rejects inspect, control and screenshot on an aborted signal without touching the browser', async () => {
  let browserCalls = 0
  const counted = <T,>(value: T) => () => {
    browserCalls += 1
    return Promise.resolve(value)
  }
  const sessions = manager({
    startBrowser: () =>
      Promise.resolve(
        browser({
          inspect: counted({ ...ready, snapshot: ready.initialSnapshot }),
          control: counted({ ...ready, heldActions: [] }),
          captureScreenshot: counted({ ...ready, data: 'png' }),
        }),
      ),
  })
  await sessions.start({ projectPath: '/game' })
  const reason = abortReason()
  const signal = AbortSignal.abort(reason)

  await expect(sessions.inspect({ projectPath: '/game' }, { signal })).rejects.toBe(reason)
  await expect(sessions.control({ projectPath: '/game', operation: 'step' }, { signal })).rejects.toBe(reason)
  await expect(sessions.captureScreenshot('/game', { signal })).rejects.toBe(reason)
  expect(browserCalls).toBe(0)
  await expect(sessions.inspect({ projectPath: '/game' })).resolves.toMatchObject({ frame: 0 })
  await sessions.close()
})

it('stops waiting for Assets Ready on abort and leaves the session active', async () => {
  const withAssets = { ...ready, capabilities: ['scene', 'assets'] }
  const controller = new AbortController()
  const reason = abortReason()
  let polls = 0
  const metadata = (): Promise<Record<string, unknown>> => {
    polls += 1
    // Settled at readiness; the scene swap below leaves art pending.
    const pending = polls === 1 ? 0 : 1
    if (polls === 3) controller.abort(reason)
    return Promise.resolve({ ...withAssets, assets: { pending, loaded: 0, failed: 0 } })
  }
  const sessions = manager({
    startBrowser: () => Promise.resolve(browser({ ready: () => Promise.resolve(withAssets), metadata })),
  })
  await sessions.start({ projectPath: '/game' })

  const started = Date.now()
  const swap = sessions.control(
    { projectPath: '/game', operation: 'scene', scene: 'level-2' },
    { signal: controller.signal },
  )
  await expect(swap).rejects.toBe(reason)
  expect(Date.now() - started).toBeLessThan(1_000)
  expect(polls).toBe(3)
  await expect(sessions.inspect({ projectPath: '/game' })).resolves.toMatchObject({ frame: 0 })
  await sessions.close()
})
