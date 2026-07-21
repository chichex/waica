import {
  resolveEntityComponents,
  type PrefabJson,
  type SceneComponentJson,
  type SceneEntityJson,
  type SceneJson,
} from '@waica/engine'

/** Pure mutations over the scene (the editor's source of truth). */

/**
 * The scene camera's slot in the editor's selection model. Not an entity
 * name: the camera is built-in, singular and cannot be deleted.
 */
export const CAMERA_NODE = '::camera'

/**
 * Sets one camera prop (undefined deletes it). Writing the camera block
 * makes the file a v3 scene.
 */
export function setCameraProp(scene: SceneJson, key: string, value: unknown): SceneJson {
  const camera = { ...scene.camera, [key]: value } as NonNullable<SceneJson['camera']>
  if (value === undefined) delete camera[key as keyof typeof camera]
  return { ...scene, waicaScene: 3, camera }
}

export function moveCamera(scene: SceneJson, position: [number, number]): SceneJson {
  return setCameraProp(scene, 'position', position)
}

/**
 * In-memory upgrade of a freshly loaded scene. Pre-HTML-UI projects kept
 * the HUD as entities with a 'ui/<piece>' prefab — a prefab type that no
 * longer exists; those become entries in the scene's "ui" list. The
 * rewrite reaches disk with the scene's next commit.
 */
export function migrateScene(scene: SceneJson): SceneJson {
  const isLegacyUi = (e: SceneEntityJson): boolean => e.prefab?.startsWith('ui/') ?? false
  const legacy = scene.entities.filter(isLegacyUi)
  if (legacy.length === 0) return scene
  const ui = [...(scene.ui ?? [])]
  for (const entity of legacy) {
    const piece = (entity.prefab as string).slice('ui/'.length)
    if (!ui.includes(piece)) ui.push(piece)
  }
  return { ...scene, entities: scene.entities.filter((e) => !isLegacyUi(e)), ui }
}

export function prefabOwns(
  entity: SceneEntityJson,
  componentType: string,
  prefabs?: Record<string, PrefabJson>,
): boolean {
  if (!entity.prefab) return false
  const prefab = prefabs?.[entity.prefab]
  return prefab?.components.some((c) => c.type === componentType) ?? false
}

/** Merged component list of an entity (prefab + overrides + inline extras), for the UI. */
export function resolveComponents(
  entity: SceneEntityJson,
  prefabs?: Record<string, PrefabJson>,
): SceneComponentJson[] {
  return resolveEntityComponents(entity, prefabs)
}

export function findEntity(scene: SceneJson, name: string): SceneEntityJson | undefined {
  return scene.entities.find((e) => e.name === name)
}

/** Unique name: "Coin" → "Coin-3" if it already exists. */
export function uniqueName(scene: SceneJson, base: string): string {
  const names = new Set(scene.entities.map((e) => e.name))
  if (!names.has(base)) return base
  let i = 2
  while (names.has(`${base}-${i}`)) i++
  return `${base}-${i}`
}

export function addEntity(scene: SceneJson, entity: SceneEntityJson): SceneJson {
  return { ...scene, entities: [...scene.entities, entity] }
}

/**
 * The explorer's view of a scene: root entities and folders, in display
 * order. Folders are editor-only grouping — the runtime spawns the flat
 * entities array and never sees them.
 */
export type SceneTreeRow =
  | { kind: 'entity'; entity: SceneEntityJson }
  | { kind: 'folder'; name: string; entities: SceneEntityJson[] }

/**
 * Derives the display tree. A folder shows at its first entity's position
 * (grouping scattered members); folders with no entities (from the scene's
 * folder registry) trail at the end.
 */
export function sceneTree(scene: SceneJson): SceneTreeRow[] {
  const rows: SceneTreeRow[] = []
  const byFolder = new Map<string, Extract<SceneTreeRow, { kind: 'folder' }>>()
  for (const entity of scene.entities) {
    if (entity.folder == null) {
      rows.push({ kind: 'entity', entity })
      continue
    }
    let row = byFolder.get(entity.folder)
    if (!row) {
      row = { kind: 'folder', name: entity.folder, entities: [] }
      byFolder.set(entity.folder, row)
      rows.push(row)
    }
    row.entities.push(entity)
  }
  for (const name of scene.folders ?? []) {
    if (!byFolder.has(name)) rows.push({ kind: 'folder', name, entities: [] })
  }
  return rows
}

