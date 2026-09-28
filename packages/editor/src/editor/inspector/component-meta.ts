import type { ClipDef, PrefabJson, SceneComponentJson, SceneEntityJson, StateJson } from '@waica/engine'
import type { ArchetypeManifest } from '../../project/archetype'
import { missingDriver } from '../../project/chassis'
import { classDefaults } from '../../project/component-defaults'
import { resolveComponents } from '../../scene/ops'

/** Raw AnimatedSprite props managed by the animation editor, not shown as rows. */
export const ANIMATION_KEYS = new Set([
  'clips',
  'cols',
  'rows',
  'cells',
  'extraSheets',
  'initialClip',
  'current',
  'gridOffsetX',
  'gridOffsetY',
  'spacingX',
  'spacingY',
  'cellWidth',
  'cellHeight',
])

export function clipsOf(comp: SceneComponentJson): Record<string, ClipDef> {
  return (comp.props?.clips as Record<string, ClipDef> | undefined) ?? {}
}

export function componentKeys(comp: SceneComponentJson, archetype: ArchetypeManifest): string[] {
  const Class = archetype.registry.components[comp.type]
  const declared = Object.keys(Class?.params ?? {})
  return [...new Set([...Object.keys(comp.props ?? {}), ...declared])]
}

/** Friendly component name for headers and pickers ("Motor", not "PlatformerMotor"). */
export function componentLabel(type: string, archetype: ArchetypeManifest): string {
  return archetype.registry.components[type]?.displayName ?? type
}

// Unset params show the class defaults (what the game actually runs), so
// their value AND type match reality — e.g. a boolean renders as a checkbox.
export function componentDefaults(
  comp: SceneComponentJson,
  archetype: ArchetypeManifest,
): Record<string, unknown> {
  return classDefaults(archetype.registry.components[comp.type], comp.type)
}

/** Behaviours present that implement onCollide — they need a hitbox to fire. */
export function touchBehaviourNames(
  comps: SceneComponentJson[],
  archetype: ArchetypeManifest,
): string[] {
  return comps
    .map((c) => c.type)
    .filter((t) => {
      const Class = archetype.registry.components[t] as
        | { prototype: Record<string, unknown> }
        | undefined
      return typeof Class?.prototype.onCollide === 'function'
    })
}

/**
 * Ref context for a multi-selection's clip pickers: the INTERSECTION of every
 * selected entity's own clip set, so a value picked here is valid on every
 * entity it gets written to — not just the first one. Entities with no
 * AnimatedSprite impose no constraint (mirrors availableRefTargets/
 * validate_project treating "no sibling AnimatedSprite" as unconstrained,
 * not as an empty set) and are excluded from the intersection rather than
 * collapsing it to nothing. Returns undefined — "no constraint available" —
 * only when NONE of the selected entities has an AnimatedSprite at all.
 */
export function intersectedClipComponents(
  entities: readonly SceneEntityJson[],
  prefabs: Record<string, PrefabJson>,
): SceneComponentJson[] | undefined {
  const clipSets = entities
    .map((entity) => resolveComponents(entity, prefabs).find((c) => c.type === 'AnimatedSprite'))
    .filter((animated): animated is SceneComponentJson => animated !== undefined)
    .map((animated) => new Set(Object.keys(clipsOf(animated))))
  if (clipSets.length === 0) return undefined
  const [first, ...rest] = clipSets as [Set<string>, ...Set<string>[]]
  const shared = [...first].filter((clip) => rest.every((set) => set.has(clip)))
  return [
    { type: 'AnimatedSprite', props: { clips: Object.fromEntries(shared.map((c) => [c, {}])) } },
  ]
}

/**
 * Clips the character's states expect but its sprite is missing, as an
 * inline warning. Each StateMachine state plays the clip of its own name
 * (or its `clip` override) on enter.
 */
export function characterClipsWarning(
  appearance: SceneComponentJson,
  components: SceneComponentJson[],
): string | undefined {
  const machine = components.find((c) => c.type === 'StateMachine')
  const states = (machine?.props?.states ?? {}) as Record<string, StateJson | undefined>
  const clips = new Set(Object.keys(clipsOf(appearance)))
  const missing = Object.entries(states)
    .filter(([name]) => name !== '*')
    .map(([name, state]) => state?.clip ?? name)
    .filter((clip) => !clips.has(clip))
  return missing.length ? `missing clips: ${[...new Set(missing)].join(', ')}` : undefined
}

/**
 * Inline warning when the role's driver component is missing: without it
 * every state's update early-returns and the character just stands there
 * in Play. Roles install their driver themselves, so this only fires on
 * hand-edited JSON — an anomaly detector, not assembly instructions.
 */
export function driverWarning(
  components: SceneComponentJson[],
  archetype: ArchetypeManifest,
): string | undefined {
  const missing = missingDriver(components)
  if (!missing) return undefined
  return `this character won't move in Play: its "${missing.role}" states drive the ${componentLabel(missing.driver, archetype)} behaviour, which it doesn't have — add it with "+ behaviour" below`
}
