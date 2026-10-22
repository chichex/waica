import type { PrefabJson, SceneComponentJson, StateJson } from '@waica/engine'
import { CHARACTER_STATE_GRAPH, ENEMY_STATE_GRAPH } from '@waica/behaviors'

/** The clip each of a graph's states plays, over the graph's own states (issue #181 CA-24: exactly the clips the glbs keep). */
function withClips(states: Record<string, StateJson>, clips: Record<string, string>): Record<string, StateJson> {
  return Object.fromEntries(Object.entries(states).map(([name, state]) => [name, clips[name] ? { ...state, clip: clips[name] } : state]))
}

/**
 * The Knight's clip for each `character` state (assets/ATTRIBUTION.md): idle,
 * walk and run reach theirs through the Locomotion blend (issue #205).
 */
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

/** Every character and level piece participates in the scene's shadows. */
function gltfModel(src: string): SceneComponentJson {
  return { type: 'Model', props: { src, castShadows: true, receiveShadows: true } }
}

/**
 * The Knight's walk cycle (issue #205 CA-15): Idle, Walking_A and Running_A
 * mixed by the planar speed the `character` role writes, at the motor's
 * speeds (still, `speed` 6 and `runSpeed` 10), so a half stick walks slowly
 * without sliding its feet. idle, walk and run all play it: switching among
 * them keeps it playing, and the smoothed speed does the transition.
 */
const LOCOMOTION = 'Locomotion'
const LOCOMOTION_BLEND = {
  param: 'speed',
  points: [{ clip: KNIGHT_CLIPS.idle, at: 0 }, { clip: KNIGHT_CLIPS.walk, at: 6 }, { clip: KNIGHT_CLIPS.run, at: 10 }],
  smoothing: 0.15,
}

const PLAYER: PrefabJson = {
  waicaPrefab: 1,
  type: 'character',
  components: [
    gltfModel('waica:tp-knight'),
    {
      type: 'Animator',
      props: {
        initialClip: 'Idle',
        // The attack and the dodge answer the press at once; the death settles in slower.
        clips: {
          Jump_Start: { loop: false },
          '1H_Melee_Attack_Chop': { loop: false, fade: 0.05 },
          Dodge_Forward: { loop: false, fade: 0.05 },
          Death_A: { loop: false, fade: 0.3 },
        },
        blends: { [LOCOMOTION]: LOCOMOTION_BLEND },
      },
    },
    {
      type: 'StateMachine',
      props: {
        role: 'player',
        initial: CHARACTER_STATE_GRAPH.initial,
        states: withClips(CHARACTER_STATE_GRAPH.states, { ...KNIGHT_CLIPS, idle: LOCOMOTION, walk: LOCOMOTION, run: LOCOMOTION }),
      },
    },
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
    gltfModel('waica:tp-skeleton-warrior'),
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
 * How deep a checkpoint banner's origin sits inside the wall it hangs on: the
 * banner is modelled to hang on a wall, its cloth's back 0.378 in front of
 * its origin, so at this inset the cloth lies flush on the wall's inner face.
 * The scene places the origin by it and the prefab its sensor and spawn.
 */
export const BANNER_INSET = 0.35

/**
 * How far in front of a checkpoint banner's origin its 2-deep sensor and its
 * spawn sit: the sensor starts at the wall's inner face and the Knight
 * respawns 1 from it.
 */
const CHECKPOINT_REACH = BANNER_INSET + 1

/**
 * The archetype's prefabs (issue #181 CA-25): the Knight and the Skeleton
 * Warrior, a checkpoint (a wall banner) and the goal chest (sensors), and the level pieces —
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
      gltfModel('waica:tp-banner'),
      // A wall banner: its origin on the wall, its sensor and spawn on the floor in front of the wall (local +z).
      { type: 'Collider', props: { shape: 'box', size: [2, 3, 2], offset: [0, 1.5, CHECKPOINT_REACH], sensor: true, layer: 'world' } },
      { type: 'Checkpoint', props: { spawnOffset: [0, 0, CHECKPOINT_REACH] } },
    ],
  },
  'objects/goal-chest': {
    waicaPrefab: 1,
    type: 'object',
    components: [
      gltfModel('waica:tp-chest'),
      { type: 'Collider', props: { shape: 'box', size: [2.4, 2, 2.4], offset: [0, 1, 0], sensor: true, layer: 'world' } },
      { type: 'GoalChest' },
    ],
  },
  'tiles/wall': { waicaPrefab: 1, type: 'tile', components: [gltfModel('waica:tp-wall'), fixedBox([4, 4, 1])] },
  'tiles/floor': {
    waicaPrefab: 1,
    type: 'tile',
    components: [gltfModel('waica:tp-floor'), fixedBox([4, 0.2, 4], [0, -0.05, 0])],
  },
  'tiles/step': { waicaPrefab: 1, type: 'tile', components: [gltfModel('waica:tp-foundation'), fixedBox([2.2, 2, 2.2])] },
  'tiles/column': { waicaPrefab: 1, type: 'tile', components: [gltfModel('waica:tp-pillar'), fixedBox([1.5, 4, 1.5])] },
  'tiles/torch': {
    waicaPrefab: 1,
    type: 'tile',
    components: [
      gltfModel('waica:tp-torch'),
      fixedBox([0.6, 1.1, 0.7], [0, 0.15, 0.3]),
      { type: 'PointLight', props: { color: '#ffb060', intensity: 14, distance: 9, offsetY: 0.6, offsetZ: 0.6, castShadows: true } },
    ],
  },
}
