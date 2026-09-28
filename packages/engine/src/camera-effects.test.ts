// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  advanceCameraEffects,
  CameraEffects,
  layoutCameraEffects,
  type CameraEffectHandle,
} from './camera-effects'

/** One screen pixel at viewHeight 10 on a 360-pixel-high fixed resolution. */
const PIXEL = 10 / 360

function makeEffects(pixel: number | null = null): { effects: CameraEffects; host: HTMLElement } {
  const host = document.createElement('div')
  document.body.append(host)
  const effects = new CameraEffects({ host: () => host, pixel: () => pixel })
  return { effects, host }
}

function step(effects: CameraEffects, steps = 1): void {
  for (let index = 0; index < steps; index += 1) advanceCameraEffects(effects)
}

/** The shake offset after each of `steps` Simulation Steps. */
function offsets(effects: CameraEffects, steps: number): Array<{ x: number; y: number }> {
  const out: Array<{ x: number; y: number }> = []
  for (let index = 0; index < steps; index += 1) {
    step(effects)
    out.push(effects.state.shake)
  }
  return out
}

/** Settles `done` if it already resolved; undefined while it is still pending. */
async function settled(handle: CameraEffectHandle): Promise<boolean | undefined> {
  const pending = Symbol('pending')
  const result = await Promise.race([handle.done, Promise.resolve().then(() => pending)])
  return result === pending ? undefined : (result as boolean)
}

