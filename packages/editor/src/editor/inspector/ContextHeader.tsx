import type { PrefabJson, SceneEntityJson } from '@waica/engine'
import type { ArchetypeManifest } from '../../project/archetype'
import { entityIcon, prefabIcon } from '../icons'
import type { InspectorSelection } from './inspector-props'

/** Where a change lands, shown as a colored banner at the top of the inspector. */
export interface InspectorContext {
  icon: string
  name: string
  badge: string
  scope?: string
  tone: 'scene' | 'prefab' | 'ui' | 'neutral'
}

/** Built-in and project-wide items: their banner does not depend on the selection's data. */
const FIXED_CONTEXTS: Record<'camera' | 'controls' | 'stats' | 'game', InspectorContext> = {
  camera: {
    icon: '🎥',
    name: 'Camera',
    badge: 'scene camera',
    scope: 'built-in — this frame is what the player sees when the game runs',
    tone: 'scene',
  },
  controls: {
    icon: '🎮',
    name: 'controls',
    badge: 'project',
    scope: 'which keys fire each action — applies to every scene',
    tone: 'neutral',
  },
  stats: {
    icon: '📊',
    name: 'stats',
    badge: 'project',
    scope: 'what the game keeps track of while playing — shared by every scene',
    tone: 'neutral',
  },
  game: {
    icon: '🕹️',
    name: 'game',
    badge: 'project',
    scope: 'global settings of the shipped game',
    tone: 'neutral',
  },
}

function entityContext(
  selection: { entity: SceneEntityJson; sceneName: string },
  prefabs: Record<string, PrefabJson>,
  archetype: ArchetypeManifest,
): InspectorContext {
  const e = selection.entity
  return {
    icon: entityIcon(e, prefabs, archetype),
    name: e.name,
    badge: e.prefab ? 'instance' : 'entity',
    scope: e.prefab
      ? `changes affect only this instance in "${selection.sceneName}" — the prefab stays untouched`
      : `one-off entity — lives only in "${selection.sceneName}"`,
    tone: 'scene',
  }
}

function prefabContext(
  selection: { ref: string; prefab: PrefabJson },
  archetype: ArchetypeManifest,
): InspectorContext {
  const name = selection.ref.slice(selection.ref.indexOf('/') + 1)
  return {
    icon: prefabIcon(name, archetype),
    name,
    badge: `${selection.prefab.type} prefab`,
    scope: 'shared blueprint — changes here reach every instance in every scene',
    tone: 'prefab',
  }
}

export function contextOf(
  selection: NonNullable<InspectorSelection>,
  prefabs: Record<string, PrefabJson>,
  archetype: ArchetypeManifest,
): InspectorContext {
  switch (selection.kind) {
    case 'scene':
      return {
        icon: '🎬',
        name: selection.name,
        badge: 'scene',
        scope: 'the world the game loads — click an entity to edit it',
        tone: 'scene',
      }
    case 'entity':
      return entityContext(selection, prefabs, archetype)
    case 'multi':
      return {
        icon: '▣',
        name: `${selection.entities.length} entities`,
        badge: 'selection',
        scope: `selected in "${selection.sceneName}" — drag, duplicate or delete them together`,
        tone: 'scene',
      }
    case 'prefab':
      return prefabContext(selection, archetype)
    case 'ui':
      return {
        icon: '🧩',
        name: selection.name,
        badge: 'ui piece',
        scope: 'HTML drawn over the game while it plays',
        tone: 'ui',
      }
    case 'script':
      return {
        icon: '📜',
        name: selection.name,
        badge: 'built-in script',
        scope: 'read-only — its params appear wherever the script is used',
        tone: 'neutral',
      }
    case 'art':
      return { icon: '🖼️', name: selection.label, badge: 'image', tone: 'neutral' }
    case 'camera':
    case 'controls':
    case 'stats':
    case 'game':
      return FIXED_CONTEXTS[selection.kind]
  }
}

export function ContextHeader({ ctx, actions }: { ctx: InspectorContext; actions?: React.ReactNode }) {
  return (
    <div className={`ed-ins-ctx is-${ctx.tone}`}>
      <div className="ed-ins-ctx-title">
        <span className="ed-x-ico">{ctx.icon}</span>
        <span className="ed-ins-ctx-name">{ctx.name}</span>
        <span className="ed-ins-ctx-badge">{ctx.badge}</span>
      </div>
      {ctx.scope && <div className="ed-ins-ctx-scope">{ctx.scope}</div>}
      {actions && <div className="ed-ins-ctx-actions">{actions}</div>}
    </div>
  )
}
