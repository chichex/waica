import { Animator, type Game } from '@waica/engine'
import type { ScenarioPlan } from './scenarios.ts'
import { rigCrowd } from './skinned-characters.ts'

/** The rig's three clips on one parameter, phase-synced, with no smoothing: idle at 0, walk at 1, jump at 2. */
const MOVE = { param: 'speed', points: [{ clip: 'idle', at: 0 }, { clip: 'walk', at: 1 }, { clip: 'jump', at: 2 }], smoothing: 0 }

/** Character `index`'s speed: 0.5, 1 and 1.5 in turn: idle and walk half and half, walk alone, walk and jump half and half. */
export function characterSpeed(index: number): number {
  return 0.5 + (index % 3) * 0.5
}

/**
 * Issue #205 CA-25: skinned-characters' scene (rigCrowd), each Animator
 * playing a 1D blend of the rig's three clips from the start. Each speed is
 * set in step 1's host update, after the Animators ran, so the blend mixes
 * from step 2 on (step 1 plays idle, its speed still 0): the benchmark
 * measures the blend's own actions (three per entity, one or two weighing),
 * their shared phase and the mixer drawing `n` SkinnedMeshes. The counters
 * are skinned-characters': `meshes` and `drawCalls` n, `geometries` and
 * `materials` 1.
 */
export function blendedCharacters(n: number): ScenarioPlan {
  return {
    ...rigCrowd(n, { initialClip: 'Move', blends: { Move: MOVE } }),
    perStep: (game: Game, step: number) => {
      if (step !== 1) return
      for (let i = 0; i < n; i += 1) game.find(`Character-${i}`)?.get(Animator)?.setParam('speed', characterSpeed(i))
    },
  }
}
