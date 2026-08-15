import type { PrefabJson } from '@waica/engine'
import { NPC_STATE_GRAPH, TOPDOWN_PLAYER_STATE_GRAPH } from '@waica/behaviors'
import { HERO_SPRITE } from './scene-default.js'

/**
 * The archetype's reusable entity templates, keyed by ref ('tiles/tree').
 * Scenes reference these and override per-entity props; the palette derives
 * its pieces from this catalog.
 *
 * Ground tiles draw on negative layers so the y-sort pass never weaves
 * them between characters: meadow (-2), then decor tiles (-1), then
 * everything that occludes at 0.
 */
export const TOPDOWN_PREFABS: Record<string, PrefabJson> = {
  'characters/player': {
    waicaPrefab: 1,
    type: 'character',
    components: [
      { type: 'AnimatedSprite', props: HERO_SPRITE },
      { type: 'TopDownMotor' },
      {
        type: 'StateMachine',
        props: {
          role: 'player',
          initial: TOPDOWN_PLAYER_STATE_GRAPH.initial,
          states: TOPDOWN_PLAYER_STATE_GRAPH.states,
        },
      },
      { type: 'Hitbox', props: { width: 0.8, height: 0.8 } },
      { type: 'Respawnable' },
      { type: 'Health', props: { max: 3, invulnerability: 1 } },
    ],
  },
  'characters/villager': {
    waicaPrefab: 1,
    type: 'character',
    components: [
      {
        type: 'AnimatedSprite',
        props: {
          texture: 'waica:npc',
          cols: 3,
          rows: 3,
          spacingX: 1,
          spacingY: 1,
          width: 1.2,
          height: 1.2,
          clips: {
            // The plain 'idle' is what a code-free NPC plays (it has no
            // facing provider); the directional clips are ready for the
            // day a project gives it a motor.
            idle: { frames: [0], fps: 2 },
            'idle-s': { frames: [0], fps: 2 },
            'idle-n': { frames: [3], fps: 2 },
            'idle-e': { frames: [6], fps: 2 },
            'walk-s': { frames: [1, 0, 2, 0], fps: 8 },
            'walk-n': { frames: [4, 3, 5, 3], fps: 8 },
            'walk-e': { frames: [7, 6, 8, 6], fps: 8 },
          },
          initialClip: 'idle',
        },
      },
      {
        type: 'StateMachine',
        props: {
          role: 'npc',
          initial: NPC_STATE_GRAPH.initial,
          states: NPC_STATE_GRAPH.states,
        },
      },
      { type: 'Interactable', props: { line: 'Hello, traveler!', radius: 1.5 } },
      // Villagers block the way like any solid prop.
      { type: 'Solid', props: { width: 0.8, height: 0.5 } },
    ],
  },
  'characters/blob': {
    waicaPrefab: 1,
    type: 'character',
    components: [
      {
        type: 'AnimatedSprite',
        props: {
          texture: 'waica:blob',
          cols: 1,
          rows: 1,
          width: 1,
          height: 1,
          clips: { idle: { frames: [0], fps: 2 } },
          initialClip: 'idle',
        },
      },
      { type: 'Patrol', props: { distance: 2, speed: 2 } },
      {
        type: 'StateMachine',
        props: {
          role: 'patroller',
          initial: 'walk',
          states: { walk: { clip: 'idle' } },
        },
      },
      { type: 'Hitbox', props: { width: 0.8, height: 0.7 } },
      // No stomping without gravity: any contact hurts.
      { type: 'Hazard', props: { stompable: false, contactDamage: 1 } },
    ],
  },
  'objects/potion': {
    waicaPrefab: 1,
    type: 'object',
    components: [
      {
        type: 'AnimatedSprite',
        props: {
          texture: 'waica:potion',
          cols: 1,
          rows: 1,
          width: 0.7,
          height: 0.7,
          clips: { idle: { frames: [0], fps: 2 } },
          initialClip: 'idle',
        },
      },
      { type: 'Hitbox', props: { width: 0.5, height: 0.5 } },
      { type: 'Collectible', props: { value: 1 } },
    ],
  },
  'tiles/meadow': {
    waicaPrefab: 1,
    type: 'tile',
    components: [
      // The ground plane: a flat field the size you stretch it to, in the
      // grass sheet's dominant green so textured tiles blend on top.
      { type: 'Sprite', props: { width: 1, height: 1, color: 0x38cbab, layer: -2 } },
    ],
  },
  'tiles/grass': {
    waicaPrefab: 1,
    type: 'tile',
    components: [
      { type: 'Sprite', props: { texture: 'waica:grass', width: 1, height: 1, layer: -1 } },
    ],
  },
  'tiles/path': {
    waicaPrefab: 1,
    type: 'tile',
    components: [
      { type: 'Sprite', props: { texture: 'waica:path', width: 1, height: 1, layer: -1 } },
    ],
  },
  'tiles/water': {
    waicaPrefab: 1,
    type: 'tile',
    components: [
      { type: 'Sprite', props: { texture: 'waica:water', width: 1, height: 1, layer: -1 } },
      { type: 'Solid', props: { width: 1, height: 1 } },
    ],
  },
  'tiles/fence': {
    waicaPrefab: 1,
    type: 'tile',
    components: [
      { type: 'Sprite', props: { texture: 'waica:fence', width: 1, height: 1 } },
      // Shorter than the art so the player can overlap the top rail a bit,
      // the way top-down fences read.
      { type: 'Solid', props: { width: 1, height: 0.6 } },
    ],
  },
  'tiles/tree': {
    waicaPrefab: 1,
    type: 'tile',
    components: [
      // Anchored at the trunk: the 1×2 canopy is drawn upward so the
      // entity Y — the y-sort key — is where the tree meets the ground.
      {
        type: 'Sprite',
        props: { texture: 'waica:tree', width: 1, height: 2, offsetY: 0.5 },
      },
      { type: 'Solid', props: { width: 0.8, height: 0.6 } },
    ],
  },
}
