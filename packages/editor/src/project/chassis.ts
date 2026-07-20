import type { PrefabJson, SceneComponentJson } from '@waica/engine'
import { DOG_SPRITE } from '@waica/archetype-platformer'

/**
 * The chassis model: each prefab type is born with factory core components
 * (its "chassis") that cannot be removed, only configured — the user extends
 * an entity with behaviours, never by assembling render/collision plumbing.
 * Enforcement is editor-level only; scene JSON stays free-form.
 */

export type PrefabType = PrefabJson['type']

export const APPEARANCE_TYPES = ['Sprite', 'AnimatedSprite'] as const
export const COLLISION_TYPES = ['Solid', 'Hitbox'] as const

export const CORE_COMPONENT_TYPES: ReadonlySet<string> = new Set([
  ...APPEARANCE_TYPES,
  ...COLLISION_TYPES,
])

export type ComponentRole = 'appearance' | 'collision' | 'behaviour'

export function componentRole(type: string): ComponentRole {
  if ((APPEARANCE_TYPES as readonly string[]).includes(type)) return 'appearance'
  if ((COLLISION_TYPES as readonly string[]).includes(type)) return 'collision'
  return 'behaviour'
}

export interface ChassisRule {
  /** What the type's appearance is: locked animated/static, user-switchable, or none. */
  appearance: 'fixed-animated' | 'fixed-static' | 'switchable' | 'none'
  /** The type's collision core and whether the user may turn it off. */
  collision: { type: 'Solid' | 'Hitbox'; optional: boolean } | null
}

export const CHASSIS: Record<PrefabType, ChassisRule> = {
  character: { appearance: 'fixed-animated', collision: { type: 'Hitbox', optional: false } },
  object: { appearance: 'switchable', collision: { type: 'Hitbox', optional: true } },
  tile: { appearance: 'fixed-static', collision: { type: 'Solid', optional: true } },
  ui: { appearance: 'none', collision: null },
}

const DEFAULT_SPRITE = { width: 1, height: 1, color: 0x8ecae6 }

/** Factory components for a brand-new prefab of the given type. */
export function newPrefabComponents(type: PrefabType): SceneComponentJson[] {
  switch (type) {
    case 'character':
      return [
        { type: 'AnimatedSprite', props: structuredClone(DOG_SPRITE) },
        { type: 'Hitbox', props: { width: 0.9, height: 0.95 } },
      ]
    case 'object':
      return [
        { type: 'Sprite', props: { ...DEFAULT_SPRITE } },
        { type: 'Hitbox', props: { width: 1, height: 1 } },
      ]
    case 'tile':
      return [
        { type: 'Sprite', props: { ...DEFAULT_SPRITE } },
        { type: 'Solid', props: { width: 1, height: 1 } },
      ]
    case 'ui':
      return [{ type: 'HudCounter', props: {} }]
  }
}

export interface SplitComponents {
  appearance: SceneComponentJson | null
  collision: SceneComponentJson | null
  behaviours: SceneComponentJson[]
  /** Duplicate core components (hand-edited JSON): shown as plain removable cards. */
  extras: SceneComponentJson[]
}

/** Buckets a component list into the inspector's native sections. */
export function splitComponents(components: SceneComponentJson[]): SplitComponents {
  const out: SplitComponents = { appearance: null, collision: null, behaviours: [], extras: [] }
  for (const comp of components) {
    const role = componentRole(comp.type)
    if (role === 'appearance') {
      if (out.appearance) out.extras.push(comp)
      else out.appearance = comp
    } else if (role === 'collision') {
      if (out.collision) out.extras.push(comp)
      else out.collision = comp
    } else {
      out.behaviours.push(comp)
    }
  }
  return out
}

/** Registry names offered by "+ behaviour" and listed in the Explorer. */
export function behaviourTypes(all: Iterable<string>): string[] {
  return [...all].filter((t) => !CORE_COMPONENT_TYPES.has(t))
}

/** Appearance props that survive the Sprite <-> AnimatedSprite swap. */
const SHARED_APPEARANCE_PROPS = ['width', 'height', 'texture', 'pixelArt', 'layer'] as const

function pickShared(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const key of SHARED_APPEARANCE_PROPS) {
    if (props[key] !== undefined) out[key] = props[key]
  }
  return out
}

/**
 * Object-only animated <-> static swap, preserving shared appearance props.
 * Returns null when the prefab's chassis doesn't allow switching.
 */
export function toggleAnimated(prefab: PrefabJson): PrefabJson | null {
  if (CHASSIS[prefab.type].appearance !== 'switchable') return null
  const index = prefab.components.findIndex((c) => componentRole(c.type) === 'appearance')
  const comp = prefab.components[index]
  if (!comp) return null
  const props = comp.props ?? {}
  const next: SceneComponentJson =
    comp.type === 'AnimatedSprite'
      ? // Back to static: drop the sheet/clips; keep a color so a texture-less
        // object stays visible instead of rendering white-on-white.
        {
          type: 'Sprite',
          props: props.texture ? pickShared(props) : { ...pickShared(props), color: 0x8ecae6 },
        }
      : { type: 'AnimatedSprite', props: { ...pickShared(props), cols: 1, rows: 1, clips: {} } }
  const components = [...prefab.components]
  components[index] = next
  return { ...prefab, components }
}

/** Turns the type's collision core on/off within the chassis rules. */
export function setCollisionEnabled(prefab: PrefabJson, enabled: boolean): PrefabJson {
  const rule = CHASSIS[prefab.type].collision
  if (!rule) return prefab
  if (!enabled && !rule.optional) return prefab
  const present = prefab.components.some((c) => c.type === rule.type)
  if (enabled === present) return prefab
  if (!enabled) {
    return { ...prefab, components: prefab.components.filter((c) => c.type !== rule.type) }
  }
  const appearanceIndex = prefab.components.findIndex(
    (c) => componentRole(c.type) === 'appearance',
  )
  const appearance = prefab.components[appearanceIndex]?.props ?? {}
  const box: SceneComponentJson = {
    type: rule.type,
    props: {
      width: typeof appearance.width === 'number' ? appearance.width : 1,
      height: typeof appearance.height === 'number' ? appearance.height : 1,
    },
  }
  const components = [...prefab.components]
  components.splice(appearanceIndex + 1, 0, box)
  return { ...prefab, components }
}
