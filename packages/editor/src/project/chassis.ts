import type { PrefabJson, SceneComponentJson } from '@waica/engine'
import { PLATFORMER_STATE_GRAPH } from '@waica/behaviors'
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
  /** The type's collision core and whether the user may turn it off. */
  collision: { type: 'Solid' | 'Hitbox'; optional: boolean } | null
}

/**
 * Appearance is uniform across types — any prefab can show an image or a
 * flat-color shape, and any image can be animated. Types differ only in
 * their collision core and in what a brand-new prefab starts with.
 */
export const CHASSIS: Record<PrefabType, ChassisRule> = {
  character: { collision: { type: 'Hitbox', optional: false } },
  object: { collision: { type: 'Hitbox', optional: true } },
  tile: { collision: { type: 'Solid', optional: true } },
}

const DEFAULT_COLOR = 0x8ecae6
const DEFAULT_SPRITE = { width: 1, height: 1, color: DEFAULT_COLOR }

/** Factory components for a brand-new prefab of the given type. */
export function newPrefabComponents(type: PrefabType): SceneComponentJson[] {
  switch (type) {
    case 'character':
      // Characters are born with the platformer state graph so states and
      // clips line up from minute zero; the Motor (a moving body) is one
      // "+ behaviour" away — an NPC shouldn't chase the arrow keys.
      return [
        { type: 'AnimatedSprite', props: structuredClone(DOG_SPRITE) },
        {
          type: 'StateMachine',
          props: {
            logic: 'platformer',
            initial: PLATFORMER_STATE_GRAPH.initial,
            states: structuredClone(PLATFORMER_STATE_GRAPH.states),
          },
        },
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
  const out: SplitComponents = {
    appearance: null,
    collision: null,
    behaviours: [],
    extras: [],
  }
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
 * Animated <-> static swap of the appearance, preserving shared props.
 * Returns null when the prefab has no appearance component.
 */
export function toggleAnimated(prefab: PrefabJson): PrefabJson | null {
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
          props: props.texture ? pickShared(props) : { ...pickShared(props), color: DEFAULT_COLOR },
        }
      : { type: 'AnimatedSprite', props: { ...pickShared(props), cols: 1, rows: 1, clips: {} } }
  const components = [...prefab.components]
  components[index] = next
  return { ...prefab, components }
}

/** What the appearance is showing: a texture, or a flat-color quad. */
export type AppearanceKind = 'image' | 'shape'

export function appearanceKind(comp: SceneComponentJson): AppearanceKind {
  if (comp.type === 'AnimatedSprite') return 'image'
  return comp.props?.texture ? 'image' : 'shape'
}

function appearanceIndexOf(prefab: PrefabJson): number {
  return prefab.components.findIndex((c) => componentRole(c.type) === 'appearance')
}

/** Appearance → flat-color shape, dropping the texture and any animation. */
export function setAppearanceShape(prefab: PrefabJson): PrefabJson {
  const index = appearanceIndexOf(prefab)
  const comp = prefab.components[index]
  if (!comp) return prefab
  const props = comp.props ?? {}
  const shared = pickShared(props)
  delete shared.texture
  delete shared.pixelArt
  const color = typeof props.color === 'number' ? props.color : DEFAULT_COLOR
  const components = [...prefab.components]
  components[index] = { type: 'Sprite', props: { ...shared, color } }
  return { ...prefab, components }
}

/**
 * Points the appearance at a texture; a shape becomes a textured Sprite.
 * The color is dropped — the engine ignores it under a texture anyway.
 */
export function setAppearanceTexture(prefab: PrefabJson, uri: string): PrefabJson {
  const index = appearanceIndexOf(prefab)
  const comp = prefab.components[index]
  if (!comp) return prefab
  const props: Record<string, unknown> = { ...(comp.props ?? {}), texture: uri }
  delete props.color
  const components = [...prefab.components]
  components[index] = { ...comp, props }
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