export function folderNames(scene: SceneJson): string[] {
  return sceneTree(scene)
    .filter((r) => r.kind === 'folder')
    .map((r) => r.name)
}

/** Unique folder name: "Folder" → "Folder-2" if it already exists. */
export function uniqueFolderName(scene: SceneJson, base: string): string {
  const names = new Set(folderNames(scene))
  if (!names.has(base)) return base
  let i = 2
  while (names.has(`${base}-${i}`)) i++
  return `${base}-${i}`
}

/**
 * Rebuilds the scene from display rows: entities flatten back in row order
 * (folder members become contiguous), the folder registry follows row order.
 */
function fromTree(scene: SceneJson, rows: SceneTreeRow[]): SceneJson {
  const entities = rows.flatMap((r) => (r.kind === 'folder' ? r.entities : [r.entity]))
  const folders = rows.filter((r) => r.kind === 'folder').map((r) => r.name)
  const next = { ...scene, entities }
  if (folders.length > 0) next.folders = folders
  else delete next.folders
  return next
}

const inFolder = (entity: SceneEntityJson, folder: string): SceneEntityJson => ({
  ...entity,
  folder,
})

const atRoot = (entity: SceneEntityJson): SceneEntityJson => {
  const { folder: _f, ...rest } = entity
  return rest
}

export function addFolder(scene: SceneJson, name: string): SceneJson {
  return { ...scene, folders: [...(scene.folders ?? []), name] }
}

export function renameFolder(scene: SceneJson, from: string, to: string): SceneJson {
  return {
    ...scene,
    folders: scene.folders?.map((f) => (f === from ? to : f)),
    entities: scene.entities.map((e) => (e.folder === from ? { ...e, folder: to } : e)),
  }
}

/** Removes the folder; its entities stay in the scene, back at root level. */
export function dissolveFolder(scene: SceneJson, name: string): SceneJson {
  const next = {
    ...scene,
    entities: scene.entities.map((e) => (e.folder === name ? atRoot(e) : e)),
  }
  const folders = (scene.folders ?? []).filter((f) => f !== name)
  if (folders.length > 0) next.folders = folders
  else delete next.folders
  return next
}

/** Removes the folder AND every entity in it. */
export function deleteFolder(scene: SceneJson, name: string): SceneJson {
  const next = {
    ...scene,
    entities: scene.entities.filter((e) => e.folder !== name),
  }
  const folders = (scene.folders ?? []).filter((f) => f !== name)
  if (folders.length > 0) next.folders = folders
  else delete next.folders
  return next
}

/**
 * A drop slot in the explorer tree. before/after an entity adopts that
 * entity's folder (or root); before/after a folder means root level, around
 * the folder's whole block; 'end' is root level, last.
 */
export type DropTarget =
  | { into: string }
  | { beforeEntity: string }
  | { afterEntity: string }
  | { beforeFolder: string }
  | { afterFolder: string }
  | 'end'

/** Row index a target points at (an entity inside a folder → its folder's row). */
function targetIndex(rows: SceneTreeRow[], target: Exclude<DropTarget, 'end' | { into: string }>): number {
  const entityName = 'beforeEntity' in target ? target.beforeEntity : 'afterEntity' in target ? target.afterEntity : null
  const folderName = 'beforeFolder' in target ? target.beforeFolder : 'afterFolder' in target ? target.afterFolder : null
  return rows.findIndex((r) =>
    r.kind === 'folder'
      ? r.name === folderName || r.entities.some((e) => e.name === entityName)
      : r.entity.name === entityName,
  )
}

/**
 * Moves an entity to a drop slot, updating both its position in the flat
 * entities array and its folder membership. Unknown names no-op.
 */
