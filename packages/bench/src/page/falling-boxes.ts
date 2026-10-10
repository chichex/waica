import { Collider, Model, RigidBody, Sun, type SceneEntityJson } from '@waica/engine'
import type { ScenarioPlan } from './scenarios.ts'

const FALLING_BOXES_STEPS = 300
/** Boxes per side of one square layer of the lattice they start in. */
const LAYER_SIDE = 10
const SPACING = 1.5
const LAYER_HEIGHT = 1.6
const DROP = 2

/** The pose box `index` of the lattice starts in. */
interface BoxPose {
  position: [number, number, number]
  rotation: [number, number, number]
}

/**
 * Box `index` of the lattice, a few units above the floor: ten by ten per
 * layer, layers stacked above. Each box is nudged on x by its column and
 * layer and on z by its row and layer, and turned a few degrees about y, so
 * the boxes of one tower never share a footprint: the towers they fall into
 * wobble and topple instead of landing perfectly square (a nudge that
 * depended on the column alone left every tower aligned, PR #164 review).
 */
function boxPose(index: number): BoxPose {
  const column = index % LAYER_SIDE
  const row = Math.floor(index / LAYER_SIDE) % LAYER_SIDE
  const layer = Math.floor(index / (LAYER_SIDE * LAYER_SIDE))
  const nudgeX = (((column + 3 * layer) * 7) % 5) * 0.03
  const nudgeZ = (((row + 2 * layer) * 7) % 5) * 0.03
  const turn = ((index * 37) % 21) - 10
  return {
    position: [(column - (LAYER_SIDE - 1) / 2) * SPACING + nudgeX, DROP + layer * LAYER_HEIGHT, (row - (LAYER_SIDE - 1) / 2) * SPACING + nudgeZ],
    rotation: [0, turn, 0],
  }
}

/**
 * Issue #159 CA-24: `n` dynamic boxes fall onto a static floor in a 3D scene
 * (a Rapier world, ADR 0028), so the benchmark measures the physics step, the
 * sync of every body to its entity and drawing `n` Models. The counters are the
 * existing ones; the simulation is deterministic, so they are too.
 */
export function fallingBoxes(n: number): ScenarioPlan {
  const floor: SceneEntityJson = {
    name: 'Floor',
    position: [0, -0.5, 0],
    components: [{ type: 'Collider', props: { size: [40, 1, 40] } }],
  }
  const sun: SceneEntityJson = {
    name: 'Daylight',
    components: [{ type: 'Sun', props: { direction: [-0.5, -1, -0.35], intensity: 3 } }],
  }
  const boxes: SceneEntityJson[] = Array.from({ length: n }, (_, i) => ({
    name: `Box-${i}`,
    ...boxPose(i),
    components: [{ type: 'Model', props: { shape: 'box', color: 0xc89b3c } }, { type: 'Collider' }, { type: 'RigidBody' }],
  }))
  return {
    scene: {
      waicaScene: 3,
      render: { space: '3d' },
      camera: { kind: 'perspective', position: [0, 12, 26], target: [0, 4, 0], fov: 50 },
      entities: [floor, sun, ...boxes],
    },
    registry: { components: { Model, Sun, Collider, RigidBody } },
    textures: [],
    steps: FALLING_BOXES_STEPS,
  }
}
