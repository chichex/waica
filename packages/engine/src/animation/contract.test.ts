import { describe, expect, it } from 'vitest'
import { missingClips, resolveClip, type AnimationContract } from './contract'

const CONTRACT: AnimationContract = {
  required: ['idle', 'run', 'jump', 'fall'],
  fallbacks: { run: 'idle', jump: 'idle', fall: 'jump' },
}

describe('resolveClip', () => {
  it('devuelve el clip pedido si existe', () => {
    expect(resolveClip(CONTRACT, ['idle', 'run'], 'run')).toBe('run')
  })

  it('degrada por la cadena de fallbacks', () => {
    expect(resolveClip(CONTRACT, ['idle'], 'run')).toBe('idle')
    // fall → jump → idle
    expect(resolveClip(CONTRACT, ['idle'], 'fall')).toBe('idle')
  })

  it('cae al primer clip disponible si la cadena no resuelve', () => {
    expect(resolveClip(CONTRACT, ['walk'], 'run')).toBe('walk')
  })

  it('devuelve undefined sin clips disponibles', () => {
    expect(resolveClip(CONTRACT, [], 'run')).toBeUndefined()
  })
})

describe('missingClips', () => {
  it('lista los huecos del contrato', () => {
    expect(missingClips(CONTRACT, ['idle', 'jump'])).toEqual(['run', 'fall'])
  })

  it('vacío cuando el contrato está completo', () => {
    expect(missingClips(CONTRACT, ['idle', 'run', 'jump', 'fall', 'extra'])).toEqual([])
  })
})
