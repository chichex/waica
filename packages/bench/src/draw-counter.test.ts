import { describe, expect, it } from 'vitest'
import { DRAW_ENTRY_POINTS, installDrawCounter, syncGpu } from './draw-counter.ts'

type FakePrototype = Record<string, (...args: unknown[]) => unknown>

function fakePrototype(log: string[]): FakePrototype {
  const proto: FakePrototype = {}
  for (const name of DRAW_ENTRY_POINTS) proto[name] = () => log.push(name)
  return proto
}

function call(proto: FakePrototype, name: string): void {
  const fn = proto[name]
  if (!fn) throw new Error(`missing ${name}`)
  fn()
}

describe('installDrawCounter', () => {
  it('counts every draw entry point and still calls the original', () => {
    const log: string[] = []
    const proto = fakePrototype(log)
    const counter = installDrawCounter([proto])
    for (const name of DRAW_ENTRY_POINTS) call(proto, name)
    expect(counter.calls).toBe(DRAW_ENTRY_POINTS.length)
    expect(log).toEqual([...DRAW_ENTRY_POINTS])
    counter.uninstall()
  })

  it('counts calls on every wrapped prototype', () => {
    const webgl1 = fakePrototype([])
    const webgl2 = fakePrototype([])
    const counter = installDrawCounter([webgl1, webgl2])
    call(webgl1, 'drawArrays')
    call(webgl2, 'drawElementsInstanced')
    expect(counter.calls).toBe(2)
    counter.uninstall()
  })

  it('resets per frame', () => {
    const proto = fakePrototype([])
    const counter = installDrawCounter([proto])
    call(proto, 'drawElements')
    counter.reset()
    call(proto, 'drawArrays')
    expect(counter.calls).toBe(1)
    counter.uninstall()
  })
})

describe('DrawCounter.uninstall', () => {
  it('restores the original functions on uninstall', () => {
    const proto = fakePrototype([])
    const originals = DRAW_ENTRY_POINTS.map((name) => proto[name])
    const counter = installDrawCounter([proto])
    counter.uninstall()
    expect(DRAW_ENTRY_POINTS.map((name) => proto[name])).toEqual(originals)
    call(proto, 'drawArrays')
    expect(counter.calls).toBe(0)
  })

  it('skips entry points a prototype does not have', () => {
    const proto: FakePrototype = { drawArrays: () => undefined }
    const counter = installDrawCounter([proto])
    call(proto, 'drawArrays')
    expect(counter.calls).toBe(1)
    expect('drawElementsInstanced' in proto).toBe(false)
    counter.uninstall()
  })
})

describe('DrawCounter.lastContext and syncGpu', () => {
  it('remembers the context that issued the last draw', () => {
    const proto = fakePrototype([])
    const counter = installDrawCounter([proto])
    expect(counter.lastContext).toBeNull()
    // A real draw is a method call on the context, so `this` is the context.
    const context = Object.create(proto) as FakePrototype
    const draw = context.drawElements
    if (!draw) throw new Error('missing drawElements')
    draw.call(context)
    expect(counter.lastContext).toBe(context)
    counter.uninstall()
  })

  it('blocks on the GPU with one 1x1 readPixels on that context', () => {
    const reads: unknown[][] = []
    const context = {
      RGBA: 6408,
      UNSIGNED_BYTE: 5121,
      readPixels: (...args: unknown[]) => reads.push(args),
    }
    syncGpu(context)
    expect(reads).toHaveLength(1)
    expect(reads[0]?.slice(0, 6)).toEqual([0, 0, 1, 1, 6408, 5121])
  })

  it('does nothing without a context', () => {
    expect(() => syncGpu(null)).not.toThrow()
  })
})
