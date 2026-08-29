import type { SceneCameraJson, SceneJson } from '@waica/engine'

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
