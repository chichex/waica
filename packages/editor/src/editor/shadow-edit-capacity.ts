import { authoringDefaults, isPerspectiveCamera, normalizeShadowBoolean, normalizeShadowOverride, PointLight, resolveEntityComponents, resolveLightShadow, resolvePerspectiveCamera, resolveSceneShadows, Sun, type ComponentClass, type Game, type LightShadowOverrides, type PrefabJson, type ResolvedSceneShadows, type SceneComponentJson, type SceneJson } from '@waica/engine'
import type { ViewportAccess } from './use-viewport-handle'

type ShadowEdit = { prefabs: Record<string, PrefabJson>; types: readonly string[] }
  & ({ names: readonly string[] } | { prefab: string })

interface ShadowComposition {
  defaults: Map<ComponentClass, Record<string, unknown>>
  policy: ResolvedSceneShadows
  camera: { near: number; far: number }
  params: Game['paramOverrides'][string] | undefined
}

function shadowKind(Class: ComponentClass | undefined): 'sun' | 'point' | null {
  if (!Class) return null
  if (Class === Sun || Class.prototype instanceof Sun) return 'sun'
  if (Class === PointLight || Class.prototype instanceof PointLight) return 'point'
  return null
}

/** JSON stays unknown until the same normalizers used by the runtime accept it. */
function shadowInputs(values: Record<string, unknown>): LightShadowOverrides & { distance?: number } {
  return {
    castShadows: normalizeShadowBoolean(values.castShadows),
    shadowMapSize: normalizeShadowOverride('shadowMapSize', values.shadowMapSize),
    shadowMaxDistance: normalizeShadowOverride('shadowMaxDistance', values.shadowMaxDistance),
    shadowBias: normalizeShadowOverride('shadowBias', values.shadowBias),
    shadowNormalBias: normalizeShadowOverride('shadowNormalBias', values.shadowNormalBias),
    shadowRadius: normalizeShadowOverride('shadowRadius', values.shadowRadius),
    distance: typeof values.distance === 'number' ? values.distance : undefined,
  }
}

/** Preflight authored 3D compositions, including while a 2D prefab preview owns the renderer. */
export function validateShadowEdit(viewport: ViewportAccess, scene: SceneJson, edit: ShadowEdit): void {
  const game = viewport()?.game()
  if (!game?.registry || scene.render?.space !== '3d') return
  const types = new Set(edit.types.filter((type) => shadowKind(game.registry?.components[type])))
  if (!types.size) return
  const policy = resolveSceneShadows(scene.render.shadows)
  const camera = shadowCamera(game, scene)
  // Defaults may be dynamic. Share only within this pure preflight, never across edits.
  const defaults = new Map<ComponentClass, Record<string, unknown>>()
  for (const entity of affectedEntities(scene, edit)) {
    const composition = { defaults, policy, camera, params: game.paramOverrides[entity.name] }
    for (const component of resolveEntityComponents(entity, edit.prefabs)) {
      if (types.has(component.type)) validateComponent(game, component, composition)
    }
  }
}

function validateComponent(game: Game, component: SceneComponentJson, composition: ShadowComposition): void {
  const Class = game.registry?.components[component.type]
  const kind = shadowKind(Class)
  if (!Class || !kind) return
  const { defaults, policy, camera, params } = composition
  let baseline = defaults.get(Class)
  if (!baseline) { baseline = authoringDefaults(Class); defaults.set(Class, baseline) }
  const values = { ...baseline, ...component.props, ...params?.[Class.componentName] }
  const settings = resolveLightShadow(kind, policy, shadowInputs(values))
  if (kind === 'sun') settings.enabled &&= hasSunCoverage(camera, settings.maxDistance)
  game.shadows.assertCapacity(settings)
}

function shadowCamera(game: Game, scene: SceneJson) {
  if (game.space === '3d' && isPerspectiveCamera(game.camera)) return game.camera
  return resolvePerspectiveCamera(scene.camera?.kind === 'perspective' ? scene.camera : undefined)
}

function hasSunCoverage(camera: ShadowComposition['camera'], maxDistance: number): boolean {
  return Number.isFinite(camera.near) && camera.near > 0 && Math.min(camera.far, maxDistance) > camera.near
}

function affectedEntities(scene: SceneJson, edit: ShadowEdit) {
  if ('prefab' in edit) return scene.entities.filter((entity) => entity.prefab === edit.prefab)
  const names = new Set(edit.names)
  return scene.entities.filter((entity) => names.has(entity.name))
}
