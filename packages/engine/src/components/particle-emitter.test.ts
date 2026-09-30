import { describe, expect, it } from 'vitest'
import * as engine from '../index.js'
import { authoringDefaults } from '../authoring-defaults.js'
import { ParticleEmitter } from './particle-emitter.js'

const EXPECTED_DEFAULTS = {
  rate: 0,
  emitting: true,
  lifetime: 1,
  positionSpread: [0, 0],
  velocity: [0, 0],
  velocitySpread: [0, 0],
  gravity: [0, 0],
  space: 'world',
  seed: 1,
  capacity: 256,
  overflow: 'recycle-oldest',
  destroyMode: 'clear',
  width: 1,
  height: 1,
  startScale: 1,
  endScale: 1,
  startColor: 0xffffff,
  endColor: 0xffffff,
  startAlpha: 1,
  endAlpha: 0,
  texture: '',
  pixelArt: false,
  blend: 'normal',
  layer: 0,
}

describe('ParticleEmitter public authoring API', () => {
  it('exports ParticleEmitter without changing the Emitter event bus', () => {
    expect(engine).toHaveProperty('ParticleEmitter')
    expect(engine.Emitter.name).toBe('Emitter')
  })

  it('exposes only the confirmed authoring defaults and generic param metadata (CA-1)', () => {
    expect(authoringDefaults(ParticleEmitter)).toEqual(EXPECTED_DEFAULTS)
    expect(ParticleEmitter.params).toMatchObject({
      positionSpread: { kind: 'vector2' },
      velocity: { kind: 'vector2' },
      velocitySpread: { kind: 'vector2' },
      gravity: { kind: 'vector2' },
      startColor: { kind: 'color' },
      endColor: { kind: 'color' },
      texture: { kind: 'texture' },
      space: { options: ['world', 'local'] },
      overflow: { options: ['recycle-oldest', 'drop-new'] },
      destroyMode: { options: ['clear', 'drain'] },
      blend: { options: ['normal', 'additive'] },
    })
  })
})
