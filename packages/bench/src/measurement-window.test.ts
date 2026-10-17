import { expect, it } from 'vitest'
import { holdRendererCounters, measureWindow } from './measurement-window.ts'

it('warms rendering without simulation and measures only synchronized Simulation Steps', async () => {
  let steps = 0
  let draws = 0
  let synced = 0
  const observations: number[] = []
  const result = await measureWindow({
    warmupFrames: 5, steps: 60,
    render: () => { draws++ },
    step: () => { steps++; draws += 3; return 3 },
    sync: () => { synced++; return Promise.resolve() },
    observe: () => { observations.push(steps) },
  })
  expect({ steps, draws, synced }).toEqual({ steps: 60, draws: 185, synced: 65 })
  expect(observations).toEqual(Array.from({ length: 60 }, (_, index) => index + 1))
  expect(result.frameMs).toHaveLength(60)
  expect(result.drawCalls).toBe(3)
})

it('holds automatic renderer resets only during the measurement scope and restores the original setting', () => {
  const renderer = { info: { autoReset: true } }
  const release = holdRendererCounters(renderer)
  expect(renderer.info.autoReset).toBe(false)
  release()
  expect(renderer.info.autoReset).toBe(true)
  expect(() => holdRendererCounters({ info: {} })).toThrow(/autoReset/)
})
