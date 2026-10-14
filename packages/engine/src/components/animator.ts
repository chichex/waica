import * as THREE from 'three/webgpu'
import type { ModelHandle } from '../assets/model-cache.js'
import type { ClipTarget } from '../animation/clip-target.js'
import { poseHash } from '../animation/pose-hash.js'
import { Component, type ComponentSpace, type ParamSpec } from '../component.js'
import { reportRejection } from '../report-rejection.js'
import { Model } from './model.js'

/** Per-clip overrides, keyed by the glTF's clip name: a one-shot (`loop: false`) and a playback rate. */
export interface AnimatorClipOverride {
  /** Defaults to true; false plays the clip once and holds its last pose. */
  loop?: boolean
  /** Playback rate; 1 by default, 2 finishes in half the time. */
  speed?: number
}

/** What `inspect_runtime` shows of an Animator. */
export interface AnimatorState {
  loaded: boolean
  /** The playing clip; null before the first play (an undefined would project as an unsupported marker). */
  current: string | null
  /** The current action's time in seconds (0 with none). */
  time: number
  /** False before the model loaded or with no clip playing. */
  playing: boolean
  /** The pose fingerprint of the rig (see poseHash); empty with no skeleton. */
  poseHash: string
}

/**
 * Plays the glTF clips of the Model beside it (issue #166, ADR 0029): the
 * 3D Clip Target. One AnimationMixer over the Model's own clone, one action
 * per clip, advanced by the Simulation Step in onUpdate — nothing runs per
 * render frame, so the pose is deterministic and visible step by step. A
 * StateMachine finds it like it finds an AnimatedSprite and plays the clip of
 * each state; `clip:end` fires when a `loop: false` clip finishes. A `play`
 * before the model loaded is remembered and applied when it settles;
 * otherwise `initialClip` plays then. In a 2D scene it creates nothing.
 */
export class Animator extends Component implements ClipTarget {
  static override componentName = 'Animator'
  static override space: ComponentSpace = '3d'
  static override updateAfter: readonly string[] = ['StateMachine']
  static override params = {
    initialClip: { label: 'Initial clip' },
    fade: { label: 'Fade (s)', min: 0, max: 1, step: 0.05 },
  } satisfies Record<string, ParamSpec>
  static override transient = ['current', 'mixer', 'actions', 'active', 'requested', 'finished', 'root', 'warned', 'attached', 'handle', 'names', 'pending']

  /** The clip that plays once the model settles, when nothing asked for one before. */
  initialClip = ''
  /** Crossfade between clips, in seconds; 0 cuts. */
  fade = 0.15
  /**
   * Per-clip overrides by glTF clip name (authored in JSON, like
   * AnimatedSprite.clips). Read when the actions are built, as the model
   * settles: a change after that applies on the next build (a Model rebuild).
   */
  clips: Record<string, AnimatorClipOverride> = {}

  /** The clip playing now; undefined before the first play. */
  current: string | undefined

  private mixer: THREE.AnimationMixer | null = null
  private readonly actions = new Map<string, THREE.AnimationAction>()
  private active: THREE.AnimationAction | null = null
  /** A play asked for before the model loaded. */
  private requested: string | undefined
  private finished = false
  private root: THREE.Object3D | null = null
  private readonly warned = new Set<string>()
  private attached = false
  /** The Model handle the mixer was built over, or is waiting on: a Model rebuild replaces it (review of PR #168). */
  private handle: ModelHandle | null = null
  /** The clip names, computed once per build: the StateMachine reads them every step. */
  private names: readonly string[] = []
  /** True while clips are expected but not listed yet (the glb is loading); false once built, or once no Model can provide them. */
  private pending = false

  get clipNames(): readonly string[] {
    return this.names
  }

  get clipFinished(): boolean {
    return this.finished
  }

  get clipsPending(): boolean {
    return this.pending
  }

  /**
   * How far the playing clip is, from 0 at its start to 1 at its end (issue
   * #181): its time over its duration, so a finished one-shot holds 1 and a
   * loop starts over at 0. 0 while nothing plays.
   */
  get clipProgress(): number {
    const action = this.active
    if (!action) return 0
    const { duration } = action.getClip()
    return duration > 0 ? Math.min(action.time / duration, 1) : 1
  }