beforeEach(() => {
  document.body.innerHTML = ''
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('CameraEffects state (CA-1)', () => {
  it('starts with no shake, a clear fade and a clear flash', () => {
    const { effects } = makeEffects()
    expect(effects.state).toEqual({
      shake: { x: 0, y: 0 },
      fade: { color: '#000000', opacity: 0 },
      flash: { color: '#ffffff', opacity: 0 },
    })
  })
})

describe('shake amplitude and decay (CA-3)', () => {
  it('keeps each component within intensity · (1 − t/seconds) and ends at exactly {0,0} at seconds', async () => {
    const { effects } = makeEffects()
    const handle = effects.shake({ intensity: 0.5, seconds: 0.5 })

    const seen = offsets(effects, 30)
    for (const [index, offset] of seen.slice(0, 29).entries()) {
      const amplitude = 0.5 * (1 - (index + 1) / 30)
      expect(Math.abs(offset.x)).toBeLessThanOrEqual(amplitude + 1e-12)
      expect(Math.abs(offset.y)).toBeLessThanOrEqual(amplitude + 1e-12)
    }
    // A jitter that actually uses its range, not a constant zero.
    const ratios = seen.slice(0, 29).map((offset, index) => Math.abs(offset.x) / (0.5 * (1 - (index + 1) / 30)))
    expect(Math.max(...ratios)).toBeGreaterThan(0.5)
    expect(seen[29]).toEqual({ x: 0, y: 0 })
    expect(await settled(handle)).toBe(true)

    step(effects, 5)
    expect(effects.state.shake).toEqual({ x: 0, y: 0 })
  })

  it('decays through a named easing: the offset scales by the eased envelope over the linear one', () => {
    const linear = makeEffects().effects
    const eased = makeEffects().effects
    linear.shake({ intensity: 1, seconds: 0.5 })
    eased.shake({ intensity: 1, seconds: 0.5, easing: 'quadIn' })

    const a = offsets(linear, 29)
    const b = offsets(eased, 29)
    let compared = 0
    for (let index = 0; index < 29; index += 1) {
      const t = (index + 1) / 30
      if (Math.abs(a[index]!.x) < 1e-6) continue
      // Same step, same jitter; only the envelope differs.
      expect(b[index]!.x / a[index]!.x).toBeCloseTo((1 - t * t) / (1 - t), 9)
      compared += 1
    }
    expect(compared).toBeGreaterThan(20)
  })
})

describe('deterministic jitter (CA-4)', () => {
  it('produces identical offsets on every step for two fresh instances, without Math.random', () => {
    const random = vi.spyOn(Math, 'random')
    const first = makeEffects().effects
    const second = makeEffects().effects
    step(first, 3)
    step(second, 3)
    first.shake({ intensity: 0.5, seconds: 0.5 })
    second.shake({ intensity: 0.5, seconds: 0.5 })

    expect(offsets(first, 30)).toEqual(offsets(second, 30))
    expect(random).not.toHaveBeenCalled()
  })

  it('varies from step to step', () => {
    const { effects } = makeEffects()
    effects.shake({ intensity: 1, seconds: 1 })
    const xs = offsets(effects, 10).map((offset) => offset.x)
    expect(new Set(xs).size).toBeGreaterThan(5)
  })
})

describe('pixel snap (CA-6)', () => {
  it('rounds every offset component to a whole screen pixel under a fixed resolution, never past the envelope', () => {
    const { effects } = makeEffects(PIXEL)
    effects.shake({ intensity: 0.5, seconds: 0.5 })

    for (const [index, offset] of offsets(effects, 29).entries()) {
      const amplitude = 0.5 * (1 - (index + 1) / 30)
      for (const value of [offset.x, offset.y]) {
        expect(Math.abs(value / PIXEL - Math.round(value / PIXEL))).toBeLessThan(1e-9)
        expect(Math.abs(value)).toBeLessThanOrEqual(amplitude + 1e-12)
      }
    }
  })

  it('does not round without a resolution', () => {
    const { effects } = makeEffects(null)
    effects.shake({ intensity: 0.5, seconds: 0.5 })

    const offGrid = offsets(effects, 29).filter(
      (offset) => Math.abs(offset.x / PIXEL - Math.round(offset.x / PIXEL)) > 1e-3,
    )
    expect(offGrid.length).toBeGreaterThan(10)
  })
})

describe('overlapping shakes (CA-7)', () => {
  it('applies the larger current amplitude, each decaying on its own schedule, and ends with the last one', async () => {
    const both = makeEffects().effects
    const strongOnly = makeEffects().effects
    const weakOnly = makeEffects().effects
    const strong = both.shake({ intensity: 1, seconds: 0.5 })
    const weak = both.shake({ intensity: 0.4, seconds: 1 })
    strongOnly.shake({ intensity: 1, seconds: 0.5 })
    weakOnly.shake({ intensity: 0.4, seconds: 1 })

    const combined = offsets(both, 60)
    const strongRef = offsets(strongOnly, 60)
    const weakRef = offsets(weakOnly, 60)
    let compared = 0
    for (let index = 0; index < 59; index += 1) {
      const n = index + 1
      const strongAmp = Math.max(0, 1 - n / 30)
      const weakAmp = 0.4 * (1 - n / 60)
      const reference = strongAmp >= weakAmp ? strongRef[index]! : weakRef[index]!
      const referenceAmp = strongAmp >= weakAmp ? strongAmp : weakAmp
      const expectedAmp = Math.max(strongAmp, weakAmp)
      expect(Math.abs(combined[index]!.x)).toBeLessThanOrEqual(expectedAmp + 1e-12)
      if (Math.abs(reference.x) < 1e-6) continue
      expect(combined[index]!.x / reference.x).toBeCloseTo(expectedAmp / referenceAmp, 9)
      compared += 1
    }
    expect(compared).toBeGreaterThan(40)
    // The strong shake's own end (step 30) does not end the effect.
    expect(combined[40]).not.toEqual({ x: 0, y: 0 })
    expect(combined[59]).toEqual({ x: 0, y: 0 })
    expect(await settled(strong)).toBe(true)
    expect(await settled(weak)).toBe(true)
  })

  it('reports the strong shake done at its own end while the weak one still runs', async () => {
    const { effects } = makeEffects()
    const strong = effects.shake({ intensity: 1, seconds: 0.5 })
    const weak = effects.shake({ intensity: 0.4, seconds: 1 })
    step(effects, 30)
    expect(await settled(strong)).toBe(true)
    expect(await settled(weak)).toBeUndefined()
  })
})

describe('fade (CA-8)', () => {
  it('carries opacity linearly to 1 at seconds, holds the color afterwards and resolves done with true', async () => {
    const { effects } = makeEffects()
    const handle = effects.fade({ to: 'black', seconds: 0.5 })

    for (let n = 1; n < 30; n += 1) {
      step(effects)
      expect(effects.state.fade.opacity).toBeCloseTo(n / 30, 12)
      expect(effects.state.fade.color).toBe('#000000')
    }
    expect(await settled(handle)).toBeUndefined()
    step(effects)
    expect(effects.state.fade).toEqual({ color: '#000000', opacity: 1 })
    expect(await settled(handle)).toBe(true)
    step(effects, 10)
    expect(effects.state.fade).toEqual({ color: '#000000', opacity: 1 })
  })

  it('accepts white and #rrggbb, and clears to 0 from the current opacity', async () => {
    const { effects } = makeEffects()
    effects.fade({ to: 'white', seconds: 0 })
    step(effects)
    expect(effects.state.fade).toEqual({ color: '#ffffff', opacity: 1 })

    effects.fade({ to: '#FF00aa', seconds: 0.25 })
    step(effects)
    expect(effects.state.fade).toEqual({ color: '#ff00aa', opacity: 1 })

    const clear = effects.fade({ to: 'clear', seconds: 0.25 })
    step(effects, 5)
    expect(effects.state.fade.opacity).toBeCloseTo(1 - 5 / 15, 12)
    expect(effects.state.fade.color).toBe('#ff00aa')
    step(effects, 10)
    expect(effects.state.fade.opacity).toBe(0)
    expect(await settled(clear)).toBe(true)
  })

  it('eases through a named easing', () => {
    const { effects } = makeEffects()
    effects.fade({ to: 'black', seconds: 0.5, easing: 'quadIn' })
    step(effects, 10)
    expect(effects.state.fade.opacity).toBeCloseTo((10 / 30) ** 2, 12)
  })

  it('cancel() leaves the opacity where it was and resolves done with false', async () => {
    const { effects } = makeEffects()
    const handle = effects.fade({ to: 'black', seconds: 0.5 })
    step(effects, 12)
    handle.cancel()
    step(effects, 10)

    expect(effects.state.fade.opacity).toBeCloseTo(12 / 30, 12)
    expect(await settled(handle)).toBe(false)
    handle.cancel()
    expect(await settled(handle)).toBe(false)
  })

  it('a new fade cancels the running one and starts from the current opacity', async () => {
    const { effects } = makeEffects()
    const first = effects.fade({ to: 'black', seconds: 0.5 })
    step(effects, 15)
    const second = effects.fade({ to: 'clear', seconds: 0.25 })

    expect(await settled(first)).toBe(false)
    step(effects, 5)
    // From 0.5 toward 0 over 15 steps: 5 steps in.
    expect(effects.state.fade.opacity).toBeCloseTo(0.5 - 0.5 * (5 / 15), 12)
    step(effects, 10)
    expect(effects.state.fade.opacity).toBe(0)
    expect(await settled(second)).toBe(true)
    expect(await settled(first)).toBe(false)
  })

  it('superseded reads synchronously, and is true only once a later fade replaces this one while it is still running (PR #98 review)', () => {
    const { effects } = makeEffects()
    const first = effects.fade({ to: 'black', seconds: 0.5 })
    expect(first.superseded).toBe(false)
    step(effects, 10)
    expect(first.superseded).toBe(false)

    // Replaced by a second fade while still running (10 of 30 steps in):
    // superseded, and it reads synchronously, no microtask needed.
    const second = effects.fade({ to: 'clear', seconds: 0.25 })
    expect(first.superseded).toBe(true)
    expect(second.superseded).toBe(false)

    // The second runs all the way to completion on its own afterwards:
    // not superseded, even though nothing is "running" for it any more --
    // nobody replaced it, it just finished.
    step(effects, 20)
    expect(effects.state.fade.opacity).toBe(0)
    expect(second.superseded).toBe(false)

    // Cancelling directly (nobody replaced it) is not superseded either.
    const third = effects.fade({ to: 'white', seconds: 0.1 })
    third.cancel()
    expect(third.superseded).toBe(false)
  })
})

describe('flash (CA-9)', () => {
  it('raises its layer to 1 and back to exactly 0 within seconds', async () => {
    const { effects } = makeEffects()
    const handle = effects.flash({ color: 'white', seconds: 0.25 })

    expect(effects.state.flash).toEqual({ color: '#ffffff', opacity: 1 })
    for (let n = 1; n < 15; n += 1) {
      step(effects)
      expect(effects.state.flash.opacity).toBeCloseTo(1 - n / 15, 12)
    }
    step(effects)
    expect(effects.state.flash.opacity).toBe(0)
    expect(await settled(handle)).toBe(true)
  })

  it('never changes the Fade, and draws above it', () => {
    const { effects, host } = makeEffects()
    layoutCameraEffects(effects, { x: 0, y: 0, width: 640, height: 360 })
    effects.fade({ to: 'black', seconds: 0.5 })
    step(effects, 15)
    effects.flash({ color: '#ff0000', seconds: 0.25 })
    step(effects, 5)

    expect(effects.state.fade.color).toBe('#000000')
    expect(effects.state.fade.opacity).toBeCloseTo(20 / 30, 12)
    expect(effects.state.flash.color).toBe('#ff0000')
    const layers = [...host.querySelectorAll<HTMLElement>('[data-waica-camera-effect]')]
    const fade = layers.find((layer) => layer.dataset.waicaCameraEffect === 'fade')!
    const flash = layers.find((layer) => layer.dataset.waicaCameraEffect === 'flash')!
    expect(Number(flash.style.zIndex)).toBeGreaterThan(Number(fade.style.zIndex))
  })
})

describe('invalid arguments (CA-10)', () => {
  const cases: Array<[string, (effects: CameraEffects) => CameraEffectHandle]> = [
    ['shake with NaN seconds', (e) => e.shake({ intensity: 1, seconds: Number.NaN })],
    ['shake with negative seconds', (e) => e.shake({ intensity: 1, seconds: -1 })],
    ['shake with infinite intensity', (e) => e.shake({ intensity: Number.POSITIVE_INFINITY, seconds: 1 })],
    ['shake with negative intensity', (e) => e.shake({ intensity: -0.1, seconds: 1 })],
    ['shake with an unknown easing', (e) => e.shake({ intensity: 1, seconds: 1, easing: 'bounce' as never })],
    ['fade with an unknown color', (e) => e.fade({ to: 'red' as never, seconds: 1 })],
    ['fade with a short hex color', (e) => e.fade({ to: '#fff' as never, seconds: 1 })],
    ['fade with infinite seconds', (e) => e.fade({ to: 'black', seconds: Number.POSITIVE_INFINITY })],
    ['fade with an unknown easing', (e) => e.fade({ to: 'black', seconds: 1, easing: 'elastic' as never })],
    ['flash with an unknown color', (e) => e.flash({ color: 'clear' as never, seconds: 1 })],
    ['flash with negative seconds', (e) => e.flash({ color: 'white', seconds: -0.5 })],
  ]

  it.each(cases)('%s warns once and returns a handle whose done resolves false, changing nothing', async (_name, call) => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { effects } = makeEffects()
    const running = effects.fade({ to: 'black', seconds: 0.5 })
    step(effects, 3)
    const before = effects.state

    const handle = call(effects)

    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0]![0])).toMatch(/^\[waica\] /)
    expect(await settled(handle)).toBe(false)
    expect(effects.state).toEqual(before)
    expect(await settled(running)).toBeUndefined()
    step(effects)
    expect(effects.state.shake).toEqual({ x: 0, y: 0 })
    expect(effects.state.fade.opacity).toBeCloseTo(4 / 30, 12)
  })
})

