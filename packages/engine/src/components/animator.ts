import * as THREE from 'three/webgpu'
import type { ModelHandle } from '../assets/model-cache.js'
import type { ClipTarget } from '../animation/clip-target.js'
import { poseHash } from '../animation/pose-hash.js'
import { Component, type ComponentSpace, type ParamSpec } from '../component.js'
import { reportRejection } from '../report-rejection.js'
import { type AnimatorBlend, blendReaders, blendSmoothing, blendsRecord, buildBlendSources } from './animator-blends.js'
export type { AnimatorBlend, AnimatorBlendPoint } from './animator-blends.js'
export { DEFAULT_BLEND_SMOOTHING } from './animator-blends.js'
import { AnimatorMix, type MixSource } from './animator-mix.js'
import { AnimatorParams } from './animator-params.js'
import { ClipSource } from './animator-sources.js'
import { Model } from './model.js'

/** Per-clip overrides, keyed by the glTF's clip name: a one-shot (`loop: false`), a playback rate and a fade-in. */
export interface AnimatorClipOverride {
  /** Defaults to true; false plays the clip once and holds its last pose. */
  loop?: boolean
  /** Playback rate; 1 by default, 2 finishes in half the time. */
  speed?: number
  /** Seconds of fade into this clip (issue #205); without it, the Animator's `fade`. 0 cuts. */
  fade?: number
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
  /** Each glb clip's effective weight, only those above 0, the ones fading out included (issue #205). */
  weights: Record<string, number>
  /** The smoothed value of every parameter the blends read or `setParam` wrote. */
  params: Record<string, number>
}

/**
 * Plays the glTF clips of the Model beside it (issue #166, ADR 0029; mixing,
 * issue #205, ADR 0033): the 3D Clip Target. One AnimationMixer over the Model's own clone, one action
 * per clip, advanced by the Simulation Step in onUpdate — nothing runs per
 * render frame, so the pose is deterministic and visible step by step. A
 * StateMachine finds it like it finds an AnimatedSprite and plays the clip of
 * each state; `clip:end` fires when a `loop: false` clip finishes. A `play`
 * before the model loaded is remembered and applied when it settles;
 * otherwise `initialClip` plays then. A fade into a clip lasts its own
 * `clips[name].fade` or `fade`, every sounding clip leaving from the weight
 * it has; `blends` are virtual clips mixing several by a `setParam` value.
 * In a 2D scene it creates nothing.
 */
export class Animator extends Component implements ClipTarget {
  static override componentName = 'Animator'
  static override space: ComponentSpace = '3d'
  static override updateAfter: readonly string[] = ['StateMachine']
  static override params = {
    initialClip: { label: 'Initial clip' },
    fade: { label: 'Fade (s)', min: 0, max: 1, step: 0.05 },
  } satisfies Record<string, ParamSpec>
  static override transient = ['current', 'mixer', 'sources', 'mix', 'params', 'built', 'requested', 'root', 'warned', 'attached', 'handle', 'names', 'pending']

  /** The clip that plays once the model settles, when nothing asked for one before. */
  initialClip = ''
  /** Crossfade between clips, in seconds; 0 cuts. */
  fade = 0.15
  /**
   * Per-clip overrides by glTF clip name (authored in JSON, like
   * AnimatedSprite.clips). `loop` and `speed` are read when the actions are
   * built, as the model settles, so a change after that applies on the next
   * build (a Model rebuild); `fade` is read at every `play`.
   */
  clips: Record<string, AnimatorClipOverride> = {}
  /**
   * 1D blends by name (`AnimatorBlend`, authored in JSON like `clips`): each
   * is a clip `play` accepts. Its `param` and `points` are read when the
   * actions are built, as the model settles; its `smoothing` every step.
   */
  blends: Record<string, AnimatorBlend> = {}

  /** The clip playing now; undefined before the first play. */
  current: string | undefined

