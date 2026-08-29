import type { PrefabJson } from '@waica/engine'
import {
  ISO_PLAYER_STATE_GRAPH,
  NPC_STATE_GRAPH,
  PATROLLER_STATE_GRAPH,
} from '@waica/behaviors'

const SHIPPED_DIRECTIONS = ['n', 'ne', 'e', 'se', 's'] as const
/** One row per shipped facing: idle · walk×3 · attack×3 · hurt×2 · death×2. */
const SHEET_COLUMNS = 11
const SOUTH_ROW = SHIPPED_DIRECTIONS.indexOf('s') * SHEET_COLUMNS
/** Transparent texels under the boots in every Puny cell, in render units (9 / 16). */
const BOOTS_OFFSET = -9 / 16

interface CharacterClips {
  /** A plain, facing-less idle/walk pair for characters without a facing provider. */
  plain?: boolean
  /** Whether this character swings a weapon. */
  attacks?: boolean
}

type ClipMap = Record<string, { frames: number[]; fps: number; loop?: boolean }>

function directionalClips({ plain = false, attacks = false }: CharacterClips): ClipMap {
  const clips: ClipMap = {}
  SHIPPED_DIRECTIONS.forEach((direction, row) => {
    const first = row * SHEET_COLUMNS
    clips[`idle-${direction}`] = { frames: [first], fps: 2 }
    clips[`walk-${direction}`] = {
      frames: [first + 1, first + 2, first + 3, first + 2],
      fps: 8,
    }
    if (attacks) {
      clips[`attack-${direction}`] = { frames: [first + 4, first + 5, first + 6], fps: 12, loop: false }
    }
    clips[`hurt-${direction}`] = { frames: [first + 7, first + 8], fps: 8, loop: false }
    clips[`death-${direction}`] = { frames: [first + 9, first + 10], fps: 4, loop: false }
  })
  if (plain) {
    clips['idle'] = { frames: [SOUTH_ROW], fps: 2 }
    clips['walk'] = { frames: [SOUTH_ROW + 1, SOUTH_ROW + 2, SOUTH_ROW + 3, SOUTH_ROW + 2], fps: 8 }
  }
  return clips
}

function characterSprite(texture: string, options: CharacterClips = {}) {
  return {
    texture,
    cols: SHEET_COLUMNS,
    rows: 5,
    spacingX: 1,
    spacingY: 1,
    pixelArt: true,
    width: 2,
    height: 2,
    anchorY: 0,
    // The Puny bodies stand 9 texels above their cell's bottom edge; shift the
    // quad down so the boots sit on the entity's position (its footprint),
    // instead of floating half a unit up the screen — over a water diamond
    // the body is actually stopped short of.
    offsetY: BOOTS_OFFSET,
    clips: directionalClips(options),
    initialClip: options.plain ? 'idle' : 'idle-s',
  }
}

export const ISOMETRIC_HERO_SPRITE = characterSprite('waica:iso-hero', { attacks: true })

const MAP_WIDTH = 16
const MAP_HEIGHT = 16
const GRASS = 0
const DIRT = 1
const PATH = 2
const WATER = 3
const BORDER = 4

function tileAt(column: number, row: number): number {
  if (column === 0 || row === 0 || column === MAP_WIDTH - 1 || row === MAP_HEIGHT - 1) {
    return BORDER
  }
  if (column >= 11 && column <= 12 && row >= 5 && row <= 6) return WATER
  if (column === 7 || row === 7) return PATH
  if (column >= 2 && column <= 5 && row >= 2 && row <= 4) return DIRT
  return GRASS
}

const GROUND_CELLS = Array.from({ length: MAP_WIDTH * MAP_HEIGHT }, (_, index) =>
  tileAt(index % MAP_WIDTH, Math.floor(index / MAP_WIDTH)),
)

