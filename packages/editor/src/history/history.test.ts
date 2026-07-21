import { describe, expect, it } from 'vitest'
import type { SceneJson } from '@waica/engine'
import { COALESCE_WINDOW_MS, EditorHistory, type AtomicEntry } from './history'

const scene = (n: number): SceneJson => ({
  waicaScene: 3,
  entities: [{ name: `Entity-${n}`, position: [n, 0] }],
})

const edit = (before: number, after: number, path = 'src/scenes/main.scene.json'): AtomicEntry => ({
  kind: 'scene',
  path,
  before: scene(before),
  after: scene(after),
})

describe('EditorHistory', () => {
  it('starts with nothing to undo or redo', () => {
    const h = new EditorHistory()
    expect(h.canUndo).toBe(false)
    expect(h.canRedo).toBe(false)
    expect(h.undo()).toBeNull()
    expect(h.redo()).toBeNull()
  })

  it('undoes newest-first and redoes back in order', () => {
    const h = new EditorHistory()
    h.push(edit(0, 1), 0)
    h.push(edit(1, 2), 10)
    expect(h.undo()).toEqual(edit(1, 2))
    expect(h.undo()).toEqual(edit(0, 1))
    expect(h.canUndo).toBe(false)
    expect(h.redo()).toEqual(edit(0, 1))
    expect(h.redo()).toEqual(edit(1, 2))
    expect(h.canRedo).toBe(false)
  })

  it('discards the redo stack on a new push', () => {
    const h = new EditorHistory()
    h.push(edit(0, 1), 0)
    h.push(edit(1, 2), 10)
    h.undo()
    h.push(edit(1, 5), 20)
    expect(h.canRedo).toBe(false)
    expect(h.undo()).toEqual(edit(1, 5))
    expect(h.undo()).toEqual(edit(0, 1))
  })

  it('coalesces steps sharing a key inside the window', () => {
    const h = new EditorHistory()
    h.push(edit(0, 1), 0, 'move:Player')
    h.push(edit(1, 2), 100, 'move:Player')
    h.push(edit(2, 3), 200, 'move:Player')
    expect(h.undo()).toEqual(edit(0, 3))
    expect(h.canUndo).toBe(false)
  })

  it('does not coalesce across different keys', () => {
    const h = new EditorHistory()
    h.push(edit(0, 1), 0, 'move:Player')
    h.push(edit(1, 2), 100, 'move:Coin')
    expect(h.undo()).toEqual(edit(1, 2))
    expect(h.undo()).toEqual(edit(0, 1))
  })

  it('does not coalesce keyless steps', () => {
    const h = new EditorHistory()
    h.push(edit(0, 1), 0)
    h.push(edit(1, 2), 100)
    expect(h.undo()).toEqual(edit(1, 2))
    expect(h.undo()).toEqual(edit(0, 1))
  })

  it('does not coalesce once the window has passed', () => {
    const h = new EditorHistory()
    h.push(edit(0, 1), 0, 'move:Player')
    h.push(edit(1, 2), COALESCE_WINDOW_MS + 1, 'move:Player')
    expect(h.undo()).toEqual(edit(1, 2))
    expect(h.undo()).toEqual(edit(0, 1))
  })

  it('slides the coalesce window with each merged step', () => {
    const h = new EditorHistory()
    h.push(edit(0, 1), 0, 'move:Player')
    h.push(edit(1, 2), COALESCE_WINDOW_MS, 'move:Player')
    h.push(edit(2, 3), COALESCE_WINDOW_MS * 2, 'move:Player')
    expect(h.undo()).toEqual(edit(0, 3))
  })

  it('does not coalesce into a step separated by an unrelated one', () => {
    const h = new EditorHistory()
    h.push(edit(0, 1), 0, 'move:Player')
    h.push(edit(1, 2), 50)
    h.push(edit(2, 3), 100, 'move:Player')
    expect(h.undo()).toEqual(edit(2, 3))
    expect(h.undo()).toEqual(edit(1, 2))
    expect(h.undo()).toEqual(edit(0, 1))
  })

  it('keeps group entries whole', () => {
    const h = new EditorHistory()
    const group = {
      kind: 'group' as const,
      entries: [
        { kind: 'ui', name: 'hud', before: null, after: '<div />' } satisfies AtomicEntry,
        edit(0, 1),
      ],
    }
    h.push(group, 0)
    expect(h.undo()).toEqual(group)
    expect(h.redo()).toEqual(group)
  })

  it('caps the past at 200 steps, dropping the oldest', () => {
    const h = new EditorHistory()
    for (let i = 0; i < 205; i++) h.push(edit(i, i + 1), i * 2000)
    let last: ReturnType<EditorHistory['undo']> = null
    let count = 0
    for (let e = h.undo(); e; e = h.undo()) {
      last = e
      count++
    }
    expect(count).toBe(200)
    expect(last).toEqual(edit(5, 6))
  })
})