  private mixer: THREE.AnimationMixer | null = null
  /** What `play` accepts, by name, for the current build: the file's clips, then the blends. */
  private readonly sources = new Map<string, MixSource>()
  /** The fades between them. */
  private readonly mix = new AnimatorMix()
  /** The named parameters the blends read; they outlive a rebuild. */
  private readonly params = new AnimatorParams()
  /** Each blend the current build made playable, by name, and the parameter it reads; null before a build. */
  private built: ReadonlyMap<string, string> | null = null
  /** A play asked for before the model loaded. */
  private requested: string | undefined
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
    return this.mix.target?.finished ?? false
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
    return this.mix.target?.progress ?? 0
  }

  override onReady(): void {
    if (this.game.space !== '3d') return
    this.pending = true
    this.attach()
  }

  /**
   * Plays a clip: a no-op for the running one, a restart for a finished one,
   * and from any other a fade over the clip's own `clips[name].fade`, else
   * `fade` seconds, every sounding clip leaving from the weight it has (ADR 0033).
   */
  play(name: string): void {
    if (this.game.space !== '3d') return
    if (!this.mixer) {
      this.requested = name
      return
    }
    const source = this.sources.get(name)
    if (!source) {
      this.warnOnce(name, `[waica] "${this.entity.name}": no clip "${name}"`)
      return
    }
    if (source === this.mix.target && !source.finished) return
    this.current = name
    this.mix.enter(source, this.fadeInto(name))
  }

  /**
   * Aims a named parameter at `value`; the blends reading it follow, smoothed
   * by the first blend that names it (once built, the first one the build made
   * playable). Kept when made before the model loads;
   * a value that is not a finite number is ignored with one warning.
   */
  setParam(name: string, value: number): void {
    if (this.game.space !== '3d') return
    if (!Number.isFinite(value)) {
      this.warnOnce(`param:${name}`, `[waica] "${this.entity.name}": setParam("${name}") needs a finite number; ignored`)
      return
    }
    this.params.set(name, value, this.smoothingOf(name))
  }

  override onUpdate(dt: number): void {
    if (this.game.space !== '3d') return
    this.syncModel()
    this.advance(dt)
  }

  /**
   * One step of the parameters, the fades and the mixer while the Game does
   * not simulate (issue #205): the editor's edit-mode preview of a blend
   * drives the selected entity's Animator alone through it, once per frame,
   * following its Model as onUpdate does. In Play it does nothing: onUpdate
   * steps the Animator then.
   */
  previewStep(dt: number): void {
    if (this.game.simulate || this.game.space !== '3d') return
    this.syncModel()
    this.advance(dt)
  }

  /**
   * Ends an edit-mode preview (issue #205) as a freshly built stage starts:
   * no parameter written, every clip stopped (three puts the rig back in the
   * pose its file was built in) and `initialClip`, if any, asked for again
   * from its start. In Play, or before the model loads, it does nothing.
   */
  previewReset(): void {
    if (this.game.simulate || this.game.space !== '3d' || !this.mixer) return
    this.params.clear()
    this.mix.clear()
    this.current = undefined
    if (this.initialClip) this.play(this.initialClip)
  }

  override onDestroy(): void {
    this.release()
    this.pending = false
  }

  override inspectState(): AnimatorState {
    const target = this.mix.target
    return {
      loaded: this.mixer !== null,
      current: this.current ?? null,
      time: target?.time ?? 0,
      playing: target?.playing ?? false,
      poseHash: this.root ? poseHash(this.root) : '',
      weights: this.mix.weights(),
      params: this.params.snapshot(this.blendParams()),
    }
  }

  /** One step of the parameters, then of the fades, then of the mixer. */
  private advance(dt: number): void {
    this.params.step(dt, (name) => this.smoothingOf(name))
    if (!this.mixer) return
    this.mix.step(dt)
    this.mixer.update(dt)
  }

  /** The smoothing of the first blend that reads `param`; none without one. */
  private smoothingOf(param: string): number {
    const reader = this.blendReaders().find(([, reads]) => reads === param)
    return reader === undefined ? 0 : blendSmoothing(this.authoredBlends()[reader[0]])
  }

  /** The parameters the blends read, in declaration order. */
  private blendParams(): string[] {
    return [...new Set(this.blendReaders().map(([, param]) => param))]
  }

  /**
   * Each blend's name and the parameter it reads: once built, only the blends
   * the build made playable (one it dropped decides nothing); before, every
   * authored blend that names a parameter.
   */
  private blendReaders(): (readonly [string, string])[] {
    return this.built ? [...this.built] : blendReaders(this.authoredBlends())
  }

  /** The authored blends by name; a `blends` that is not an object (JSON props arrive unchecked) warns once and counts as none. */
  private authoredBlends(): Readonly<Record<string, unknown>> {
    const blends = blendsRecord(this.blends)
    if (blends) return blends
    this.warnOnce('blends', `[waica] "${this.entity.name}": blends must be an object of blends by name; none plays`)
    return {}
  }

  /** The fade into `name`: its own `clips[name].fade` when that is a finite number ≥ 0, else `fade`. */
  private fadeInto(name: string): number {
    const own = this.clips[name]?.fade
    if (own === undefined) return this.fade
    if (typeof own === 'number' && Number.isFinite(own) && own >= 0) return own
    this.warnOnce(`fade:${name}`, `[waica] "${this.entity.name}": clips.${name}.fade must be a number of seconds ≥ 0; fading over ${this.fade}`)
    return this.fade
  }

  /**
   * Keeps the mixer on the Model's current clone. A rebuilt Model (a new src
   * or shape) draws a new clone: the mixer over the old one would animate a
   * graph nobody draws, so it is torn down and the clip it was playing is
   * asked for again on the new one. A Model listed after the Animator, which
   * onReady could not see, is attached here.
   */
  private syncModel(): void {
    if (this.attached && (this.entity.get(Model)?.handle ?? null) !== this.handle) this.detach()
    if (!this.attached) this.attach(true)
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
    this.mix.clear()
    this.mixer?.stopAllAction()
    if (this.mixer && this.root) this.mixer.uncacheRoot(this.root)
    this.mixer = null
    this.current = undefined
    this.sources.clear()
    this.built = null
    this.names = []
    this.root = null
    this.handle = null
  }

  private build(handle: ModelHandle): void {
    const mixer = new THREE.AnimationMixer(handle.root)
    this.mixer = mixer
    this.root = handle.root
    for (const clip of handle.animations) this.sources.set(clip.name, new ClipSource(clip.name, this.configure(mixer.clipAction(clip), clip.name)))
    const authored = this.authoredBlends()
    const blends = buildBlendSources({
      blends: authored,
      clips: this.clips,
      mixer,
      animations: handle.animations,
      value: (param) => this.params.value(param),
      warn: (key, message) => this.warnOnce(key, `[waica] "${this.entity.name}": ${message}`),
    })
    for (const blend of blends) this.sources.set(blend.name, blend)
    const playable = new Set(blends.map((blend) => blend.name))
    this.built = new Map(blendReaders(authored).filter(([name]) => playable.has(name)))
    this.names = [...this.sources.keys()]
    this.pending = false
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
