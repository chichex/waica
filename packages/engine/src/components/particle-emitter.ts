import { Component, type ParamSpec } from '../component.js'

export type ParticleVector = [number, number]
export type ParticleSpace = 'world' | 'local'
export type ParticleOverflow = 'recycle-oldest' | 'drop-new'
export type ParticleDestroyMode = 'clear' | 'drain'
export type ParticleBlend = 'normal' | 'additive'

/** A fixed-capacity source of short-lived, batched 2D particles. */
export class ParticleEmitter extends Component {
  static override componentName = 'ParticleEmitter'
  static override displayName = 'Particle Emitter'
  static override params = {
    rate: { label: 'Rate', min: 0 },
    emitting: { label: 'Emitting' },
    lifetime: { label: 'Lifetime', min: 0 },
    positionSpread: { label: 'Position spread', kind: 'vector2' },
    velocity: { label: 'Velocity', kind: 'vector2' },
    velocitySpread: { label: 'Velocity spread', kind: 'vector2' },
    gravity: { label: 'Gravity', kind: 'vector2' },
    space: { label: 'Space', options: ['world', 'local'] },
    seed: { label: 'Seed', step: 1 },
    capacity: { label: 'Capacity', min: 1, step: 1 },
    overflow: { label: 'Overflow', options: ['recycle-oldest', 'drop-new'] },
    destroyMode: { label: 'On destroy', options: ['clear', 'drain'] },
    width: { label: 'Width', min: 0 },
    height: { label: 'Height', min: 0 },
    startScale: { label: 'Start scale', min: 0 },
    endScale: { label: 'End scale', min: 0 },
    startColor: { label: 'Start color', kind: 'color' },
    endColor: { label: 'End color', kind: 'color' },
    startAlpha: { label: 'Start alpha', min: 0, max: 1 },
    endAlpha: { label: 'End alpha', min: 0, max: 1 },
    texture: { label: 'Texture', kind: 'texture' },
    pixelArt: { label: 'Pixel art' },
    blend: { label: 'Blend', options: ['normal', 'additive'] },
    layer: { label: 'Layer', step: 1 },
  } satisfies Record<string, ParamSpec>

  rate = 0
  emitting = true
  lifetime = 1
  positionSpread: ParticleVector = [0, 0]
  velocity: ParticleVector = [0, 0]
  velocitySpread: ParticleVector = [0, 0]
  gravity: ParticleVector = [0, 0]
  space: ParticleSpace = 'world'
  seed = 1
  capacity = 256
  overflow: ParticleOverflow = 'recycle-oldest'
  destroyMode: ParticleDestroyMode = 'clear'
  width = 1
  height = 1
  startScale = 1
  endScale = 1
  startColor = 0xffffff
  endColor = 0xffffff
  startAlpha = 1
  endAlpha = 0
  texture = ''
  pixelArt = false
  blend: ParticleBlend = 'normal'
  layer = 0
}
