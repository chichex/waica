import type { SceneLightingJson, ScenePostJson } from './scene.js'

/** The Ambient Light: a `#rrggbb` color and an intensity in 0..1. */
export interface AmbientLight {
  color: string
  intensity: number
}

export interface VignetteEffect {
  /** How dark the corners get: 0 none, 1 black. */
  intensity: number
  /** Where the darkening starts, from the centre (0) to the corners (1). */
  radius: number
}

export interface ColorGradeEffect {
  /** A `#rrggbb` multiplier over the frame. */
  tint: string
  /** 1 leaves contrast unchanged; 0 flattens to grey, 2 doubles it. */
  contrast: number
  /** 1 leaves saturation unchanged; 0 is greyscale, 2 doubles it. */
  saturation: number
}

/** The scene's Post Effects; null is an effect that is off. */
export interface PostEffectsState {
  vignette: VignetteEffect | null
  colorGrade: ColorGradeEffect | null
}

/** One field of a scene's `render` block that is outside its range, for validate_project. */
export interface SceneRenderIssue {
  field: string
  message: string
}

const WHITE = '#ffffff'
const HEX_COLOR = /^#[0-9a-f]{6}$/i

/** Each numeric field's range (inference 12). */
const RANGES = {
  'render.lighting.ambient.intensity': [0, 1],
  'render.post.vignette.intensity': [0, 1],
  'render.post.vignette.radius': [0, 1],
  'render.post.colorGrade.contrast': [0, 2],
  'render.post.colorGrade.saturation': [0, 2],
} as const satisfies Record<string, readonly [number, number]>

type RangedField = keyof typeof RANGES

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function recordOf(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

/** A `#rrggbb` color in lower case, or `fallback` for anything else. */
export function hexColorOr(value: unknown, fallback: string): string {
  return typeof value === 'string' && HEX_COLOR.test(value) ? value.toLowerCase() : fallback
}

/** A finite number clamped to the field's range, or `fallback` for anything else. */
function rangedOr(value: unknown, field: RangedField, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  const [min, max] = RANGES[field]
  return Math.min(max, Math.max(min, value))
}

/**
 * The scene's starting Ambient Light: full white light unless `render.lighting.ambient`
 * says otherwise. Runtime clamping (inference 11): an out-of-range value is
 * clamped and an unreadable one falls back to its default, never thrown.
 */
export function resolveAmbientLight(json: SceneLightingJson | undefined): AmbientLight {
  const ambient = recordOf(recordOf(json).ambient)
  return {
    color: hexColorOr(ambient.color, WHITE),
    intensity: rangedOr(ambient.intensity, 'render.lighting.ambient.intensity', 1),
  }
}

/** A vignette as the runtime applies it, clamped; null when the scene has none. */
export function resolveVignette(value: unknown): VignetteEffect | null {
  if (!isRecord(value)) return null
  return {
    intensity: rangedOr(value.intensity, 'render.post.vignette.intensity', 0.5),
    radius: rangedOr(value.radius, 'render.post.vignette.radius', 0.5),
  }
}

/** A color grade as the runtime applies it, absent fields neutral; null when the scene has none. */
export function resolveColorGrade(value: unknown): ColorGradeEffect | null {
  if (!isRecord(value)) return null
  return {
    tint: hexColorOr(value.tint, WHITE),
    contrast: rangedOr(value.contrast, 'render.post.colorGrade.contrast', 1),
    saturation: rangedOr(value.saturation, 'render.post.colorGrade.saturation', 1),
  }
}

/** The scene's starting Post Effects: every one off unless `render.post` turns it on. */
export function resolvePostEffects(json: ScenePostJson | undefined): PostEffectsState {
  const post = recordOf(json)
  return { vignette: resolveVignette(post.vignette), colorGrade: resolveColorGrade(post.colorGrade) }
}

const shown = (value: unknown): string => (typeof value === 'string' ? JSON.stringify(value) : String(value))

function rangeIssue(field: RangedField, value: unknown, issues: SceneRenderIssue[]): void {
  const [min, max] = RANGES[field]
  if (typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max) return
  issues.push({ field, message: `${field} must be a number from ${min} to ${max}; got ${shown(value)}.` })
}

function colorIssue(field: string, value: unknown, issues: SceneRenderIssue[]): void {
  if (value === undefined || (typeof value === 'string' && HEX_COLOR.test(value))) return
  issues.push({ field, message: `${field} must be a #rrggbb color; got ${shown(value)}.` })
}

/** The block at `field`, reporting it when present but not an object; undefined when absent or wrong. */
function block(parent: Record<string, unknown>, key: string, field: string, issues: SceneRenderIssue[]): Record<string, unknown> | undefined {
  const value = parent[key]
  if (value === undefined) return undefined
  if (isRecord(value)) return value
  issues.push({ field, message: `${field} must be an object; got ${shown(value)}.` })
  return undefined
}

function lightingIssues(render: Record<string, unknown>, issues: SceneRenderIssue[]): void {
  const lighting = block(render, 'lighting', 'render.lighting', issues)
  const ambient = lighting && block(lighting, 'ambient', 'render.lighting.ambient', issues)
  if (!ambient) return
  colorIssue('render.lighting.ambient.color', ambient.color, issues)
  if (ambient.intensity !== undefined) rangeIssue('render.lighting.ambient.intensity', ambient.intensity, issues)
}

function postIssues(render: Record<string, unknown>, issues: SceneRenderIssue[]): void {
  const post = block(render, 'post', 'render.post', issues)
  if (!post) return
  const vignette = block(post, 'vignette', 'render.post.vignette', issues)
  if (vignette) {
    rangeIssue('render.post.vignette.intensity', vignette.intensity, issues)
    rangeIssue('render.post.vignette.radius', vignette.radius, issues)
  }
  const grade = block(post, 'colorGrade', 'render.post.colorGrade', issues)
  if (!grade) return
  colorIssue('render.post.colorGrade.tint', grade.tint, issues)
  if (grade.contrast !== undefined) rangeIssue('render.post.colorGrade.contrast', grade.contrast, issues)
  if (grade.saturation !== undefined) rangeIssue('render.post.colorGrade.saturation', grade.saturation, issues)
}

/**
 * Every field of a scene's `render.lighting` and `render.post` that is
 * outside its range, each with a message naming the field and its range —
 * what the MCP scene validation reports (CA-2). Other render fields are not
 * checked here.
 */
export function sceneRenderIssues(render: unknown): SceneRenderIssue[] {
  if (!isRecord(render)) return []
  const issues: SceneRenderIssue[] = []
  lightingIssues(render, issues)
  postIssues(render, issues)
  return issues
}
