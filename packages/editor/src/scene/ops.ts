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

export function removeEntity(scene: SceneJson, name: string): SceneJson {
  return { ...scene, entities: scene.entities.filter((e) => e.name !== name) }
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
