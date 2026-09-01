import type { SceneCameraJson, SceneJson } from '@waica/engine'
import {
  ISOMETRIC_CAVE_GROUND_CELLS,
  ISOMETRIC_CAVE_MAP_HEIGHT,
  ISOMETRIC_CAVE_MAP_WIDTH,
} from './prefabs.js'

/**
 * Full-map framing plus a follow feel tuned for the diamond: a tight dead
 * zone and no horizontal lookahead (the engine's step kicks in every time
 * the player crosses walking speed, which lurches on short runs), a little
 * vertical lead, and softer smoothing than the platformer default.
 */
function isometricCamera(): SceneCameraJson {
  return {
    position: [0, -8],
    zoom: 12,
    limits: { minX: -16, maxX: 16, minY: -16, maxY: 0 },
    deadzoneWidth: 0.5,
    deadzoneHeight: 0.5,
    lookahead: 0,
    lookaheadY: 0.5,
    smoothing: 4,
  }
}

/** A logical 16x16 meadow projected into a 2:1 diamond at render time. */
export const ISOMETRIC_SCENE: SceneJson = {
  waicaScene: 3,
  render: { sort: 'y', projection: 'isometric' },
  camera: {
    ...isometricCamera(),
    follow: 'Player',
  },
  entities: [
    { name: 'Ground', prefab: 'tiles/ground', position: [0, 0] },
    { name: 'Player', prefab: 'characters/player', position: [8, 8] },
    {
      name: 'Villager',
      prefab: 'characters/villager',
      position: [6, 9],
      overrides: { Interactable: { line: 'The water sparkles, but it blocks the trail.' } },
    },
    {
      name: 'Orc',
      prefab: 'characters/orc',
      position: [10, 10],
      overrides: { Patrol: { axis: 'horizontal', distance: 2.5, speed: 1.5 } },
    },
    { name: 'Crate-1', prefab: 'objects/crate', position: [5, 6] },
    { name: 'Crate-2', prefab: 'objects/crate', position: [10, 4] },
    { name: 'Crate-3', prefab: 'objects/crate', position: [12, 10] },
    { name: 'Tree-1', prefab: 'objects/tree', position: [4, 10] },
    { name: 'Tree-2', prefab: 'objects/tree', position: [10, 12] },
    { name: 'Tree-3', prefab: 'objects/tree', position: [12, 3] },
    { name: 'Rock-1', prefab: 'objects/rock', position: [5, 11] },
    { name: 'Rock-2', prefab: 'objects/rock', position: [9, 4] },
    // The Scene Transition into the second demo scene: tucked in the
    // north-west corner, well clear of every other prop, of the player's
    // start-area walking radius, and of the click-to-move destinations the
    // isometric e2e leg exercises (CA-13) — a Door placed inside any of
    // those previously fired mid-test.
    { name: 'Door', prefab: 'objects/door', position: [2, 2] },
  ],
  ui: ['crate-counter', 'health'],
}

/** Blank projects retain the diamond grid and full-map framing. */
export const ISOMETRIC_BLANK_SCENE: SceneJson = {
  waicaScene: 3,
  render: { sort: 'y', projection: 'isometric' },
  camera: isometricCamera(),
  entities: [],
}

/**
 * The second demo scene (CA-13): a smaller, enclosed cave — reusing
 * `tiles/ground`'s texture with a distinct, smaller layout (an
 * entity-level Tilemap override, no new asset) so it reads as a different
 * map at a glance. The incoming Player is authored here, not carried from
 * `main` (grill decision 18): crossing back through the Door lands at this
 * scene's own entry, not beside where the player left.
 */
export const ISOMETRIC_CAVE_SCENE: SceneJson = {
  waicaScene: 3,
  render: { sort: 'y', projection: 'isometric' },
  camera: {
    ...isometricCamera(),
    position: [0, -5],
    limits: { minX: -10, maxX: 10, minY: -10, maxY: 0 },
    follow: 'Player',
  },
  entities: [
    {
      name: 'Ground',
      prefab: 'tiles/ground',
      position: [0, 0],
      overrides: {
        Tilemap: {
          mapWidth: ISOMETRIC_CAVE_MAP_WIDTH,
          mapHeight: ISOMETRIC_CAVE_MAP_HEIGHT,
          cells: ISOMETRIC_CAVE_GROUND_CELLS,
        },
      },
    },
    { name: 'Player', prefab: 'characters/player', position: [2, 7] },
    { name: 'Rock-1', prefab: 'objects/rock', position: [7, 3] },
    { name: 'Rock-2', prefab: 'objects/rock', position: [2, 2] },
    // Returns to the meadow, clear of the cave's rocks and water pool.
    {
      name: 'Door',
      prefab: 'objects/door',
      position: [8, 2],
      overrides: { SceneTransition: { scene: 'main' } },
    },
  ],
  ui: ['health'],
}
