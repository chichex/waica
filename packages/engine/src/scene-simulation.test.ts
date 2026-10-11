import { describe, expect, it } from 'vitest'
import { DEFAULT_GRAVITY, resolveSceneSimulation, sceneSimulationIssues } from './scene-simulation.js'

describe('resolveSceneSimulation (CA-12)', () => {
  it('defaults gravity to earth pulling down the y axis', () => {
    expect(DEFAULT_GRAVITY).toEqual([0, -9.81, 0])
    expect(resolveSceneSimulation(undefined)).toEqual({ gravity: [0, -9.81, 0] })
    expect(resolveSceneSimulation({})).toEqual({ gravity: [0, -9.81, 0] })
  })

  it('reads a declared gravity', () => {
    expect(resolveSceneSimulation({ gravity: [0, -1.62, 0] })).toEqual({ gravity: [0, -1.62, 0] })
  })

  it('falls back to the default for a gravity that is not three finite numbers', () => {
    expect(resolveSceneSimulation({ gravity: [0, 'down', 0] } as never)).toEqual({ gravity: [0, -9.81, 0] })
    expect(resolveSceneSimulation({ gravity: [0, -9.81] } as never)).toEqual({ gravity: [0, -9.81, 0] })
    expect(resolveSceneSimulation({ gravity: [0, Number.NaN, 0] })).toEqual({ gravity: [0, -9.81, 0] })
  })

  it('hands out a gravity the caller may not mutate into the default', () => {
    const first = resolveSceneSimulation(undefined)
    first.gravity[1] = 5
    expect(resolveSceneSimulation(undefined).gravity).toEqual([0, -9.81, 0])
  })
})

describe('sceneSimulationIssues (CA-12)', () => {
  const fields = (simulation: unknown, space: '2d' | '3d'): string[] =>
    sceneSimulationIssues(simulation, space).map((issue) => issue.field)

  it('accepts no block and a valid gravity in a 3d scene', () => {
    expect(fields(undefined, '3d')).toEqual([])
    expect(fields({}, '3d')).toEqual([])
    expect(fields({ gravity: [0, -9.81, 0] }, '3d')).toEqual([])
    expect(fields({ gravity: [0, 0, 0] }, '3d')).toEqual([])
  })

  it('reports a gravity that is not three finite numbers', () => {
    expect(fields({ gravity: [0, -9.81] }, '3d')).toEqual(['simulation.gravity'])
    expect(fields({ gravity: [0, 'x', 0] }, '3d')).toEqual(['simulation.gravity'])
    expect(fields({ gravity: [0, Number.POSITIVE_INFINITY, 0] }, '3d')).toEqual(['simulation.gravity'])
    expect(fields({ gravity: 9.81 }, '3d')).toEqual(['simulation.gravity'])
    expect(sceneSimulationIssues({ gravity: [1] }, '3d')[0]?.message).toContain('three finite numbers')
  })

  it('reports any simulation block in a 2d scene, and only that', () => {
    expect(fields(undefined, '2d')).toEqual([])
    expect(fields({}, '2d')).toEqual(['simulation'])
    expect(fields({ gravity: [0, 'x', 0] }, '2d')).toEqual(['simulation'])
    expect(sceneSimulationIssues({ gravity: [0, -9.81, 0] }, '2d')[0]?.message).toContain('3d')
  })
})
