// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The example has no dependency on three of its own, so the mock targets the
// engine's copy: the WebGLRenderer is the one thing happy-dom cannot host.
vi.mock(
  new URL('../../../packages/engine/node_modules/three/build/three.module.js', import.meta.url)
    .pathname,
  async (importOriginal) => {
    const actual = await importOriginal<Record<string, unknown>>()
    class WebGLRenderer {
      readonly domElement: HTMLCanvasElement
      constructor({ canvas }: { canvas: HTMLCanvasElement }) {
        this.domElement = canvas
      }
      setPixelRatio(): void {}
      setSize(): void {}
      setViewport(): void {}
      setScissor(): void {}
      setScissorTest(): void {}
      setClearColor(): void {}
      clear(): void {}
      render(): void {}
      setAnimationLoop(): void {}
      dispose(): void {}
    }
    return { ...actual, WebGLRenderer }
  },
)

import { Game, installArchetype, installDirectionalAnimation, resetRegistries, type Entity } from '@waica/engine'
import { Health, IsoMotor } from '@waica/behaviors'
import { ARCHETYPE, ISOMETRIC_CAVE_SCENE, ISOMETRIC_SCENE } from '@waica/archetype-isometric'
// Not part of @waica/engine's public entry point (ADR 0013 keeps it a test
// seam, not a shipped API) — reached the same way demo-combat.test.ts and
// demo-scene-swap.test.ts reach the engine's own three copy: a relative
// filesystem path into the package's source.
import { FakeAudioBackend, flush } from '../../../packages/engine/src/audio/test-helpers.js'
import controls from './controls.json'
import stats from './stats.json'

class ResizeObserverStub {
  observe(): void {}
  disconnect(): void {}
}

const DT = 1 / 60

/**
 * Resolves a "waica:" art uri to its actual loadable URL — the same
 * resolver `resolveProps` runs every scene/prefab string prop through, and
 * the one main.ts's own `registry.resolveAsset` delegates to. A raw
 * "waica:xxx" string is never itself fetchable: `game.audio.play()`, unlike
 * a component prop, does not resolve anything on its own, so a host calling
 * it directly (as CA-19's music line does) must resolve first.
 */
const resolveAsset = (uri: string): string => ARCHETYPE.registry.resolveAsset?.(uri) ?? uri

const MUSIC_URI = resolveAsset('waica:iso-town-theme')
const SWING_URI = resolveAsset('waica:iso-sword-swing')
const ORC_HURT_URI = resolveAsset('waica:iso-hit')
const PLAYER_HURT_URI = resolveAsset('waica:iso-hurt')

/** Fires an untracked, unbound key so it unlocks audio (CA-6) without also driving any game action. */
function unlock(): void {
  window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyQ' }))
}

/**
 * The shipped demo, booted exactly as main.ts boots it (CA-17's scene
 * catalog, same as demo-scene-swap.test.ts) plus CA-19's own addition: the
 * music bed started right next to `loadSceneByName('main')`, preloaded the
 * same way. `backend` stands in for the real WebAudio implementation
 * (ADR 0013) so every call the subsystem makes is inspectable.
 */
function makeDemo(backend: FakeAudioBackend) {
  const canvas = document.createElement('canvas')
  Object.defineProperties(canvas, {
    clientWidth: { value: 640 },
    clientHeight: { value: 360 },
  })
  document.body.append(canvas)
  installArchetype(ARCHETYPE.bundle)
  installDirectionalAnimation(ARCHETYPE.animation ?? null)
  const game = new Game({ canvas, bindings: controls.bindings, stats: stats.stats, audio: backend })
  // The real demo's first unlock comes from whatever key the player presses
  // first (movement, attack, ...) — always after boot, never before. Here it
  // stands in for that same gesture so the mirror of main.ts's own play()
  // call below (also issued at boot) actually registers, exactly like every
  // other audio-gated assertion in packages/engine/src/audio/game-audio.test.ts.
  unlock()
  game.registerSceneCatalog({
    scenes: { main: ISOMETRIC_SCENE, cave: ISOMETRIC_CAVE_SCENE },
    registry: ARCHETYPE.registry,
  })
  game.loadSceneByName('main')
  // Mirrors the lines CA-19 adds to examples/isometric/src/main.ts, resolved
  // through the same registry `resolveProps` uses for every other asset uri.
  void game.audio.preload([SWING_URI, ORC_HURT_URI, PLAYER_HURT_URI, MUSIC_URI])
  const musicHandle = game.audio.play(MUSIC_URI, { channel: 'music', loop: true, scope: 'session' })

  return {
    game,
    musicHandle,
    find(name: string): Entity {
      const entity = game.entities.find((candidate) => candidate.name === name)
      if (!entity) throw new Error(`no entity "${name}"`)
      return entity
    },
    frame(dt = DT) {
      ;(game as unknown as { runFrame(value: number): void }).runFrame(dt)
    },
    frames(seconds: number) {
      for (let t = 0; t < seconds - 1e-9; t += DT) this.frame()
    },
    press(action: string) {
      expect(game.input.injectAction(action, 'press')).toBe(true)
    },
  }
}