export function reorderEntity(scene: SceneJson, name: string, target: DropTarget): SceneJson {
  const entity = findEntity(scene, name)
  if (!entity) return scene
  const rows = sceneTree(scene)
    .map((r) =>
      r.kind === 'folder' ? { ...r, entities: r.entities.filter((e) => e.name !== name) } : r,
    )
    .filter((r) => r.kind === 'folder' || r.entity.name !== name)

  if (target === 'end') {
    rows.push({ kind: 'entity', entity: atRoot(entity) })
    return fromTree(scene, rows)
  }
  if ('into' in target) {
    const row = rows.find((r) => r.kind === 'folder' && r.name === target.into)
    if (!row || row.kind !== 'folder') return scene
    row.entities.push(inFolder(entity, target.into))
    return fromTree(scene, rows)
  }
  const idx = targetIndex(rows, target)
  if (idx < 0) return scene
  const row = rows[idx]!
  const entityName = 'beforeEntity' in target ? target.beforeEntity : 'afterEntity' in target ? target.afterEntity : null
  if (row.kind === 'folder' && entityName != null) {
    // Landing between two members of a folder: the entity joins it.
    const at = row.entities.findIndex((e) => e.name === entityName)
    const slot = 'afterEntity' in target ? at + 1 : at
    row.entities.splice(slot, 0, inFolder(entity, row.name))
    return fromTree(scene, rows)
  }
  const slot = 'afterEntity' in target || 'afterFolder' in target ? idx + 1 : idx
  rows.splice(slot, 0, { kind: 'entity', entity: atRoot(entity) })
  return fromTree(scene, rows)
}

/**
 * Moves several entities to a drop slot as one contiguous run, keeping
 * their current display order. Targets inside the moving set no-op.
 */
export function reorderEntities(scene: SceneJson, names: string[], target: DropTarget): SceneJson {
  const moving = new Set(names)
  if (typeof target === 'object') {
    const ref =
      'beforeEntity' in target ? target.beforeEntity : 'afterEntity' in target ? target.afterEntity : null
    if (ref != null && moving.has(ref)) return scene
  }
  const ordered = sceneTree(scene)
    .flatMap((r) => (r.kind === 'folder' ? r.entities : [r.entity]))
    .map((e) => e.name)
    .filter((n) => moving.has(n))
  let next = scene
  let prev: string | null = null
  for (const name of ordered) {
    const moved = reorderEntity(next, name, prev ? { afterEntity: prev } : target)
    // First move failing (unknown target) must not half-apply the rest.
    if (prev == null && moved === next) return scene
    next = moved
    prev = name
  }
  return next
}

/**
 * Moves a whole folder (block and all) to a root-level drop slot. Dropping
 * into a folder is not a thing: folders don't nest.
 */
export function reorderFolder(scene: SceneJson, name: string, target: Exclude<DropTarget, { into: string }>): SceneJson {
  const rows = sceneTree(scene)
  const from = rows.findIndex((r) => r.kind === 'folder' && r.name === name)
  if (from < 0) return scene
  const [row] = rows.splice(from, 1)
  if (target === 'end') {
    rows.push(row!)
    return fromTree(scene, rows)
  }
  const idx = targetIndex(rows, target)
  if (idx < 0) return scene
  const slot = 'afterEntity' in target || 'afterFolder' in target ? idx + 1 : idx
  rows.splice(slot, 0, row!)
  return fromTree(scene, rows)
}

export function removeEntity(scene: SceneJson, name: string): SceneJson {
  return { ...scene, entities: scene.entities.filter((e) => e.name !== name) }
}

export function removeEntities(scene: SceneJson, names: string[]): SceneJson {
  const doomed = new Set(names)
  return { ...scene, entities: scene.entities.filter((e) => !doomed.has(e.name)) }
}

export function renameEntity(scene: SceneJson, from: string, to: string): SceneJson {
  const next = {
    ...scene,
    entities: scene.entities.map((e) => (e.name === from ? { ...e, name: to } : e)),
  }
  // The camera follows entities by name: renames must not break the link.
  if (scene.camera?.follow === from) return setCameraProp(next, 'follow', to)
  return next
}