describe('scope (CA-11)', () => {
  it('unloadScene() ends every shake and flash but keeps a running Fade', async () => {
    const { effects } = makeEffects()
    const shake = effects.shake({ intensity: 1, seconds: 1 })
    const flash = effects.flash({ color: 'white', seconds: 1 })
    const fade = effects.fade({ to: 'black', seconds: 0.5 })
    step(effects, 10)

    effects.unloadScene()

    expect(effects.state.shake).toEqual({ x: 0, y: 0 })
    expect(effects.state.flash.opacity).toBe(0)
    expect(effects.state.fade.opacity).toBeCloseTo(10 / 30, 12)
    expect(await settled(shake)).toBe(false)
    expect(await settled(flash)).toBe(false)
    step(effects, 5)
    expect(effects.state.shake).toEqual({ x: 0, y: 0 })
    expect(effects.state.fade.opacity).toBeCloseTo(15 / 30, 12)
    step(effects, 15)
    expect(effects.state.fade).toEqual({ color: '#000000', opacity: 1 })
    expect(await settled(fade)).toBe(true)
  })

  it('dispose() ends every effect and removes the layers', async () => {
    const { effects, host } = makeEffects()
    layoutCameraEffects(effects, { x: 0, y: 0, width: 640, height: 360 })
    const fade = effects.fade({ to: 'black', seconds: 0.5 })
    effects.flash({ color: 'white', seconds: 1 })
    step(effects, 2)
    expect(host.querySelectorAll('[data-waica-camera-effect]')).toHaveLength(2)

    effects.dispose()

    expect(host.querySelectorAll('[data-waica-camera-effect]')).toHaveLength(0)
    expect(await settled(fade)).toBe(false)
    expect(effects.state).toEqual({
      shake: { x: 0, y: 0 },
      fade: { color: '#000000', opacity: 0 },
      flash: { color: '#ffffff', opacity: 0 },
    })
  })
})

