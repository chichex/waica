import { Animator, Model, StateMachine, Sun, type Game, type SceneEntityJson } from '@waica/engine'
import rigUrl from '../../../engine/fixtures/rig.glb?url'
import type { ScenarioPlan } from './scenarios.ts'
import { characterPosition } from './skinned-characters.ts'

const BLENDED_STEPS = 60
/** The rig's three clips on one parameter, phase-synced, with no smoothing: idle at 0, walk at 1, jump at 2. */
const MOVE = { param: 'speed', points: [{ clip: 'idle', at: 0 }, { clip: 'walk', at: 1 }, { clip: 'jump', at: 2 }], smoothing: 0 }

/** Character `index`'s speed: 0.5, 1 and 1.5 in turn: idle and walk half and half, walk alone, walk and jump half and half. */
export function characterSpeed(index: number): number {
  return 0.5 + (index % 3) * 0.5
}

/**
 * Issue #205 CA-25: `n` skinned characters like skinned-characters, each
 * Animator playing a 1D blend of the rig's three clips from the start, its
 * speed set on the first step, so the benchmark measures the blend's own
 * actions (three per entity, one or two weighing), their shared phase and
 * the mixer drawing `n` SkinnedMeshes. The counters are skinned-characters':
 * `meshes` and `drawCalls` n, `geometries` and `materials` 1.
 */
export function blendedCharacters(n: number): ScenarioPlan {
  const sun: SceneEntityJson = {
    name: 'Daylight',
    components: [{ type: 'Sun', props: { direction: [-0.5, -1, -0.35], intensity: 3 } }],
  }
  const characters: SceneEntityJson[] = Array.from({ length: n }, (_, i) => ({
    name: `Character-${i}`,
    position: characterPosition(i, n),
    components: [{ type: 'Model', props: { src: rigUrl } }, { type: 'Animator', props: { initialClip: 'Move', blends: { Move: MOVE } } }],
  }))
  return {
    scene: {
      waicaScene: 3,
      render: { space: '3d' },
      camera: { kind: 'perspective', position: [0, 14, 30], target: [0, 1, 0], fov: 50 },
      entities: [sun, ...characters],
    },
    registry: { components: { Model, Animator, StateMachine, Sun } },
    preload: [rigUrl],
    steps: BLENDED_STEPS,
    perStep: (game: Game, step: number) => {
      if (step !== 1) return
      for (let i = 0; i < n; i += 1) game.find(`Character-${i}`)?.get(Animator)?.setParam('speed', characterSpeed(i))
    },
  }
}
