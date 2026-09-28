import type { ViewportRect } from './anchored-pieces.js'
import { SIMULATION_STEP, SIMULATION_TIME_EPSILON } from './fixed-step.js'
import { resolveEasing, type EasingName } from './game-time.js'

/** A Camera Effect color: a name or a six-digit hex, case-insensitive. */
export type CameraEffectColor = 'black' | 'white' | `#${string}`

export interface ShakeOptions {
  /** The largest offset, in world units, on each axis. Finite and >= 0. */
  intensity: number
  /** Seconds of Game Time until the offset reaches 0. Finite and >= 0. */
  seconds: number
  /** How the amplitude decays from `intensity` to 0; default `'linear'`. */
  easing?: EasingName
}

export interface FadeOptions {
  /** The color to carry the view to (opacity 1), or `'clear'` (opacity 0, color kept). */
  to: CameraEffectColor | 'clear'
  /** Seconds of Game Time from the current opacity to the target. Finite and >= 0. */
  seconds: number
  easing?: EasingName
}

export interface FlashOptions {
  color: CameraEffectColor
  /** Seconds of Game Time from opacity 1 back to 0. Finite and >= 0. */
  seconds: number
}

/** What `shake`, `fade` and `flash` hand back. */
export interface CameraEffectHandle {
  /** Stops the effect where it is. Idempotent; resolves `done` with false. */
  cancel(): void
  /** True once the effect completed; false if cancelled, replaced, ended by its scope or invalid. */
  readonly done: Promise<boolean>
}

/** The effects' state after the last completed Simulation Step (read-only copy). */
export interface CameraEffectsState {
  /** The offset, in world units, added to the camera only while drawing. */
  shake: { x: number; y: number }
  fade: { color: string; opacity: number }
  flash: { color: string; opacity: number }
}

export interface CameraEffectsOptions {
  /** Where the Fade and Flash layers mount (the canvas's parent); resolved lazily. */
  host: () => HTMLElement
  /** One screen pixel in world units under a fixed resolution, or null (no snap). */
  pixel: () => number | null
}

type Resolve = (completed: boolean) => void

interface Timed {
  /** The step count at creation: its first advance is one step in. */
  readonly start: number
  readonly seconds: number
  readonly ease: (t: number) => number
  readonly resolve: Resolve
}

interface Shake extends Timed {
  readonly intensity: number
}

interface Fade extends Timed {
  readonly from: number
  readonly to: number
}

interface Layer {
  color: string
  opacity: number
  element: HTMLDivElement | null
}

const COLORS: Record<string, string> = { black: '#000000', white: '#ffffff' }
/** Above the UI overlay (`ui.ts`, z-index 9000): a Fade covers the HUD too. */
const FADE_Z = 9001
const FLASH_Z = 9002

const ADVANCE = Symbol('waica.cameraEffects.advance')
const LAYOUT = Symbol('waica.cameraEffects.layout')

function normalizeColor(value: unknown): string | null {
  if (typeof value !== 'string') return null
  if (Object.prototype.hasOwnProperty.call(COLORS, value)) return COLORS[value]!
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value.toLowerCase() : null
}

function validSeconds(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
}

function easingOf(value: unknown): ((t: number) => number) | null {
  if (value !== undefined && typeof value !== 'string') return null
  return resolveEasing(value as EasingName | undefined)
}

/**
 * Integer-only hash of (shake creation step, current step, axis) into
 * [0, 1): the same bits in Node and every browser (spec inference 3), so a
 * Run Session reproduces a shake frame for frame. No global RNG.
 */