export const ISOMETRIC_PREFABS: Record<string, PrefabJson> = {
  'characters/player': {
    waicaPrefab: 1,
    type: 'character',
    components: [
      { type: 'AnimatedSprite', props: ISOMETRIC_HERO_SPRITE },
      { type: 'IsoMotor' },
      {
        type: 'StateMachine',
        props: {
          role: 'player',
          initial: ISO_PLAYER_STATE_GRAPH.initial,
          states: ISO_PLAYER_STATE_GRAPH.states,
        },
      },
      { type: 'Hitbox', props: { width: 0.8, height: 0.8 } },
      { type: 'MeleeAttack' },
      { type: 'Respawnable' },
      { type: 'Health', props: { max: 3, invulnerability: 1, stat: 'health' } },
    ],
  },
  'characters/villager': {
    waicaPrefab: 1,
    type: 'character',
    components: [
      {
        type: 'AnimatedSprite',
        props: characterSprite('waica:iso-villager', { plain: true }),
      },
      {
        type: 'StateMachine',
        props: {
          role: 'npc',
          initial: NPC_STATE_GRAPH.initial,
          states: NPC_STATE_GRAPH.states,
        },
      },
      { type: 'Interactable', props: { line: 'Welcome to Diamond Meadow!', radius: 1.5 } },
      { type: 'Solid', props: { width: 0.8, height: 0.6 } },
    ],
  },
  'characters/orc': {
    waicaPrefab: 1,
    type: 'character',
    components: [
      {
        type: 'AnimatedSprite',
        props: {
          ...characterSprite('waica:iso-orc', { attacks: true }),
          // Patrol reports facing, so the orc resolves directional clips
          // from the first frame: it starts down its rail, screen south-east.
          initialClip: 'walk-se',
        },
      },
      { type: 'Patrol', props: { axis: 'horizontal', distance: 2, speed: 2 } },
      {
        type: 'StateMachine',
        props: {
          role: 'patroller',
          initial: PATROLLER_STATE_GRAPH.initial,
          states: PATROLLER_STATE_GRAPH.states,
        },
      },
      { type: 'Hitbox', props: { width: 0.8, height: 0.7 } },
      { type: 'Hazard', props: { stompable: false, contactDamage: 1 } },
      { type: 'Health', props: { max: 2, invulnerability: 0.3 } },
    ],
  },
  'objects/crate': {
    waicaPrefab: 1,
    type: 'object',
    components: [
      {
        type: 'Sprite',
        props: {
          texture: 'waica:iso-crate',
          pixelArt: true,
          width: 1,
          height: 1,
          anchorY: 0,
        },
      },
      { type: 'Hitbox', props: { width: 0.6, height: 0.6 } },
      { type: 'Collectible', props: { value: 1 } },
    ],
  },
  'objects/tree': {
    waicaPrefab: 1,
    type: 'object',
    components: [
      {
        type: 'Sprite',
        props: {
          texture: 'waica:iso-tree',
          pixelArt: true,
          width: 2,
          height: 47 / 16,
          anchorY: 0,
        },
      },
      { type: 'Solid', props: { width: 0.8, height: 0.6 } },
    ],
  },
  'objects/rock': {
    waicaPrefab: 1,
    type: 'object',
    components: [
      {
        type: 'Sprite',
        props: {
          texture: 'waica:iso-rock',
          pixelArt: true,
          width: 1,
          height: 1,
          anchorY: 0,
        },
      },
      { type: 'Solid', props: { width: 0.8, height: 0.6 } },
    ],
  },
  'tiles/ground': {
    waicaPrefab: 1,
    type: 'tile',
    components: [
      {
        type: 'Tilemap',
        props: {
          texture: 'waica:iso-ground',
          cols: 5,
          rows: 1,
          spacingX: 1,
          spacingY: 1,
          cellWidth: 64,
          cellHeight: 32,
          pixelArt: true,
          mapWidth: MAP_WIDTH,
          mapHeight: MAP_HEIGHT,
          cellSize: 1,
          cells: GROUND_CELLS,
          solidTiles: [WATER, BORDER],
          layer: -2,
        },
      },
    ],
  },
}
