import { authoringDefaults, PointLight, resolveEntityComponents, Sun, type Game, type LightShadowOverrides, type PrefabJson, type SceneComponentJson, type SceneEntityJson, type SceneJson, type SceneRegistry } from '@waica/engine'
import type { ViewportAccess } from './use-viewport-handle'

const SHADOW_KEYS = ['castShadows', 'shadowMapSize', 'shadowMaxDistance', 'shadowBias', 'shadowNormalBias', 'shadowRadius'] as const

function shadowInputs(component: SceneComponentJson, registry: SceneRegistry): LightShadowOverrides {
  const Class = registry.components[component.type]
  const values = { ...(Class ? authoringDefaults(Class) : {}), ...component.props }
  return Object.fromEntries(SHADOW_KEYS.map((key) => [key, values[key]]))
}

function validateEntityShadowEdit(game: Game, entity: SceneEntityJson, registry: SceneRegistry): void {
  const live = game.find(entity.name)
  if (!live) return
  for (const component of resolveEntityComponents(entity, registry.prefabs)) {
    const Class = registry.components[component.type]
    const light = Class ? live.get(Class) : undefined
    if (light instanceof Sun || light instanceof PointLight) {
      game.shadows.validateChange(light, shadowInputs(component, registry))
    }
  }
}

/** Preflight a restored composition without replacing the valid viewport or authoring data. */
export function validateShadowEdit(viewport: ViewportAccess | undefined, scene: SceneJson, prefabs: Record<string, PrefabJson>): void {
  const game = viewport?.()?.game()
  if (!game?.registry || game.space !== '3d') return
  const registry = { ...game.registry, prefabs }
  for (const entity of scene.entities) validateEntityShadowEdit(game, entity, registry)
}
