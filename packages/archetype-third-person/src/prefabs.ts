import type { PrefabJson, SceneComponentJson, StateJson } from '@waica/engine'
import { CHARACTER_STATE_GRAPH, ENEMY_STATE_GRAPH } from '@waica/behaviors'

/** The clip each of a graph's states plays, over the graph's own states (issue #181 CA-24: exactly the clips the glbs keep). */
function withClips(states: Record<string, StateJson>, clips: Record<string, string>): Record<string, StateJson> {
  return Object.fromEntries(Object.entries(states).map(([name, state]) => [name, clips[name] ? { ...state, clip: clips[name] } : state]))
}

/** The Knight's clip for each `character` state (assets/ATTRIBUTION.md). */
export const KNIGHT_CLIPS: Readonly<Record<string, string>> = {
  idle: 'Idle',
  walk: 'Walking_A',
  run: 'Running_A',
  jump: 'Jump_Start',
  fall: 'Jump_Idle',
  attack: '1H_Melee_Attack_Chop',
  roll: 'Dodge_Forward',
  die: 'Death_A',
}

/** The Skeleton Warrior's clip for each `enemy` state (assets/ATTRIBUTION.md). */
export const SKELETON_CLIPS: Readonly<Record<string, string>> = {
  patrol: 'Walking_A',
  chase: 'Running_A',
  windup: '2H_Melee_Idle',
  attack: '1H_Melee_Attack_Chop',
  hurt: 'Hit_A',
  die: 'Death_A',
}

/** A fixed level piece's box Collider, standing on its position, on the `world` layer. */
function fixedBox(size: [number, number, number], offset: [number, number, number] = [0, size[1] / 2, 0]): SceneComponentJson {
  return { type: 'Collider', props: { shape: 'box', size, offset, layer: 'world' } }
}

/** A character's capsule standing on its position, on `layer`, whose melee reaches `strikes`. */
function capsule(height: number, layer: string, strikes: string): SceneComponentJson {
  return { type: 'Collider', props: { shape: 'capsule', radius: 0.5, height, offset: [0, height / 2, 0], layer, collidesWith: [strikes] } }
}

const PLAYER: PrefabJson = {
  waicaPrefab: 1,
  type: 'character',
  components: [
    { type: 'Model', props: { src: 'waica:tp-knight' } },
    {
      type: 'Animator',
      props: {
        initialClip: 'Idle',
        clips: { Jump_Start: { loop: false }, '1H_Melee_Attack_Chop': { loop: false }, Dodge_Forward: { loop: false }, Death_A: { loop: false } },
      },
    },
    { type: 'StateMachine', props: { role: 'player', initial: CHARACTER_STATE_GRAPH.initial, states: withClips(CHARACTER_STATE_GRAPH.states, KNIGHT_CLIPS) } },
    capsule(2.3, 'player', 'enemy'),
    { type: 'RigidBody', props: { type: 'kinematic' } },
    { type: 'CharacterMotor', props: { relativeTo: 'camera' } },
    { type: 'Health', props: { max: 6, invulnerability: 1 } },
    { type: 'MeleeAttack', props: { damage: 1, range: 1.6, width: 1.4 } },
    { type: 'Respawnable' },
    { type: 'OutOfBounds' },
    { type: 'HeartsHud' },
    { type: 'ControlsHint' },
    { type: 'HitShake' },
  ],
}

const SKELETON: PrefabJson = {
  waicaPrefab: 1,
  type: 'character',
  components: [
    { type: 'Model', props: { src: 'waica:tp-skeleton-warrior' } },
    {
      type: 'Animator',
      props: { initialClip: 'Walking_A', clips: { '1H_Melee_Attack_Chop': { loop: false }, Hit_A: { loop: false }, Death_A: { loop: false } } },
    },
    { type: 'StateMachine', props: { role: 'enemy', initial: ENEMY_STATE_GRAPH.initial, states: withClips(ENEMY_STATE_GRAPH.states, SKELETON_CLIPS) } },
    capsule(2.2, 'enemy', 'player'),
    { type: 'RigidBody', props: { type: 'kinematic' } },
    { type: 'Patrol', props: { axis: 'horizontal', distance: 2.5, speed: 1.5 } },
    { type: 'Chaser', props: { range: 7, speed: 3 } },
    { type: 'MeleeAttack', props: { damage: 1, range: 1.5, width: 1.4 } },
    { type: 'Health', props: { max: 3, invulnerability: 0.3, healthBar: 'health-bar', damageNumber: 'damage-number' } },
  ],
}

/**
 * The archetype's prefabs (issue #181 CA-25): the Knight and the Skeleton
 * Warrior, a checkpoint and the goal chest (sensors), and the level pieces —
 * each a KayKit Dungeon Remastered model on a fixed Collider sized to it, the
 * torch with a warm Point Light. A step is the foundation block scaled flat.
 */
export const THIRD_PERSON_PREFABS: Record<string, PrefabJson> = {
  'characters/player': PLAYER,
  'characters/skeleton': SKELETON,
  'objects/checkpoint': {
    waicaPrefab: 1,
    type: 'object',
    components: [
      { type: 'Model', props: { src: 'waica:tp-banner' } },
      { type: 'Collider', props: { shape: 'box', size: [2, 3, 2], offset: [0, 1.5, 0], sensor: true, layer: 'world' } },
      { type: 'Checkpoint' },
    ],
  },
  'objects/goal-chest': {
    waicaPrefab: 1,
    type: 'object',
    components: [
      { type: 'Model', props: { src: 'waica:tp-chest' } },
      { type: 'Collider', props: { shape: 'box', size: [2.4, 2, 2.4], offset: [0, 1, 0], sensor: true, layer: 'world' } },
      { type: 'GoalChest' },
    ],
  },
  'tiles/wall': { waicaPrefab: 1, type: 'tile', components: [{ type: 'Model', props: { src: 'waica:tp-wall' } }, fixedBox([4, 4, 1])] },
  'tiles/floor': {
    waicaPrefab: 1,
    type: 'tile',
    components: [{ type: 'Model', props: { src: 'waica:tp-floor' } }, fixedBox([4, 0.2, 4], [0, -0.05, 0])],
  },
  'tiles/step': { waicaPrefab: 1, type: 'tile', components: [{ type: 'Model', props: { src: 'waica:tp-foundation' } }, fixedBox([2.2, 2, 2.2])] },
  'tiles/column': { waicaPrefab: 1, type: 'tile', components: [{ type: 'Model', props: { src: 'waica:tp-pillar' } }, fixedBox([1.5, 4, 1.5])] },
  'tiles/torch': {
    waicaPrefab: 1,
    type: 'tile',
    components: [
      { type: 'Model', props: { src: 'waica:tp-torch' } },
      fixedBox([0.6, 1.1, 0.7], [0, 0.15, 0.3]),
      { type: 'PointLight', props: { color: '#ffb060', intensity: 14, distance: 9, offsetY: 0.6, offsetZ: 0.6 } },
    ],
  },
}
