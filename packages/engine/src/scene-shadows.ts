import type { ParamSpec } from './component.js'
import type { SceneFieldIssue } from './scene-camera-3d.js'
import type { ShadowQuality } from './scene.js'

export type { SceneShadowsJson, ShadowQuality } from './scene.js'

export interface ResolvedSceneShadows {
  quality: ShadowQuality
  maxDistance: number
}

export const SHADOW_QUALITIES: readonly ShadowQuality[] = ['off', 'low', 'medium', 'high']
export const SHADOW_MAP_SIZES: readonly number[] = [256, 512, 1024, 2048, 4096]

export type ShadowOverrideName = 'shadowMapSize' | 'shadowMaxDistance' | 'shadowBias' | 'shadowNormalBias' | 'shadowRadius'

export interface LightShadowOverrides {
  castShadows?: boolean
  shadowMapSize?: number | null
  shadowMaxDistance?: number | null
  shadowBias?: number | null
  shadowNormalBias?: number | null
  shadowRadius?: number | null
}

export interface ResolvedLightShadow {
  enabled: boolean
  mapSize: number
  maxDistance: number
  bias: number
  normalBias: number
  radius: number
}

export const SHADOW_DEFAULTS = {
  quality: 'medium', maxDistance: 40, bias: -0.0005, normalBias: 0.02, radius: 1,
} as const satisfies ResolvedSceneShadows & Pick<ResolvedLightShadow, 'bias' | 'normalBias' | 'radius'>

const PROFILE_MAP_SIZES = {
  sun: { low: 1024, medium: 2048, high: 4096 },
  point: { low: 256, medium: 512, high: 1024 },
} as const

