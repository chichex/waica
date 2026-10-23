import { Animator, Model, StateMachine, Sun, type SceneEntityJson } from '@waica/engine'
import rigUrl from '../../../engine/fixtures/rig.glb?url'
import type { ScenarioPlan } from './scenarios.ts'

const SKINNED_STEPS = 60
/** Characters per row of the grid they stand on. */
const ROW = 10
const SPACING = 1.6

/** Slot `index` of a `ROW`-wide grid on the ground, centred on the origin and receding from the camera. */
function characterPosition(index: number, count: number): [number, number, number] {
  const rows = Math.ceil(count / ROW)
  const column = index % ROW
  const row = Math.floor(index / ROW)
  return [(column - (ROW - 1) / 2) * SPACING, 0, (row - (rows - 1) / 2) * SPACING]
}

/**
 * `n` of the engine's rig on the grid under a Sun, each its own SkeletonUtils
 * clone with an Animator of the given props, run for 60 Simulation Steps: the
 * scene skinned-characters and blended-characters share, so their counters
 * cannot drift apart. The rig is one file, preloaded before the run.
 * StateMachine is registered because the Animator updates after it.
 */
export function rigCrowd(n: number, animator: Record<string, unknown>): ScenarioPlan {
  const sun: SceneEntityJson = {
    name: 'Daylight',
    components: [{ type: 'Sun', props: { direction: [-0.5, -1, -0.35], intensity: 3 } }],
  }
  const characters: SceneEntityJson[] = Array.from({ length: n }, (_, i) => ({
    name: `Character-${i}`,
    position: characterPosition(i, n),
    components: [{ type: 'Model', props: { src: rigUrl } }, { type: 'Animator', props: animator }],
  }))
  return {
    scene: {
      waicaScene: 3,
      render: { space: '3d', shadows: { quality: 'off' } },
      camera: { kind: 'perspective', position: [0, 14, 30], target: [0, 1, 0], fov: 50 },
      entities: [sun, ...characters],
    },
    registry: { components: { Model, Animator, StateMachine, Sun } },
    preload: [rigUrl],
    steps: SKINNED_STEPS,
  }
}

/**
 * Issue #166 CA-19: `n` skinned characters, each Animator walking from the
 * start, so the benchmark measures the mixers advancing every Simulation Step
 * and drawing `n` SkinnedMeshes: the counters are `meshes` and `drawCalls` n,
 * `geometries` and `materials` 1 (the clones share them).
 */
export function skinnedCharacters(n: number): ScenarioPlan {
  return rigCrowd(n, { initialClip: 'walk' })
}
