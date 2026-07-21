import type { PrefabJson, SceneEntityJson } from '@waica/engine'
import { ACTIVE_ARCHETYPE } from '../project/archetype'
import { resolveComponents } from '../scene/ops'

/** Icons and labels shared by the explorer, the breadcrumb and the inspector. */

const PREFAB_ICONS = new Map(ACTIVE_ARCHETYPE.palette.map((t) => [t.label, t.icon]))

export function prefabIcon(base: string): string {
  return PREFAB_ICONS.get(base) ?? '▣'
}

export function sceneLabel(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1)
  return name.endsWith('.scene.json') ? name.slice(0, -'.scene.json'.length) : name
}

export function entityIcon(entity: SceneEntityJson, prefabs: Record<string, PrefabJson>): string {
  const types = new Set(resolveComponents(entity, prefabs).map((c) => c.type))
  for (const [type, icon] of Object.entries(ACTIVE_ARCHETYPE.entityIcons)) {
    if (types.has(type)) return icon
  }
  if (types.has('Solid')) return '▬'
  return '▢'
}
