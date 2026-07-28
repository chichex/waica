import type { PrefabJson, SceneEntityJson } from '@waica/engine'
import type { ArchetypeManifest } from '../project/archetype'
import { resolveComponents } from '../scene/ops'

/** Icons and labels shared by the explorer, the breadcrumb and the inspector. */

export function prefabIcon(base: string, archetype: ArchetypeManifest): string {
  const icons = new Map(archetype.palette.map((template) => [template.label, template.icon]))
  return icons.get(base) ?? '▣'
}

export function sceneLabel(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1)
  return name.endsWith('.scene.json') ? name.slice(0, -'.scene.json'.length) : name
}

export function entityIcon(
  entity: SceneEntityJson,
  prefabs: Record<string, PrefabJson>,
  archetype: ArchetypeManifest,
): string {
  const types = new Set(resolveComponents(entity, prefabs).map((c) => c.type))
  for (const [type, icon] of Object.entries(archetype.entityIcons)) {
    if (types.has(type)) return icon
  }
  if (types.has('Solid')) return '▬'
  return '▢'
}
