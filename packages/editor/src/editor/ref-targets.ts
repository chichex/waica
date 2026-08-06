import type {
  InputBindings,
  ParamSpec,
  PrefabJson,
  SceneComponentJson,
} from '@waica/engine'
import type { ProjectStats } from '../project/stats'

export type RefKind = NonNullable<ParamSpec['ref']>

export interface RefProjectState {
  prefabs: Readonly<Record<string, PrefabJson>>
  stats: Readonly<ProjectStats>
  /** Already merged over the active archetype's defaults by parseControls. */
  actions: Readonly<InputBindings>
}

export interface RefEntityContext {
  components: readonly SceneComponentJson[]
}

/** One offered choice: `value` is what gets written, `label` is what the picker shows. */
export interface RefTarget {
  value: string
  label: string
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function plainTargets(values: readonly string[]): RefTarget[] {
  return [...values].sort().map((value) => ({ value, label: value }))
}

/**
 * Project-owned choices for one typed string reference in the Inspector.
 * `undefined` means "no constraint available" (e.g. a clip ref with no
 * sibling AnimatedSprite) — distinct from an empty array, which means the
 * reference IS constrained but the project currently declares zero targets.
 * validate_project skips clip checks the same way when there is no
 * AnimatedSprite, so the Inspector must not invent a constraint here either.
 */
export function availableRefTargets(
  project: RefProjectState,
  kind: RefKind,
  entity?: RefEntityContext,
): RefTarget[] | undefined {
  switch (kind) {
    case 'prefab':
      return plainTargets(Object.keys(project.prefabs))
    case 'stat':
      return plainTargets(Object.keys(project.stats))
    case 'action':
      // Kept selectable even with zero key bindings — the runtime installs
      // exactly controls.json's bindings, so this action genuinely exists,
      // it just fires nothing yet; label it rather than hide it, matching
      // what validate_project reports for the same value (a warning, not an
      // unknown reference).
      return Object.keys(project.actions)
        .sort()
        .map((value) => ({
          value,
          label: project.actions[value]?.length ? value : `${value} (unbound)`,
        }))
    case 'clip': {
      if (!entity) return undefined
      const animated = entity.components.find((component) => component.type === 'AnimatedSprite')
      if (!animated) return undefined
      return plainTargets(Object.keys(objectRecord(animated.props?.clips)))
    }
  }
}