/** Nullable fields explicitly inherit the scene/preset rather than becoming zero. */
export const SHADOW_OVERRIDE_PARAMS = {
  shadowMapSize: { label: 'Shadow map size', min: 256, max: 4096, step: 256 },
  shadowMaxDistance: { label: 'Shadow max distance', min: 0.01, max: 1000, step: 0.01 },
  shadowBias: { label: 'Shadow bias', min: -0.1, max: 0.1, step: 0.0001 },
  shadowNormalBias: { label: 'Shadow normal bias', min: 0, max: 1, step: 0.01 },
  shadowRadius: { label: 'Shadow radius', min: 0, max: 8, step: 0.1 },
} satisfies Record<ShadowOverrideName, ParamSpec>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isQuality(value: unknown): value is ShadowQuality {
  return SHADOW_QUALITIES.some((quality) => quality === value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/** Shadow flags default on, including malformed authored values; only false opts out. */
export function normalizeShadowBoolean(value: unknown): boolean {
  return value !== false
}

/** Runtime fallback/clamping only; validators still report invalid authored data. */
export function normalizeShadowOverride(name: ShadowOverrideName, value: unknown): number | null {
  if (!isFiniteNumber(value)) return null
  if (name === 'shadowMapSize') return SHADOW_MAP_SIZES.includes(value) ? value : null
  const { min, max } = SHADOW_OVERRIDE_PARAMS[name]
  return clamp(value, min, max)
}

/** Resolves the shadows block itself, independently of lighting or GPU state. */
export function resolveSceneShadows(value: unknown): ResolvedSceneShadows {
  const block = isRecord(value) ? value : {}
  return {
    quality: isQuality(block.quality) ? block.quality : SHADOW_DEFAULTS.quality,
    maxDistance: normalizeShadowOverride('shadowMaxDistance', block.maxDistance) ?? SHADOW_DEFAULTS.maxDistance,
  }
}

/** Effective policy; a point light's existing distance bounds its independent shadow range. */
export function resolveLightShadow(kind: 'sun' | 'point', scene: ResolvedSceneShadows, overrides: LightShadowOverrides & { distance?: number }): ResolvedLightShadow {
  const quality = scene.quality === 'off' ? 'medium' : scene.quality
  const maxDistance = normalizeShadowOverride('shadowMaxDistance', overrides.shadowMaxDistance) ?? scene.maxDistance
  return {
    enabled: scene.quality !== 'off' && normalizeShadowBoolean(overrides.castShadows),
    mapSize: normalizeShadowOverride('shadowMapSize', overrides.shadowMapSize) ?? PROFILE_MAP_SIZES[kind][quality],
    maxDistance: kind === 'point' ? pointShadowDistance(maxDistance, overrides.distance) : maxDistance,
    bias: normalizeShadowOverride('shadowBias', overrides.shadowBias) ?? SHADOW_DEFAULTS.bias,
    normalBias: normalizeShadowOverride('shadowNormalBias', overrides.shadowNormalBias) ?? SHADOW_DEFAULTS.normalBias,
    radius: normalizeShadowOverride('shadowRadius', overrides.shadowRadius) ?? SHADOW_DEFAULTS.radius,
  }
}

/** A zero/unreadable luminous distance is unlimited, never a zero shadow range. */
function pointShadowDistance(maxDistance: number, lightDistance: number | undefined): number {
  if (!isFiniteNumber(lightDistance) || lightDistance <= 0) return maxDistance
  return Math.min(maxDistance, lightDistance)
}

function shown(value: unknown): string {
  if (typeof value === 'object' && value !== null) {
    try {
      return JSON.stringify(value) ?? '[unserializable object]'
    } catch {
      return '[unserializable object]'
    }
  }
  return typeof value === 'string' ? JSON.stringify(value) : String(value)
}

function numericIssue(name: ShadowOverrideName, value: unknown, field: string): SceneFieldIssue | null {
  if (isFiniteNumber(value) && normalizeShadowOverride(name, value) === value) return null
  const { min, max } = SHADOW_OVERRIDE_PARAMS[name]
  const range = name === 'shadowMapSize' ? 'one of 256, 512, 1024, 2048, 4096' : `a finite number from ${min} to ${max}`
  return { field, message: `${field} must be ${range}; got ${shown(value)}.` }
}

/** Diagnoses authored values, not their runtime-normalized replacements. */
export function sceneShadowIssues(render: unknown): SceneFieldIssue[] {
  if (!isRecord(render) || render.shadows === undefined) return []
  const shadows = render.shadows
  const issues: SceneFieldIssue[] = []
  if (render.space !== '3d') {
    issues.push({ field: 'render.shadows', message: "render.shadows needs render.space '3d'; this scene is not 3d." })
  }
  if (!isRecord(shadows)) {
    issues.push({ field: 'render.shadows', message: `render.shadows must be an object; got ${shown(shadows)}.` })
    return issues
  }
  if (shadows.quality !== undefined && !isQuality(shadows.quality)) {
    issues.push({
      field: 'render.shadows.quality',
      message: `render.shadows.quality must be off, low, medium or high; got ${shown(shadows.quality)}.`,
    })
  }
  if (shadows.maxDistance !== undefined) {
    const issue = numericIssue('shadowMaxDistance', shadows.maxDistance, 'render.shadows.maxDistance')
    if (issue) issues.push(issue)
  }
  return issues
}

function booleanIssue(field: string, value: unknown): SceneFieldIssue | null {
  if (value === undefined || typeof value === 'boolean') return null
  return { field, message: `${field} must be a boolean; got ${shown(value)}.` }
}

/** Component-local field paths let callers add their prefab/entity/override context. */
export function shadowComponentIssues(type: string, props: unknown): SceneFieldIssue[] {
  if (!isRecord(props) || !['Sun', 'PointLight', 'Model'].includes(type)) return []
  const issues: SceneFieldIssue[] = []
  const castIssue = booleanIssue('castShadows', props.castShadows)
  if (castIssue) issues.push(castIssue)
  if (type === 'Model') {
    const receiveIssue = booleanIssue('receiveShadows', props.receiveShadows)
    if (receiveIssue) issues.push(receiveIssue)
    return issues
  }
  for (const name of ['shadowMapSize', 'shadowMaxDistance', 'shadowBias', 'shadowNormalBias', 'shadowRadius'] as const) {
    const value = props[name]
    if (value === undefined || value === null) continue
    const issue = numericIssue(name, value, name)
    if (issue) issues.push(issue)
  }
  return issues
}

/** Check before allocating or replacing a map; Off never needs a supported texture size. */
export function assertShadowMapCapacity(resolved: ResolvedLightShadow, maxTextureSize: number): void {
  if (!resolved.enabled) return
  if (!isFiniteNumber(maxTextureSize) || resolved.mapSize > maxTextureSize) {
    throw new RangeError(`Shadow map size ${resolved.mapSize} is unsupported by device capacity ${maxTextureSize}.`)
  }
}
