// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, expect, it } from 'vitest'
import type { SceneJson } from '@waica/engine'
import { setRenderProp } from '../../scene/ops'
import { SceneInspector } from './SceneInspector'

afterEach(cleanup)

const BARE: SceneJson = { waicaScene: 3, entities: [] }

/** The inspector over a live scene, committing each render edit through the editor's own op. */
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

function mount(initial: SceneJson = BARE): SceneJson[] {
  const scenes: SceneJson[] = []
  render(<Harness initial={initial} onScene={(scene) => scenes.push(scene)} />, { reactStrictMode: true })
  return scenes
}

const checkbox = (name: string): HTMLInputElement => screen.getByRole<HTMLInputElement>('checkbox', { name })
const field = (name: string): HTMLInputElement => screen.getByLabelText<HTMLInputElement>(name)

it('scene lighting (CA-13): off by default; turning it on writes full white ambient, off removes it', async () => {
  const scenes = mount()
  const user = userEvent.setup()
  expect(checkbox('Scene lighting').checked).toBe(false)
  expect(screen.queryByLabelText('Ambient intensity')).toBeNull()

  await user.click(checkbox('Scene lighting'))
  expect(scenes.at(-1)?.render).toEqual({ lighting: { ambient: { color: '#ffffff', intensity: 1 } } })

  await user.click(checkbox('Scene lighting'))
  expect(scenes.at(-1)?.render).toBeUndefined()
})

it('scene lighting (CA-13): edits the ambient color and intensity, clamping the intensity to 0..1', () => {
  const scenes = mount({ ...BARE, render: { sort: 'y', lighting: { ambient: { color: '#203040', intensity: 0.3 } } } })
  expect(field('Ambient intensity').value).toBe('0.3')
  expect(field('Ambient color').value).toBe('#203040')

  fireEvent.change(field('Ambient intensity'), { target: { value: '0.6' } })
  expect(scenes.at(-1)?.render).toEqual({ sort: 'y', lighting: { ambient: { color: '#203040', intensity: 0.6 } } })

  fireEvent.change(field('Ambient intensity'), { target: { value: '4' } })
  expect(scenes.at(-1)?.render?.lighting?.ambient?.intensity).toBe(1)

  fireEvent.change(field('Ambient color'), { target: { value: '#ff8800' } })
  expect(scenes.at(-1)?.render?.lighting?.ambient).toEqual({ color: '#ff8800', intensity: 1 })
})

it('post effects (CA-13): a vignette turns on with defaults and edits its intensity and radius', async () => {
  const scenes = mount()
  await userEvent.setup().click(checkbox('Vignette'))
  expect(scenes.at(-1)?.render).toEqual({ post: { vignette: { intensity: 0.5, radius: 0.5 } } })

  fireEvent.change(field('Vignette intensity'), { target: { value: '0.8' } })
  fireEvent.change(field('Vignette radius'), { target: { value: '0.2' } })
  expect(scenes.at(-1)?.render).toEqual({ post: { vignette: { intensity: 0.8, radius: 0.2 } } })
})

it('post effects (CA-13): a color grade edits tint, contrast and saturation, and the last effect off removes post', async () => {
  const scenes = mount({ ...BARE, render: { post: { vignette: { intensity: 0.5, radius: 0.5 } } } })
  const user = userEvent.setup()
  await user.click(checkbox('Color grade'))
  expect(scenes.at(-1)?.render?.post).toEqual({
    vignette: { intensity: 0.5, radius: 0.5 },
    colorGrade: { tint: '#ffffff', contrast: 1, saturation: 1 },
  })

  fireEvent.change(field('Grade tint'), { target: { value: '#ffeedd' } })
  fireEvent.change(field('Contrast'), { target: { value: '1.4' } })
  fireEvent.change(field('Saturation'), { target: { value: '0' } })
  expect(scenes.at(-1)?.render?.post?.colorGrade).toEqual({ tint: '#ffeedd', contrast: 1.4, saturation: 0 })

  await user.click(checkbox('Vignette'))
  await user.click(checkbox('Color grade'))
  expect(scenes.at(-1)?.render).toBeUndefined()
})
