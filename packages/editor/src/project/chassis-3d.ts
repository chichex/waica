import { roleDefinition, type PrefabJson, type SceneComponentJson } from '@waica/engine'
import type { CharacterIdentity } from './chassis'

/**
 * What a 3D character is born with per identity, beyond its role package: the
 * extras that work in a 3D scene. Hazard is 2D: an enemy hurts with a
 * MeleeAttack instead, whose range is what the enemy role winds up within.
 * The MCP's scaffold_prefab writes the same (packages/mcp/src/scaffolds-3d.ts);
 * its test holds the two byte-identical.
 */
const IDENTITY_EXTRAS_3D: Readonly<Record<CharacterIdentity, readonly SceneComponentJson[]>> = {
  player: [{ type: 'Respawnable' }, { type: 'Health', props: { invulnerability: 1 } }],
  enemy: [{ type: 'MeleeAttack' }, { type: 'Health', props: { max: 1 } }],
  npc: [],
  custom: [],
}

/** The capsule's collision layer and mask per identity: a player's melee reaches enemies, an enemy's the player. */
const CATEGORIES_3D: Readonly<Record<CharacterIdentity, Record<string, unknown>>> = {
  player: { layer: 'player', collidesWith: ['enemy'] },
  enemy: { layer: 'enemy', collidesWith: ['player'] },
  npc: {},
  custom: {},
}

/** The placeholder a 3D prefab draws until a glb replaces it: a unit box on the entity's origin, only a marker. */
const MODEL_3D: SceneComponentJson = { type: 'Model', props: { shape: 'box' } }

/**
 * A brand-new prefab in a 3D archetype (maintainer decision on issue #181:
 * the editor's New prefab writes what the MCP scaffold writes): a primitive
 * Model, and for a character a kinematic body with a capsule standing on the
 * origin, its State Machine and its role's driver, plus the identity's
 * extras; an object is a sensor, a tile a fixed box. Never a Sprite, Hitbox
 * or Solid, and no Animator until a glb gives the Model a `src`.
 */
export function newPrefabComponents3d(type: PrefabJson['type'], role = 'player', identity?: CharacterIdentity): SceneComponentJson[] {
  if (type === 'object') return [MODEL_3D, { type: 'Collider', props: { sensor: true } }]
  if (type === 'tile') return [MODEL_3D, { type: 'Collider' }]
  // Cloned so two prefabs never share a props object or a state graph.
  return structuredClone(characterComponents3d(role, identity))
}

/** A 3D character: the box, the kinematic capsule body, the role's machine and driver, the identity's extras. */
function characterComponents3d(role: string, identity: CharacterIdentity | undefined): SceneComponentJson[] {
  const def = roleDefinition(role)
  const graph = def?.graph
  return [
    MODEL_3D,
    { type: 'RigidBody', props: { type: 'kinematic' } },
    { type: 'Collider', props: { shape: 'capsule', radius: 0.4, height: 1.8, offset: [0, 0.9, 0], ...(identity ? CATEGORIES_3D[identity] : {}) } },
    { type: 'StateMachine', props: { role, initial: graph?.initial ?? '', states: graph?.states ?? {} } },
    ...(def?.driver ? [{ type: def.driver }] : []),
    ...(identity ? IDENTITY_EXTRAS_3D[identity] : []),
  ]
}