/**
 * Lands one sword strike on the orc (swing + the orc's hit sound) without
 * killing it, then walks the player into it (the player's hurt sound) —
 * the same two choreographies demo-combat.test.ts exercises separately,
 * chained here to fire all three combat sounds against a single demo.
 */
async function triggerCombatSounds(demo: ReturnType<typeof makeDemo>): Promise<void> {
  const player = demo.find('Player')
  const orc = demo.find('Orc')
  const motor = player.get(IsoMotor)!
  const orcHealth = orc.get(Health)!

  // Stand screen-west of the orc — logical (-x, +y) — out of contact range, facing it.
  player.position.set(orc.position.x - 0.85, orc.position.y + 0.85, 0)
  motor.facing = 'e'
  demo.press('attack')
  demo.frame()
  await flush()
  expect(orcHealth.current).toBe(1) // struck once, still alive

  // Let the attack animation clear, then overlap the orc from its -x side —
  // the same contact demo-combat.test.ts uses to trigger the player's hurt.
  demo.frames(0.4)
  const currentOrc = demo.find('Orc')
  player.position.set(currentOrc.position.x - 0.5, currentOrc.position.y, 0)
  demo.frame()
  await flush()
  expect(player.get(Health)!.current).toBe(2) // took the orc's contact damage
}

beforeEach(() => {
  document.body.innerHTML = ''
  vi.stubGlobal('ResizeObserver', ResizeObserverStub)
})

afterEach(() => {
  vi.unstubAllGlobals()
  resetRegistries()
})

describe('CA-19 — the isometric demo sounds', () => {
  it('plays the swing sound, the sound of the orc taking a hit, and the sound of the player getting hurt', async () => {
    const backend = new FakeAudioBackend()
    const demo = makeDemo(backend)

    await triggerCombatSounds(demo)

    const byUri = (uri: string) => backend.playCalls.filter((call) => call.resource === uri)
    expect(byUri(SWING_URI)).toEqual([{ resource: SWING_URI, channel: 'sfx', volume: 1, loop: false }])
    expect(byUri(ORC_HURT_URI)).toEqual([{ resource: ORC_HURT_URI, channel: 'sfx', volume: 1, loop: false }])
    expect(byUri(PLAYER_HURT_URI)).toEqual([{ resource: PLAYER_HURT_URI, channel: 'sfx', volume: 1, loop: false }])
  })

  it('starts a looping, session-scoped music bed on the "music" channel at boot', async () => {
    const backend = new FakeAudioBackend()
    const demo = makeDemo(backend)
    await flush()

    expect(backend.playCalls).toEqual(
      expect.arrayContaining([{ resource: MUSIC_URI, channel: 'music', volume: 1, loop: true }]),
    )
    expect(demo.game.audio.liveSounds()).toEqual(
      expect.arrayContaining([{ uri: MUSIC_URI, channel: 'music', scope: 'session' }]),
    )
    expect(demo.musicHandle.playing).toBe(true)
    // CA-9's preload (the pattern the demo is meant to show) fetched all four
    // shipped sounds up front, so the first swing never pays for the load.
    expect(backend.loadCalls.map((call) => call.uri).sort()).toEqual(
      [SWING_URI, ORC_HURT_URI, PLAYER_HURT_URI, MUSIC_URI].sort(),
    )
  })

  it(
    'crossing the Scene Transition leaves the music bed exactly as it was — the same live ' +
      'sound, never restarted — while every combat sound from the previous scene is gone',
    async () => {
      const backend = new FakeAudioBackend()
      const demo = makeDemo(backend)

      await triggerCombatSounds(demo)

      // Before the swap: the three scene-scoped combat sounds and the
      // session-scoped music bed are all live together.
      expect(demo.game.audio.liveSounds().map((sound) => sound.uri).sort()).toEqual(
        [SWING_URI, ORC_HURT_URI, PLAYER_HURT_URI, MUSIC_URI].sort(),
      )

      const door = demo.find('Door')
      demo.find('Player').position.set(door.position.x, door.position.y, 0)
      demo.frame() // dispatches the collision: SceneTransition enqueues the swap
      demo.frame() // flushes the enqueued swap at this frame's start (CA-7 / ADR 0012)
      await flush()

      expect(demo.game.sceneName).toBe('cave')

      // The decisive assertion: the music is not merely present after the
      // swap (a restarted bed would satisfy that too) — it is the exact
      // same live sound, never stopped and never re-started. Every
      // scene-scoped combat sound, in contrast, is gone.
      expect(demo.game.audio.liveSounds()).toEqual([{ uri: MUSIC_URI, channel: 'music', scope: 'session' }])
      expect(demo.musicHandle.playing).toBe(true)
      // Exactly one play() call for the music uri across the WHOLE test: a
      // restart would show up here as a second entry.
      expect(backend.playCalls.filter((call) => call.resource === MUSIC_URI)).toHaveLength(1)
      // And the backend playback behind that one call was never told to stop.
      const musicPlayback = backend.playbacks.find((playback) => playback.resource === MUSIC_URI)
      expect(musicPlayback?.stops).toEqual([])
    },
  )
})
