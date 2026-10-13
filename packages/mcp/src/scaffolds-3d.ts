import type { PrefabJson, RoleDefinition, SceneComponentJson } from '@waica/engine'

/** The identities scaffold_prefab knows (scaffolds.ts's IDENTITIES). */
type Identity = 'player' | 'enemy' | 'npc' | 'custom'

/** What a 3D starter prefab is asked for: its type, and for a character its role, the role's definition and an identity. */
export interface Scaffold3dRequest {
  type: PrefabJson['type']
  role: string
  definition: RoleDefinition | undefined
  identity?: Identity
}

/**
 * What a 3D character is born with per identity: the extras that work in a 3D
 * scene. Hazard is 2D: an enemy hurts with a MeleeAttack instead, whose range
 * is what the enemy role winds up within.
 */
const IDENTITY_EXTRAS_3D: Readonly<Record<Identity, readonly SceneComponentJson[]>> = {
  player: [{ type: 'Respawnable' }, { type: 'Health', props: { invulnerability: 1 } }],
  enemy: [{ type: 'MeleeAttack' }, { type: 'Health', props: { max: 1 } }],
  npc: [],
  custom: [],
}

/** The capsule's collision layer and mask per identity: a player's melee reaches enemies, an enemy's the player. */
const CATEGORIES: Readonly<Record<Identity, Record<string, unknown>>> = {
  player: { layer: 'player', collidesWith: ['enemy'] },
  enemy: { layer: 'enemy', collidesWith: ['player'] },
  npc: {},
  custom: {},
}

/**
 * The placeholder every 3D starter prefab draws until a glb replaces it: a
 * unit box centred on the entity's origin, only a marker. The character's
 * capsule stands on that origin (the feet), as a glb character's does.
 */
const MODEL: SceneComponentJson = { type: 'Model', props: { shape: 'box' } }

/**
 * A 3D archetype's starter prefab (issue #181 CA-30, D-4): a primitive Model,
 * and for a character a kinematic body with a capsule, its State Machine and
 * its role's driver; an object is a sensor, a tile a fixed box. Never a
 * Sprite, Hitbox or Solid. No Animator either (maintainer decision): it needs
 * a Model with a glb `src` (`animator-without-model`), so it is added with
 * the glb that replaces the box.
 */
export function prefabComponents3d(request: Scaffold3dRequest): SceneComponentJson[] {
  if (request.type === 'object') return [MODEL, { type: 'Collider', props: { sensor: true } }]
  if (request.type === 'tile') return [MODEL, { type: 'Collider' }]
  return characterComponents3d(request)
}

function characterComponents3d({ role, definition, identity }: Scaffold3dRequest): SceneComponentJson[] {
  const categories = identity ? CATEGORIES[identity] : {}
  const graph = definition?.graph
  return [
    MODEL,
    { type: 'RigidBody', props: { type: 'kinematic' } },
    { type: 'Collider', props: { shape: 'capsule', radius: 0.4, height: 1.8, offset: [0, 0.9, 0], ...categories } },
    { type: 'StateMachine', props: { role, initial: graph?.initial ?? '', states: graph?.states ?? {} } },
    ...(definition?.driver ? [{ type: definition.driver }] : []),
    ...(identity ? IDENTITY_EXTRAS_3D[identity] : []),
  ]
}
