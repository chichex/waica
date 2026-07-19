import type { SceneEntityJson, SceneJson } from '@waica/engine'

/** Mutaciones puras sobre la escena (la fuente de verdad del editor). */

export function findEntity(scene: SceneJson, name: string): SceneEntityJson | undefined {
  return scene.entities.find((e) => e.name === name)
}

/** Nombre único: "Coin" → "Coin-3" si ya existe. */
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
  return {
    ...scene,
    entities: scene.entities.map((e) => (e.name === from ? { ...e, name: to } : e)),
  }
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
): SceneJson {
  return {
    ...scene,
    entities: scene.entities.map((e) => {
      if (e.name !== entityName) return e
      return {
        ...e,
        components: (e.components ?? []).map((c) =>
          c.type === componentType ? { ...c, props: { ...c.props, [key]: value } } : c,
        ),
      }
    }),
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

export function removeComponent(scene: SceneJson, entityName: string, type: string): SceneJson {
  return {
    ...scene,
    entities: scene.entities.map((e) =>
      e.name === entityName
        ? { ...e, components: (e.components ?? []).filter((c) => c.type !== type) }
        : e,
    ),
  }
}
