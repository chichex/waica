// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MemFS } from '../fs/project-fs'
import type { LoadedProject } from './use-project-restore'
import { useProjectRestore } from './use-project-restore'

// Project code loading shares process-wide state (Monaco models keyed by
// path, the previous run's module URLs), so two loads must never overlap.
const runner = vi.hoisted(() => ({ active: 0, maxActive: 0, transpiles: 0 }))

vi.mock('./play-runner', () => ({
  transpile: async (source: string) => {
    runner.transpiles += 1
    runner.active += 1
    runner.maxActive = Math.max(runner.maxActive, runner.active)
    await new Promise((resolve) => setTimeout(resolve, 5))
    runner.active -= 1
    return source
  },
  createModule: () => Promise.resolve('data:text/javascript,'),
  execute: () => Promise.resolve({}),
  reset: () => {},
}))

const GAME = JSON.stringify({ waicaGame: 1, archetype: 'platformer', resolution: { mode: 'fill', width: 640, height: 360 } })

afterEach(() => {
  runner.active = 0
  runner.maxActive = 0
  runner.transpiles = 0
})

describe('useProjectRestore under StrictMode', () => {
  it('loads the project code once, without overlapping runs, and reports one loaded project', async () => {
    const fs = new MemFS('strict-project', { 'src/game.json': GAME, 'src/components/a.ts': 'export {}' })
    const loaded: LoadedProject[] = []
    renderHook(
      () =>
        useProjectRestore(fs, { openScenePath: null, view: null }, {
          onLoaded: (project) => loaded.push(project),
          onFailed: (message) => {
            throw new Error(message)
          },
        }),
      { reactStrictMode: true },
    )

    await vi.waitFor(() => expect(loaded).toHaveLength(1))
    expect(runner.maxActive).toBe(1)
    expect(runner.transpiles).toBe(1)
  })
})