describe('layers (CA-13)', () => {
  it('sit above the UI overlay, ignore the pointer, match the viewport rect and hide at opacity 0', () => {
    const { effects, host } = makeEffects()
    layoutCameraEffects(effects, { x: 20, y: 0, width: 600, height: 337.5 })
    effects.fade({ to: 'white', seconds: 0.5 })
    step(effects, 3)

    const fade = host.querySelector<HTMLElement>('[data-waica-camera-effect="fade"]')!
    expect(fade.style.position).toBe('absolute')
    expect(fade.style.pointerEvents).toBe('none')
    expect(Number(fade.style.zIndex)).toBeGreaterThan(9000)
    expect([fade.style.left, fade.style.top, fade.style.width, fade.style.height]).toEqual([
      '20px',
      '0px',
      '600px',
      '337.5px',
    ])
    expect(fade.style.display).not.toBe('none')
    expect(Number(fade.style.opacity)).toBeCloseTo(3 / 30, 12)

    layoutCameraEffects(effects, { x: 0, y: 10, width: 400, height: 225 })
    expect([fade.style.left, fade.style.top, fade.style.width, fade.style.height]).toEqual([
      '0px',
      '10px',
      '400px',
      '225px',
    ])

    const flash = host.querySelector<HTMLElement>('[data-waica-camera-effect="flash"]')!
    expect(flash.style.display).toBe('none')
    effects.fade({ to: 'clear', seconds: 0 })
    step(effects)
    expect(fade.style.display).toBe('none')
  })
})
