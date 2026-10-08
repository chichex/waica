import type { PrefabJson, SceneJson } from '@waica/engine'

/** The dungeon's ground: 10×10, a stone floor (`tiles/ground` index 4) and walls. */
export const ISOMETRIC_DUNGEON_MAP_WIDTH = 10
export const ISOMETRIC_DUNGEON_MAP_HEIGHT = 10
/** The grey stone with a cross: the floor. */
const STONE = 4
/** Under every wall cube: flat dirt nobody sees, the dungeon's only solid tile. */
const WALL = 1
/** The wall between the torch-lit hall and the dark chamber, open at its far end. */
const WALL_COLUMN = 5
const WALL_GAP_ROW = 8

function isWall(column: number, row: number): boolean {
  const width = ISOMETRIC_DUNGEON_MAP_WIDTH
  const height = ISOMETRIC_DUNGEON_MAP_HEIGHT
  if (column === 0 || row === 0 || column === width - 1 || row === height - 1) return true
  return column === WALL_COLUMN && row !== WALL_GAP_ROW
}

export const ISOMETRIC_DUNGEON_GROUND_CELLS = Array.from(
  { length: ISOMETRIC_DUNGEON_MAP_WIDTH * ISOMETRIC_DUNGEON_MAP_HEIGHT },
  (_, index) =>
    isWall(index % ISOMETRIC_DUNGEON_MAP_WIDTH, Math.floor(index / ISOMETRIC_DUNGEON_MAP_WIDTH)) ? WALL : STONE,
)

/** One wall cube per solid cell, on the cell's centre (the Tilemap draws only flat cells). */
function wallEntities(): SceneJson['entities'] {
  return ISOMETRIC_DUNGEON_GROUND_CELLS.flatMap((tile, index) => {
    if (tile !== WALL) return []
    const column = index % ISOMETRIC_DUNGEON_MAP_WIDTH
    const row = Math.floor(index / ISOMETRIC_DUNGEON_MAP_WIDTH)
    return [{ name: `Wall-${column}-${row}`, prefab: 'objects/wall', position: [column + 0.5, row + 0.5] as [number, number] }]
  })
}

/**
 * A stone wall cube (hawkbirdtree, CC0): 64×64 at 32 texels per unit, so its
 * base diamond is exactly one cell; anchorY 0.25 sets the base diamond's
 * centre on the entity. Collision and occlusion come from the cell's solid
 * tile, not from this Sprite.
 */
export const ISOMETRIC_WALL_PREFAB: PrefabJson = {
  waicaPrefab: 1,
  type: 'object',
  components: [
    { type: 'Sprite', props: { texture: 'waica:iso-wall', pixelArt: true, width: 2, height: 2, anchorY: 0.25 } },
  ],
}

/**
 * A torch (issue #78; art "Animated Pixel Torch" by XLIVE99, CC0): six 32×32
 * frames, Emissive so the flame stays bright whatever the Ambient Light, and
 * a warm Light that the walls stop — a pool of light, not the whole room.
 */
export const ISOMETRIC_TORCH_PREFAB: PrefabJson = {
  waicaPrefab: 1,
  type: 'object',
  components: [
    {
      type: 'AnimatedSprite',
      props: {
        texture: 'waica:iso-torch',
        cols: 3,
        rows: 2,
        pixelArt: true,
        width: 1,
        height: 1,
        anchorY: 2 / 32,
        clips: { burn: { frames: [0, 1, 2, 3, 4, 5], fps: 8 } },
        initialClip: 'burn',
        emissive: true,
      },
    },
    {
      type: 'Light',
      props: { radius: 3, color: 0xffb366, intensity: 1, softness: 0.25 },
    },
  ],
}

/**
 * The third demo scene (issue #78 CA-14): a dark dungeon reached from the
 * cave. Two torches on the floor light the hall; the wall down its middle
 * keeps the chamber behind it dark, and a vignette closes the frame. A fixed
 * camera frames the whole room.
 */
export const ISOMETRIC_DUNGEON_SCENE: SceneJson = {
  waicaScene: 3,
  render: {
    sort: 'y',
    projection: 'isometric',
    lighting: { ambient: { color: '#5a6a9a', intensity: 0.3 } },
    post: { vignette: { intensity: 0.45, radius: 0.35 } },
  },
  camera: { position: [0, -5], zoom: 12 },
  entities: [
    {
      name: 'Ground',
      prefab: 'tiles/ground',
      position: [0, 0],
      overrides: {
        Tilemap: {
          mapWidth: ISOMETRIC_DUNGEON_MAP_WIDTH,
          mapHeight: ISOMETRIC_DUNGEON_MAP_HEIGHT,
          cells: ISOMETRIC_DUNGEON_GROUND_CELLS,
          solidTiles: [WALL],
        },
      },
    },
    { name: 'Player', prefab: 'characters/player', position: [2, 8] },
    { name: 'Torch-1', prefab: 'objects/torch', position: [3.5, 3.5] },
    { name: 'Torch-2', prefab: 'objects/torch', position: [3.5, 5.5] },
    {
      name: 'Door',
      prefab: 'objects/door',
      position: [1.5, 1.5],
      overrides: { SceneTransition: { scene: 'cave' } },
    },
    ...wallEntities(),
  ],
  ui: ['health'],
}
