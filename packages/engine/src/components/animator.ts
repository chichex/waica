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
  static override transient = ['current', 'mixer', 'actions', 'active', 'requested', 'finished', 'root', 'warned', 'attached']

  /** The clip that plays once the model settles, when nothing asked for one before. */
  initialClip = ''
  /** Crossfade between clips, in seconds; 0 cuts. */
  fade = 0.15
  /** Per-clip overrides by glTF clip name (authored in JSON, like AnimatedSprite.clips). */
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

  get clipNames(): readonly string[] {
    return [...this.actions.keys()]
  }

  get clipFinished(): boolean {
    return this.finished
  }

  override onReady(): void {
    if (this.game.space !== '3d') return
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
    if (!this.attached) this.attach(true)
    this.mixer?.update(dt)
  }

  override onDestroy(): void {
    this.mixer?.stopAllAction()
    if (this.mixer && this.root) this.mixer.uncacheRoot(this.root)
    this.mixer = null
    this.active = null
    this.actions.clear()
    this.root = null
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
        this.warnOnce('model', `[waica] "${this.entity.name}": Animator needs a Model with a src beside it; nothing plays`)
      }
      return
    }
    this.attached = true
    reportRejection(
      handle.settled.then((outcome) => {
        if (outcome === 'loaded' && this.entity.alive && !this.mixer) this.build(handle)
      }),
      'animator model settle',
    )
  }

  private build(handle: ModelHandle): void {
    const mixer = new THREE.AnimationMixer(handle.root)
    this.mixer = mixer
    this.root = handle.root
    for (const clip of handle.animations) this.actions.set(clip.name, this.configure(mixer.clipAction(clip), clip.name))
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