  override onReady(): void {
    if (this.game.space !== '3d') return
    this.pending = true
    this.attach()
  }

  /** Plays a clip: a no-op for the running one, a restart for a finished one, a crossfade from any other over `fade` seconds. */
  play(name: string): void {
    if (this.game.space !== '3d') return
    if (!this.mixer) {
      this.requested = name
      return
    }
    const action = this.actions.get(name)
    if (!action) {
      this.warnOnce(name, `[waica] "${this.entity.name}": no clip "${name}"`)
      return
    }
    if (action === this.active && !this.finished) return
    const previous = this.active
    this.active = action
    this.current = name
    this.finished = false
    action.reset().setEffectiveWeight(1).play()
    if (!previous || previous === action) return
    if (this.fade <= 0) previous.stop()
    else previous.crossFadeTo(action, this.fade, false)
  }

  override onUpdate(dt: number): void {
    if (this.game.space !== '3d') return
    // A rebuilt Model (a new src or shape) draws a new clone: the mixer over
    // the old one would animate a graph nobody draws, so it is torn down and
    // the clip it was playing is asked for again on the new one.
    if (this.attached && (this.entity.get(Model)?.handle ?? null) !== this.handle) this.detach()
    if (!this.attached) this.attach(true)
    this.mixer?.update(dt)
  }

  override onDestroy(): void {
    this.release()
    this.pending = false
  }

  override inspectState(): AnimatorState {
    return {
      loaded: this.mixer !== null,
      current: this.current ?? null,
      time: this.active?.time ?? 0,
      playing: this.active !== null && this.active.isRunning(),
      poseHash: this.root ? poseHash(this.root) : '',
    }
  }

  /**
   * Takes the sibling Model's handle and builds the mixer when it settles. A
   * Model later in the component order is not there at onReady, so the first
   * onUpdate tries once more (`final`); a primitive Model warns at once, a
   * missing one once it is certain, and either way exactly once.
   */
  private attach(final = false): void {
    const model = this.entity.get(Model)
    const handle = model?.handle
    if (!handle) {
      if ((model && !model.src) || final) {
        this.attached = true
        this.pending = false
        this.warnOnce('model', `[waica] "${this.entity.name}": Animator needs a Model with a src beside it; nothing plays`)
      }
      return
    }
    this.attached = true
    this.handle = handle
    reportRejection(
      handle.settled.then((outcome) => {
        // Only the handle still attached builds: a Model rebuilt meanwhile has a newer one.
        if (outcome === 'loaded' && this.entity.alive && !this.mixer && this.handle === handle) this.build(handle)
      }),
      'animator model settle',
    )
  }

  /** Forgets the Model's old clone and keeps the clip it played as the request for the next build. */
  private detach(): void {
    this.requested = this.current ?? this.requested
    this.release()
    this.attached = false
    this.pending = true
  }

  /** Stops and drops the mixer, its actions and the clone they ran over. */
  private release(): void {
    this.mixer?.stopAllAction()
    if (this.mixer && this.root) this.mixer.uncacheRoot(this.root)
    this.mixer = null
    this.active = null
    this.current = undefined
    this.finished = false
    this.actions.clear()
    this.names = []
    this.root = null
    this.handle = null
  }

  private build(handle: ModelHandle): void {
    const mixer = new THREE.AnimationMixer(handle.root)
    this.mixer = mixer
    this.root = handle.root
    for (const clip of handle.animations) this.actions.set(clip.name, this.configure(mixer.clipAction(clip), clip.name))
    this.names = [...this.actions.keys()]
    this.pending = false
    mixer.addEventListener('finished', (event) => {
      if (event.action === this.active) this.finished = true
    })
    const first = this.requested ?? this.initialClip
    this.requested = undefined
    if (first) this.play(first)
  }

  private configure(action: THREE.AnimationAction, name: string): THREE.AnimationAction {
    const override = this.clips[name]
    if (override?.loop === false) {
      action.setLoop(THREE.LoopOnce, 1)
      action.clampWhenFinished = true
    }
    action.timeScale = override?.speed ?? 1
    return action
  }

  private warnOnce(key: string, message: string): void {
    if (this.warned.has(key)) return
    this.warned.add(key)
    console.warn(message)
  }
}
