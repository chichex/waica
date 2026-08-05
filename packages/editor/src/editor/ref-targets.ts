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

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

/** Project-owned choices for one typed string reference in the Inspector. */
export function availableRefTargets(
  project: RefProjectState,
  kind: RefKind,
  entity?: RefEntityContext,
): string[] {
  switch (kind) {
    case 'prefab':
      return Object.keys(project.prefabs).sort()
    case 'stat':
      return Object.keys(project.stats).sort()
    case 'action':
      return Object.keys(project.actions).sort()
    case 'clip': {
      const animated = entity?.components.find(
        (component) => component.type === 'AnimatedSprite',
      )
      return Object.keys(objectRecord(animated?.props?.clips)).sort()
    }
  }
}