export function moveEntity(scene: SceneJson, name: string, position: [number, number]): SceneJson {
  return {
    ...scene,
    entities: scene.entities.map((e) => (e.name === name ? { ...e, position } : e)),
  }
}

export function setComponentProp(
  scene: SceneJson,
  entityName: string,
  componentType: string,
  key: string,
  value: unknown,
  prefabs?: Record<string, PrefabJson>,
): SceneJson {
  return {
    ...scene,
    entities: scene.entities.map((e) => {
      if (e.name !== entityName) return e
      if (prefabOwns(e, componentType, prefabs)) {
        return {
          ...e,
          overrides: {
            ...e.overrides,
            [componentType]: { ...e.overrides?.[componentType], [key]: value },
          },
        }
      }
      return {
        ...e,
        components: (e.components ?? []).map((c) =>
          c.type === componentType ? { ...c, props: { ...c.props, [key]: value } } : c,
        ),
      }
    }),
  }
}

/** How many props this instance overrides on top of its prefab. */
export function countOverrides(entity: SceneEntityJson): number {
  return Object.values(entity.overrides ?? {}).reduce((n, props) => n + Object.keys(props).length, 0)
}

/** Drops every instance override so all props fall back to the prefab's values. */
export function clearAllOverrides(scene: SceneJson, entityName: string): SceneJson {
  return {
    ...scene,
    entities: scene.entities.map((e) => {
      if (e.name !== entityName || !e.overrides) return e
      const { overrides: _all, ...entity } = e
      return entity
    }),
  }
}

/**
 * Drops one instance override so the prop falls back to the prefab's value.
 * Empty override maps are removed so the entity serializes clean.
 */
export function clearComponentOverride(
  scene: SceneJson,
  entityName: string,
  componentType: string,
  key: string,
): SceneJson {
  return {
    ...scene,
    entities: scene.entities.map((e) => {
      if (e.name !== entityName) return e
      const props = e.overrides?.[componentType]
      if (!props || !(key in props)) return e
      const { [key]: _prop, ...restProps } = props
      const { [componentType]: _comp, ...otherOverrides } = e.overrides ?? {}
      const overrides =
        Object.keys(restProps).length > 0
          ? { ...otherOverrides, [componentType]: restProps }
          : otherOverrides
      if (Object.keys(overrides).length === 0) {
        const { overrides: _all, ...entity } = e
        return entity
      }
      return { ...e, overrides }
    }),
  }
}

/** Replaces an inline component's props wholesale (animation editor save). */
export function setComponentProps(
  scene: SceneJson,
  entityName: string,
  componentType: string,
  props: Record<string, unknown>,
): SceneJson {
  return {
    ...scene,
    entities: scene.entities.map((e) =>
      e.name === entityName
        ? {
            ...e,
            components: (e.components ?? []).map((c) =>
              c.type === componentType ? { ...c, props: structuredClone(props) } : c,
            ),
          }
        : e,
    ),
  }
}

export function addComponent(scene: SceneJson, entityName: string, type: string): SceneJson {
  return {
    ...scene,
    entities: scene.entities.map((e) => {
      if (e.name !== entityName) return e
      if ((e.components ?? []).some((c) => c.type === type)) return e
      return { ...e, components: [...(e.components ?? []), { type, props: {} }] }
    }),
  }
}

export function removeComponent(
  scene: SceneJson,
  entityName: string,
  type: string,
  prefabs?: Record<string, PrefabJson>,
): SceneJson {
  const entity = scene.entities.find((e) => e.name === entityName)
  // Per-instance removal of a prefab-owned component is out of scope for now:
  // it would need a "disabled components" marker in the overrides format.
  if (entity && prefabOwns(entity, type, prefabs)) return scene
  return {
    ...scene,
    entities: scene.entities.map((e) =>
      e.name === entityName
        ? { ...e, components: (e.components ?? []).filter((c) => c.type !== type) }
        : e,
    ),
  }
}
