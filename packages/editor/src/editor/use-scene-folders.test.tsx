// @vitest-environment happy-dom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { useSceneFolders } from './use-scene-folders'

afterEach(cleanup)

describe('useSceneFolders', () => {
  it('starts every scene with its folders shut and remembers what the user opens', () => {
    const { result } = renderHook(({ path }) => useSceneFolders(path), {
      initialProps: { path: 'src/scenes/a.scene.json' },
      reactStrictMode: true,
    })
    expect([...result.current.expanded]).toEqual([])

    act(() => result.current.open('Enemies'))
    act(() => result.current.toggle('Props'))
    expect([...result.current.expanded].sort()).toEqual(['Enemies', 'Props'])

    act(() => result.current.toggle('Props'))
    expect([...result.current.expanded]).toEqual(['Enemies'])
  })

  it('shuts everything when another scene opens, with no effect in between', () => {
    const { result, rerender } = renderHook(({ path }) => useSceneFolders(path), {
      initialProps: { path: 'src/scenes/a.scene.json' },
      reactStrictMode: true,
    })
    act(() => result.current.open('Enemies'))

    rerender({ path: 'src/scenes/b.scene.json' })
    expect([...result.current.expanded]).toEqual([])

    act(() => result.current.setAll(['A', 'B']))
    expect([...result.current.expanded].sort()).toEqual(['A', 'B'])
  })
})
