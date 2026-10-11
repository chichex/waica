import { describe, expect, it } from 'vitest'
import type { RuntimePreflightResult } from './runtime-preflight.js'
import { awaitRuntimeReadiness, type ReadinessProbe } from './runtime-readiness.js'
import { RuntimeToolError } from './runtime-service.js'

function preflight(timeoutMs: number): RuntimePreflightResult {
  return {
    projectPath: '/project',
    packageManager: 'npm',
    command: 'npm',
    args: ['run', 'dev'],
    viewport: { width: 640, height: 360 },
    timeoutMs,
    headless: true,
    browserExecutablePath: '/chrome',
    engine: { package: '@waica/engine', version: '0.24.0', source: 'project' },
  }
}

function ready(backend: 'webgpu' | 'webgl2' | null, capabilities = ['assets', 'render-backend']): ReadinessProbe {
  const metadata = { engineVersion: '0.24.0', bridgeVersion: 1, mode: 'paused', frame: 0, simulationTime: 0, capabilities, backend } as const
  return { status: 'ready', metadata, initialSnapshot: { ...metadata, entities: [] } }
}

/** A page whose probes answer `answers` in order, repeating the last one. */
function page(answers: ReadinessProbe[]): { probe: () => Promise<ReadinessProbe>; calls: () => number } {
  let calls = 0
  return {
    probe: () => {
      const answer = answers[Math.min(calls, answers.length - 1)]
      calls += 1
      if (!answer) throw new Error('no probe answer')
      return Promise.resolve(answer)
    },
    calls: () => calls,
  }
}

function waitOn(probe: () => Promise<ReadinessProbe>, timeoutMs = 2_000) {
  return awaitRuntimeReadiness({
    preflight: preflight(timeoutMs),
    probe,
    closed: () => false,
    diagnostics: () => ({ browserErrors: [] }),
  })
}

describe('Run Session readiness waits for the Render Backend (ADR 0025)', () => {
  it('is not ready while the bridge reports no backend, and is once it does', async () => {
    const fake = page([{ status: 'waiting' }, ready(null), ready(null), ready('webgl2')])

    const result = await waitOn(fake.probe)

    expect(fake.calls()).toBe(4)
    expect(result.initialSnapshot.backend).toBe('webgl2')
    expect(result.capabilities).toContain('render-backend')
  })

  it('does not wait for a backend from an engine without the render-backend capability', async () => {
    const fake = page([ready(null, ['assets'])])

    const result = await waitOn(fake.probe)

    expect(fake.calls()).toBe(1)
    expect(result.frame).toBe(0)
  })

  it('surfaces a renderer that failed to initialize as a runtime error naming it, not as a hang', async () => {
    const message = 'No Render Backend could initialize: neither webgpu nor webgl2 is available (no adapter).'
    const fake = page([ready(null), { status: 'failure', code: 'render-backend-failed', message }])

    const failure = await waitOn(fake.probe, 60_000).then(
      () => null,
      (error: unknown) => error,
    )

    expect(failure).toBeInstanceOf(RuntimeToolError)
    expect(failure).toMatchObject({
      body: { code: 'runtime-start-failed', stage: 'game', message },
    })
    expect(fake.calls()).toBe(2)
  })

  it('gives up within the operation timeout when the backend never arrives', async () => {
    const started = Date.now()

    const failure = await waitOn(page([ready(null)]).probe, 150).then(
      () => null,
      (error: unknown) => error,
    )

    expect(failure).toBeInstanceOf(RuntimeToolError)
    expect(failure).toMatchObject({ body: { code: 'runtime-start-failed', stage: 'game' } })
    expect(String((failure as RuntimeToolError).message)).toMatch(/Render Backend/)
    expect(Date.now() - started).toBeLessThan(2_000)
  })
})

describe('Run Session readiness waits for the physics module (issue #159 CA-8)', () => {
  it('surfaces a physics module that failed to load as a runtime error naming the package, not as a hang', async () => {
    const message = 'Physics failed to load: could not import @dimforge/rapier3d-deterministic-compat (wasm blocked)'
    const fake = page([ready(null), { status: 'failure', code: 'physics-backend-failed', message }])

    const failure = await waitOn(fake.probe, 60_000).then(
      () => null,
      (error: unknown) => error,
    )

    expect(failure).toBeInstanceOf(RuntimeToolError)
    expect(failure).toMatchObject({
      body: { code: 'runtime-start-failed', stage: 'game', message },
    })
  })
})
