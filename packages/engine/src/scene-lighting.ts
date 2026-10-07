import type { Light } from './components/light.js'
import type { Rgb } from './light-field.js'
import { hexColorOr, resolveAmbientLight, type AmbientLight } from './scene-render-options.js'
import type { SceneLightingJson } from './scene.js'

/** What `game.lighting.ambient` accepts: either field, a color as `#rrggbb` or a number. */
export interface AmbientLightInput {
  color?: string | number
  intensity?: number
}

/** Internal state behind a GameLighting: what its scene declared, its live Lights, its occluders' revision. */
interface LightingState {
  ambient: AmbientLight
  declared: boolean
  readonly lights: Light[]
  occluderRevision: number
}

const states = new WeakMap<GameLighting, LightingState>()

function stateOf(lighting: GameLighting): LightingState {
  const state = states.get(lighting)
  if (!state) throw new Error('a GameLighting was used before it was constructed')
  return state
}

/** `0xrrggbb` as `#rrggbb`; anything that is not a 24-bit integer as undefined. */
function hexOfNumber(value: number): string | undefined {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffff) return undefined
  return `#${value.toString(16).padStart(6, '0')}`
}

/** A `#rrggbb` color's three channels in 0..1. */
export function hexChannels(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1), 16)
  return [((value >> 16) & 0xff) / 255, ((value >> 8) & 0xff) / 255, (value & 0xff) / 255]
}

/**
 * `game.lighting` (issue #78, ADR 0026): the live scene's Ambient Light and
 * its Lights. A scene is drawn lit while it declares `render.lighting`, a
 * game sets the ambient at runtime, or a Light lives in it; otherwise it is
 * drawn exactly as an unlit scene. Everything here dies with its scene.
 */
export class GameLighting {
  constructor() {
    states.set(this, { ambient: resolveAmbientLight(undefined), declared: false, lights: [], occluderRevision: 0 })
  }

  /** The Ambient Light now, a copy: color `#rrggbb`, intensity 0..1. */
  get ambient(): AmbientLight {
    const { ambient } = stateOf(this)
    return { color: ambient.color, intensity: ambient.intensity }
  }

  /**
   * Changes the Ambient Light, field by field — tween it with `game.time.tween`
   * for a day/night cycle. Out-of-range values clamp; an unreadable color is
   * ignored. Setting it lights a scene that declared no lighting.
   */
  set ambient(value: AmbientLightInput) {
    const state = stateOf(this)
    const color = typeof value.color === 'number' ? hexOfNumber(value.color) : value.color
    state.ambient = resolveAmbientLight({
      ambient: { color: hexColorOr(color, state.ambient.color), intensity: value.intensity ?? state.ambient.intensity },
    })
    state.declared = true
  }

  /** Whether the live scene is drawn lit. */
  get active(): boolean {
    const state = stateOf(this)
    return state.declared || state.lights.length > 0
  }

  /** Every live Light, in the order they were spawned. */
  get lights(): readonly Light[] {
    return [...stateOf(this).lights]
  }

  /** Adopts a scene's `render.lighting`, replacing whatever the previous scene left. Called by Game. */
  loadScene(json: SceneLightingJson | undefined): void {
    const state = stateOf(this)
    state.ambient = resolveAmbientLight(json)
    state.declared = json !== undefined
  }

  /** Back to an unlit scene's state: full white, undeclared. Its Lights leave with their entities. */
  unloadScene(): void {
    this.loadScene(undefined)
  }
}

/** The Ambient Light as light-map multipliers: its color's channels × its intensity. */
export function ambientMultiplier(lighting: GameLighting): Rgb {
  const { color, intensity } = stateOf(lighting).ambient
  const [r, g, b] = hexChannels(color)
  return [r * intensity, g * intensity, b * intensity]
}

/** Internal: a Light joins its scene's lighting when it is ready. */
export function addLight(lighting: GameLighting, light: Light): void {
  const { lights } = stateOf(lighting)
  if (!lights.includes(light)) lights.push(light)
}

/** Internal: a destroyed Light leaves at once, so the next drawn frame no longer has it. */
export function removeLight(lighting: GameLighting, light: Light): void {
  const { lights } = stateOf(lighting)
  const index = lights.indexOf(light)
  if (index !== -1) lights.splice(index, 1)
}

/** Internal: a Tilemap's solid tiles changed (spawned, edited or destroyed); occlusion is rebuilt once. */
export function markOccludersChanged(lighting: GameLighting): void {
  stateOf(lighting).occluderRevision += 1
}

/** Internal: bumps whenever the solid tiles change, so the occluder grid is rebuilt only then (inference 9). */
export function occluderRevision(lighting: GameLighting): number {
  return stateOf(lighting).occluderRevision
}
