import { describe, expect, it, vi } from 'vitest'
import type { Entity } from '@waica/engine'
import { Lifetime } from './lifetime'

describe('Lifetime', () => {
  it('keeps its entity alive before the threshold and destroys it when accumulated dt reaches seconds', () => {
    const destroy = vi.fn()
    const lifetime = new Lifetime()
    lifetime.entity = { destroy } as unknown as Entity
    lifetime.seconds = 1

    lifetime.onUpdate(0.4)
    lifetime.onUpdate(0.59)
    expect(destroy).not.toHaveBeenCalled()

    lifetime.onUpdate(0.01)
    expect(destroy).toHaveBeenCalledOnce()
  })

  it('declares seconds as an inspector-tunable parameter', () => {
    expect(Lifetime.componentName).toBe('Lifetime')
    expect(Lifetime.params.seconds).toMatchObject({
      label: expect.any(String),
      min: expect.any(Number),
      max: expect.any(Number),
      step: expect.any(Number),
    })
  })
})