function jitter(seed: number, step: number, axis: number): number {
  let h = (Math.imul(seed + 1, 0x9e3779b1) ^ Math.imul(step + 1, 0x85ebca77) ^ Math.imul(axis + 1, 0xc2b2ae3d)) >>> 0
  h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0
  h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

function settledHandle(done: Promise<boolean>, cancel: () => void): CameraEffectHandle {
  return { cancel, done }
}

/**
 * Screen-level Camera Effects (issue #74, ADR 0020): Shake, Fade and Flash,
 * beside `game.camera` and never written into it. They advance only inside
 * a Simulation Step, right after the scene camera (spec inference 9), so
 * nothing moves while the Game is not simulating or a Run Session is
 * paused. A Shake is an offset the Game adds to the camera only while it
 * draws; a Fade and a Flash are HTML layers over the letterboxed game
 * viewport, above the UI overlay. A Fade is session-scoped (it survives a
 * scene change, ADR 0011); a Shake or Flash dies with its scene.
 */
export class CameraEffects {
  private steps = 0
  private readonly shakes: Shake[] = []
  private offset = { x: 0, y: 0 }
  private fadeRun: Fade | null = null
  private flashRun: Timed | null = null
  private readonly fadeLayer: Layer = { color: '#000000', opacity: 0, element: null }
  private readonly flashLayer: Layer = { color: '#ffffff', opacity: 0, element: null }
  private rect: ViewportRect | null = null

  constructor(private readonly options: CameraEffectsOptions) {}

  /** A fresh copy of the effects after the last completed Simulation Step. */
  get state(): CameraEffectsState {
    return {
      shake: { ...this.offset },
      fade: { color: this.fadeLayer.color, opacity: this.fadeLayer.opacity },
      flash: { color: this.flashLayer.color, opacity: this.flashLayer.opacity },
    }
  }

  /**
   * Jitters the drawn view by up to `intensity` world units per axis,
   * decaying to 0 over `seconds`. Overlapping shakes apply the largest
   * current amplitude. Not re-clamped to the scene camera's limits; snapped
   * to whole screen pixels under a fixed resolution.
   */
  shake(options: ShakeOptions): CameraEffectHandle {
    const { intensity, seconds } = options
    if (!validSeconds(intensity)) return this.invalid('shake(): intensity must be a finite number >= 0')
    if (!validSeconds(seconds)) return this.invalid('shake(): seconds must be a finite number >= 0')
    const ease = easingOf(options.easing)
    if (!ease) return this.invalid('shake(): easing must be a known easing name')
    let resolve: Resolve = () => {}
    const done = new Promise<boolean>((r) => (resolve = r))
    const entry: Shake = { start: this.steps, seconds, ease, resolve, intensity }
    this.shakes.push(entry)
    return settledHandle(done, () => {
      const index = this.shakes.indexOf(entry)
      if (index === -1) return
      this.shakes.splice(index, 1)
      entry.resolve(false)
    })
  }

  /**
   * Carries the Fade layer from its current opacity to 1 in `to`'s color,
   * or to 0 with `'clear'`, over `seconds`; the result then holds. A new
   * fade cancels a running one (its `done` resolves false).
   */
  fade(options: FadeOptions): CameraEffectHandle {
    const clear = options.to === 'clear'
    const color = clear ? this.fadeLayer.color : normalizeColor(options.to)
    if (!color) return this.invalid(`fade(): unknown color "${String(options.to)}"; use 'black', 'white', '#rrggbb' or 'clear'`)
    if (!validSeconds(options.seconds)) return this.invalid('fade(): seconds must be a finite number >= 0')
    const ease = easingOf(options.easing)
    if (!ease) return this.invalid('fade(): easing must be a known easing name')
    this.fadeRun?.resolve(false)
    let resolve: Resolve = () => {}
    const done = new Promise<boolean>((r) => (resolve = r))
    const entry: Fade = {
      start: this.steps,
      seconds: options.seconds,
      ease,
      resolve,
      from: this.fadeLayer.opacity,
      to: clear ? 0 : 1,
    }
    this.fadeRun = entry
    this.fadeLayer.color = color
    this.draw()
    return settledHandle(done, () => {
      if (this.fadeRun !== entry) return
      this.fadeRun = null
      entry.resolve(false)
    })
  }

  /**
   * Shows the Flash layer at opacity 1 in `color` and returns it to exactly
   * 0 over `seconds`, independent of (and drawn above) the Fade. A new flash
   * replaces a running one.
   */
  flash(options: FlashOptions): CameraEffectHandle {
    const color = normalizeColor(options.color)
    if (!color) return this.invalid(`flash(): unknown color "${String(options.color)}"; use 'black', 'white' or '#rrggbb'`)
    if (!validSeconds(options.seconds)) return this.invalid('flash(): seconds must be a finite number >= 0')
    this.flashRun?.resolve(false)
    let resolve: Resolve = () => {}
    const done = new Promise<boolean>((r) => (resolve = r))
    const entry: Timed = { start: this.steps, seconds: options.seconds, ease: (t) => t, resolve }
    this.flashRun = entry
    this.flashLayer.color = color
    this.flashLayer.opacity = 1
    this.draw()
    return settledHandle(done, () => {
      if (this.flashRun !== entry) return
      this.flashRun = null
      this.flashLayer.opacity = 0
      this.draw()
      entry.resolve(false)
    })
  }

  /**
   * Ends every Shake and Flash (their `done` resolves false) and keeps the
   * Fade — opacity, color and any running progress. Called by
   * `Game.unloadScene()`.
   */
  unloadScene(): void {
    for (const shake of this.shakes.splice(0)) shake.resolve(false)
    this.offset = { x: 0, y: 0 }
    this.flashRun?.resolve(false)
    this.flashRun = null
    this.flashLayer.opacity = 0
    this.draw()
  }

  /** Ends every effect and removes the layers (`Game.dispose()`). */
  dispose(): void {
    this.unloadScene()
    this.fadeRun?.resolve(false)
    this.fadeRun = null
    this.fadeLayer.color = '#000000'
    this.fadeLayer.opacity = 0
    for (const layer of [this.fadeLayer, this.flashLayer]) {
      layer.element?.remove()
      layer.element = null
    }
  }

  /** Engine-internal: see advanceCameraEffects. */
  [ADVANCE](): void {
    this.steps += 1
    this.advanceShakes()
    const fade = this.fadeRun
    if (fade) {
      const t = this.progress(fade)
      this.fadeLayer.opacity = t >= 1 ? fade.to : fade.from + (fade.to - fade.from) * fade.ease(t)
      if (t >= 1) {
        this.fadeRun = null
        fade.resolve(true)
      }
    }
    const flash = this.flashRun
    if (flash) {
      const t = this.progress(flash)
      this.flashLayer.opacity = t >= 1 ? 0 : 1 - flash.ease(t)
      if (t >= 1) {
        this.flashRun = null
        flash.resolve(true)
      }
    }
    this.draw()
  }

  /** Engine-internal: see layoutCameraEffects. */
  [LAYOUT](rect: ViewportRect): void {
    this.rect = { ...rect }
    for (const layer of [this.fadeLayer, this.flashLayer]) {
      if (layer.element) this.place(layer.element)
    }
  }

  /** Normalized progress of a timed effect after the current step: 1 at (and past) its end. */
  private progress(entry: Timed): number {
    const elapsed = (this.steps - entry.start) * SIMULATION_STEP
    if (elapsed >= entry.seconds - SIMULATION_TIME_EPSILON) return 1
    return elapsed / entry.seconds
  }

  private advanceShakes(): void {
    let amplitude = 0
    let seed = 0
    for (const shake of [...this.shakes]) {
      const t = this.progress(shake)
      if (t >= 1) {
        this.shakes.splice(this.shakes.indexOf(shake), 1)
        shake.resolve(true)
        continue
      }
      const current = shake.intensity * (1 - shake.ease(t))
      if (current > amplitude) {
        amplitude = current
        seed = shake.start
      }
    }
    if (amplitude <= 0) {
      this.offset = { x: 0, y: 0 }
      return
    }
    const pixel = this.options.pixel()
    const axis = (index: number): number => {
      const raw = amplitude * (2 * jitter(seed, this.steps, index) - 1)
      // Truncating toward zero keeps a snapped offset inside the envelope.
      const snapped = pixel ? Math.trunc(raw / pixel) * pixel : raw
      return snapped + 0
    }
    this.offset = { x: axis(0), y: axis(1) }
  }

  /** Mirrors both layers' state onto their elements, mounting them on first need. */
  private draw(): void {
    const needed = this.fadeLayer.opacity > 0 || this.flashLayer.opacity > 0
    if (needed && !this.fadeLayer.element) this.mount()
    for (const layer of [this.fadeLayer, this.flashLayer]) {
      const element = layer.element
      if (!element) continue
      element.style.backgroundColor = layer.color
      element.style.opacity = String(layer.opacity)
      element.style.display = layer.opacity > 0 ? '' : 'none'
    }
  }

  private mount(): void {
    const host = this.options.host()
    if (getComputedStyle(host).position === 'static') host.style.position = 'relative'
    for (const [layer, name, z] of [
      [this.fadeLayer, 'fade', FADE_Z],
      [this.flashLayer, 'flash', FLASH_Z],
    ] as const) {
      const element = document.createElement('div')
      element.dataset.waicaCameraEffect = name
      element.style.position = 'absolute'
      element.style.pointerEvents = 'none'
      element.style.zIndex = String(z)
      element.style.display = 'none'
      this.place(element)
      host.append(element)
      layer.element = element
    }
  }

  /** Sizes a layer to the game viewport (the whole host until the Game lays it out). */
  private place(element: HTMLDivElement): void {
    const rect = this.rect
    if (!rect) {
      element.style.inset = '0'
      return
    }
    element.style.inset = ''
    element.style.left = `${rect.x}px`
    element.style.top = `${rect.y}px`
    element.style.width = `${rect.width}px`
    element.style.height = `${rect.height}px`
  }

  private invalid(message: string): CameraEffectHandle {
    console.warn(`[waica] cameraEffects.${message}`)
    return settledHandle(Promise.resolve(false), () => {})
  }
}

/**
 * Engine-internal: advances every Camera Effect by exactly one Simulation
 * Step. `Game.simulateStep()` calls it right after the scene camera, so
 * nothing advances while the Game is not simulating. Not re-exported from
 * the package entry.
 */
export function advanceCameraEffects(effects: CameraEffects): void {
  effects[ADVANCE]()
}

/** Engine-internal: sizes the Fade and Flash layers to the game viewport (`Game.resize()`). */
export function layoutCameraEffects(effects: CameraEffects, rect: ViewportRect): void {
  effects[LAYOUT](rect)
}
