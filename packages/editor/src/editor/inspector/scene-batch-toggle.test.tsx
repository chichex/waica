// @vitest-environment happy-dom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, expect, it, vi } from 'vitest'
import type { SceneJson } from '@waica/engine'
import { setRenderProp } from '../../scene/ops'
import { SceneInspector } from './SceneInspector'

afterEach(cleanup)

const BARE: SceneJson = { waicaScene: 3, entities: [] }

/** The Sprite batching checkbox, found by its accessible name. */
function batchToggle(): HTMLInputElement {
  return screen.getByRole<HTMLInputElement>('checkbox', { name: 'Sprite batching' })
}

/** The inspector over a live scene, committing each render toggle through the editor's own op. */
function Harness({ initial, onScene }: { initial: SceneJson; onScene: (scene: SceneJson) => void }) {
  const [scene, setScene] = useState(initial)
  return (
    <SceneInspector
      scene={scene}
      onRenderProp={(key, value) => {
        const next = setRenderProp(scene, key, value)
        onScene(next)
        setScene(next)
      }}
    />
  )
}

it('offers Sprite batching next to y-sort, on by default, with help text (CA-6)', () => {
  render(<SceneInspector scene={BARE} onRenderProp={vi.fn()} />, { reactStrictMode: true })

  expect(batchToggle().checked).toBe(true)
  const toggles = screen.getAllByRole('checkbox').map((box) => box.getAttribute('data-testid'))
  expect(toggles.indexOf('batch-toggle')).toBe(toggles.indexOf('ysort-toggle') + 1)
  const help = 'Draws sprites that share art in one call. Turn off only to debug draw order or a visual difference.'
  expect(screen.getByText(help).textContent).toBe(help)
})

it('writes render.batch: false when turned off and removes it when turned back on (CA-6)', async () => {
  const scenes: SceneJson[] = []
  render(<Harness initial={BARE} onScene={(scene) => scenes.push(scene)} />, { reactStrictMode: true })
  const user = userEvent.setup()

  await user.click(batchToggle())
  expect(scenes.at(-1)?.render).toEqual({ batch: false })
  expect(batchToggle().checked).toBe(false)

  await user.click(batchToggle())
  expect(scenes.at(-1)?.render).toBeUndefined()
  expect(batchToggle().checked).toBe(true)
})

it('shows a scene that opted out unchecked and keeps its other render options when re-enabled (CA-6)', async () => {
  const scenes: SceneJson[] = []
  const optedOut: SceneJson = { ...BARE, render: { sort: 'y', batch: false } }
  render(<Harness initial={optedOut} onScene={(scene) => scenes.push(scene)} />, { reactStrictMode: true })

  expect(batchToggle().checked).toBe(false)
  await userEvent.setup().click(batchToggle())

  expect(scenes.at(-1)?.render).toEqual({ sort: 'y' })
})
