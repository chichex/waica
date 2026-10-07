import { Light, Tilemap, type SceneEntityJson } from '@waica/engine'
import type { ScenarioPlan } from './scenarios.ts'

/** The walled map filling the default 10-unit-high view, one logical unit per cell. */
export const OCCLUSION_MAP = { width: 18, height: 10, originX: -9, originY: -5 }
const OPEN = 0
const WALL = 1
const LIGHT_STEPS = 60

/** Wall columns every four cells, each with a doorway every four rows: light leaks through the gaps. */
function tileAt(column: number, row: number): number {
  return column % 4 === 1 && row % 4 !== 0 ? WALL : OPEN
}

const CELLS = Array.from({ length: OCCLUSION_MAP.width * OCCLUSION_MAP.height }, (_, index) =>
  tileAt(index % OCCLUSION_MAP.width, Math.floor(index / OCCLUSION_MAP.width)),
)

/** Open cell centres in row-major order, the torches' candidate spots. */
function openCentres(): Array<[number, number]> {
  const centres: Array<[number, number]> = []
  for (let index = 0; index < CELLS.length; index += 1) {
    if (CELLS[index] !== OPEN) continue
    const column = index % OCCLUSION_MAP.width
    const row = Math.floor(index / OCCLUSION_MAP.width)
    centres.push([OCCLUSION_MAP.originX + column + 0.5, OCCLUSION_MAP.originY + row + 0.5])
  }
  return centres
}

/**
 * Issue #78 CA-16: `n` torches — soft-shadowed Lights, the costliest kind,
 * each walking the occluder grid nine times per texel — over one Tilemap
 * whose wall tiles occlude them. Lights are static: the cost is the
 * light-map's, frame after frame (inference 15).
 */
export function lightsOcclusion(n: number): ScenarioPlan {
  const centres = openCentres()
  const torches: SceneEntityJson[] = Array.from({ length: n }, (_, i) => ({
    name: `Torch-${i}`,
    position: centres[Math.floor(((i + 0.5) * centres.length) / n)] ?? [0, 0],
    components: [{ type: 'Light', props: { radius: 3, color: 0xffb366, intensity: 0.8, softness: 0.5, castShadows: true } }],
  }))
  const walls: SceneEntityJson = {
    name: 'Walls',
    position: [OCCLUSION_MAP.originX, OCCLUSION_MAP.originY],
    components: [{
      type: 'Tilemap',
      props: {
        mapWidth: OCCLUSION_MAP.width,
        mapHeight: OCCLUSION_MAP.height,
        cellSize: 1,
        cells: CELLS,
        solidTiles: [WALL],
        color: 0x8a8f99,
      },
    }],
  }
  return {
    scene: { waicaScene: 3, render: { lighting: { ambient: { intensity: 0.25 } } }, entities: [walls, ...torches] },
    registry: { components: { Tilemap, Light } },
    textures: [],
    steps: LIGHT_STEPS,
  }
}
