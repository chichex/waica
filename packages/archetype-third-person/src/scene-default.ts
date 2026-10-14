import type { PerspectiveSceneCameraJson, SceneEntityJson, SceneJson } from '@waica/engine'
import { BANNER_INSET } from './prefabs.js'

/**
 * The orbit camera every scene follows the Player with. `position`/`target`
 * frame the editor's first look: where the orbit starts behind a Player at
 * (0, 0, 3.5), whose camera then clears the south wall.
 */
function orbitCamera(): PerspectiveSceneCameraJson {
  return {
    kind: 'perspective',
    position: [0, 3.25, 9.14],
    target: [0, 1.2, 3.5],
    fov: 55,
    follow: 'Player',
    distance: 6,
    pitch: 20,
  }
}

/** What every scene shares: 3D, a cool ambient light, Rapier gravity, the orbit camera and the HUD. */
function threeDScene(entities: SceneEntityJson[]): SceneJson {
  return {
    waicaScene: 3,
    render: { space: '3d', lighting: { ambient: { color: '#b8c8ff', intensity: 0.55 } } },
    simulation: { gravity: [0, -9.81, 0] },
    camera: orbitCamera(),
    entities,
    ui: ['player-health', 'controls-hint'],
  }
}

const SUN: SceneEntityJson = { name: 'Sun', components: [{ type: 'Sun', props: { direction: [-0.5, -1, -0.35], intensity: 2.2 } }] }

/** Half the courtyard's side: 5 × 5 floor tiles of 4 units, walls on the edge. */
const HALF = 10
const TILE_CENTERS = [-8, -4, 0, 4, 8]

function floorTiles(): SceneEntityJson[] {
  return TILE_CENTERS.flatMap((x) =>
    TILE_CENTERS.map((z): SceneEntityJson => ({ name: `Floor ${x} ${z}`, prefab: 'tiles/floor', position: [x, 0, z] })),
  )
}

/**
 * Where a checkpoint's wall banner hangs from the yard's centre: BANNER_INSET
 * inside a wall whose inner face is HALF - 0.5 away (the wall pieces are 1
 * thick), so its cloth lies flush on it.
 */
const BANNER_AT = HALF - 0.5 + BANNER_INSET

/** The four sides of wall pieces, each turned to face the yard. */
function walls(): SceneEntityJson[] {
  return TILE_CENTERS.flatMap((at): SceneEntityJson[] => [
    { name: `Wall N ${at}`, prefab: 'tiles/wall', position: [at, 0, -HALF] },
    { name: `Wall S ${at}`, prefab: 'tiles/wall', position: [at, 0, HALF], rotation: [0, 180, 0] },
    { name: `Wall W ${at}`, prefab: 'tiles/wall', position: [-HALF, 0, at], rotation: [0, 90, 0] },
    { name: `Wall E ${at}`, prefab: 'tiles/wall', position: [HALF, 0, at], rotation: [0, -90, 0] },
  ])
}

/**
 * The three guards, all in the north half (maintainer decision on issue #181):
 * each patrol rail stays more than Chaser.range (7) from the spawn and from
 * both checkpoints, so the yard starts calm. Skeleton East paces north-south
 * beside the platform, guarding the step up to the chest.
 */
const SKELETONS: SceneEntityJson[] = [
  { name: 'Skeleton West', prefab: 'characters/skeleton', position: [-5, 0, -4.5] },
  { name: 'Skeleton East', prefab: 'characters/skeleton', position: [3, 0, -6], overrides: { Patrol: { axis: 'vertical' } } },
  { name: 'Skeleton Gate', prefab: 'characters/skeleton', position: [-1, 0, -7] },
]

/**
 * The demo (issue #181 CA-26): a walled dungeon courtyard. A raised platform
 * in the north-east corner, reached by a step, holds the goal chest; three
 * Skeleton Warriors patrol its north half; two checkpoints and four wall
 * torches; the Player starts in the south half, out of every skeleton's sight
 * (as both checkpoints are), with the camera behind it clear of the south wall.
 */
export const THIRD_PERSON_SCENE: SceneJson = threeDScene([
  SUN,
  ...floorTiles(),
  ...walls(),
  { name: 'Column West', prefab: 'tiles/column', position: [-6, 0, -6] },
  { name: 'Column East', prefab: 'tiles/column', position: [5, 0, 1] },
  { name: 'Platform', prefab: 'tiles/step', position: [6, 0, -6], scale: [2, 0.25, 2] },
  { name: 'Step', prefab: 'tiles/step', position: [6, 0, -2.6], scale: [1, 0.125, 1] },
  { name: 'Torch NW', prefab: 'tiles/torch', position: [-4, 2.5, -9.5] },
  { name: 'Torch NE', prefab: 'tiles/torch', position: [4, 2.5, -9.5] },
  { name: 'Torch SW', prefab: 'tiles/torch', position: [-4, 2.5, 9.5], rotation: [0, 180, 0] },
  { name: 'Torch SE', prefab: 'tiles/torch', position: [4, 2.5, 9.5], rotation: [0, 180, 0] },
  // Each banner hangs centred on a side wall's z 4 piece, turned like that wall to face the yard.
  { name: 'Checkpoint West', prefab: 'objects/checkpoint', position: [-BANNER_AT, 0, 4], rotation: [0, 90, 0] },
  { name: 'Checkpoint East', prefab: 'objects/checkpoint', position: [BANNER_AT, 0, 4], rotation: [0, -90, 0] },
  { name: 'Goal Chest', prefab: 'objects/goal-chest', position: [6, 0.5, -6] },
  ...SKELETONS,
  { name: 'Player', prefab: 'characters/player', position: [0, 0, 3.5] },
])

/** The blank scene (CA-26): a ground plane, a Sun, the playable Knight and the orbit camera. */
export const THIRD_PERSON_BLANK_SCENE: SceneJson = threeDScene([
  {
    name: 'Ground',
    scale: [24, 1, 24],
    components: [
      { type: 'Model', props: { shape: 'plane', color: '#5a6b4e' } },
      { type: 'Collider', props: { shape: 'box', size: [1, 1, 1], offset: [0, -0.5, 0], layer: 'world' } },
    ],
  },
  SUN,
  { name: 'Player', prefab: 'characters/player', position: [0, 0, 0] },
])
