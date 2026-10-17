// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, expect, it } from 'vitest'
import type { SceneJson } from '@waica/engine'
import { setRenderProp } from '../../scene/ops'
import { SceneInspector } from './SceneInspector'

afterEach(cleanup)

const THREE_D: SceneJson = { waicaScene: 3, render: { space: '3d' }, entities: [] }

/** Commits inspector edits through the same scene operation as the editor. */
function Harness({ initial, onScene, beforeCommit }: {
  initial: SceneJson
  onScene: (scene: SceneJson) => void
  beforeCommit?: (key: string, value: unknown) => void
}) {
  const [scene, setScene] = useState(initial)
  return (
    <SceneInspector scene={scene} onRenderProp={(key, value) => {
      beforeCommit?.(key, value)
      const next = setRenderProp(scene, key, value)
      onScene(next)
      setScene(next)
    }} />
  )
}

function mount(initial: SceneJson = THREE_D, beforeCommit?: (key: string, value: unknown) => void): SceneJson[] {
  const scenes: SceneJson[] = []
  render(<Harness initial={initial} onScene={(scene) => scenes.push(scene)} beforeCommit={beforeCommit} />, { reactStrictMode: true })
  return scenes
}

const quality = (): HTMLSelectElement => screen.getByRole<HTMLSelectElement>('combobox', { name: 'Shadow quality' })
const distance = (): HTMLInputElement => screen.getByRole<HTMLInputElement>('spinbutton', { name: 'Scene shadow max distance' })

it('CA-11: a missing 3D shadows block shows Medium/40 without authoring defaults; choosing Low writes only quality', async () => {
  const scenes = mount()
  expect(quality().value).toBe('medium')
  expect(distance().value).toBe('40')
  expect(distance().min).toBe('0.01')
  expect(distance().max).toBe('1000')
  expect(screen.getAllByRole<HTMLOptionElement>('option').map((option) => [option.textContent, option.value])).toEqual([
    ['Off', 'off'], ['Low', 'low'], ['Medium', 'medium'], ['High', 'high'],
  ])
  expect(scenes).toEqual([])

  await userEvent.setup().selectOptions(quality(), 'low')
  expect(quality().value).toBe('low')
  expect(distance().value).toBe('40')
  expect(scenes.at(-1)?.render).toEqual({ space: '3d', shadows: { quality: 'low' } })
  expect(THREE_D.render).toEqual({ space: '3d' })
})

it('CA-11: all profiles preserve authored distance and overrides; distance stays editable while Off', async () => {
  const authored = { quality: 'medium', maxDistance: 65, extension: { keep: true } }
  const initial = setRenderProp({
    ...THREE_D,
    render: { space: '3d', lighting: { ambient: { intensity: 0.3 } }, post: { vignette: { intensity: 0.4, radius: 0.6 } } },
    entities: [{ name: 'Sun', prefab: 'sun', overrides: { Sun: { shadowMapSize: 1024, shadowBias: 0 } } }],
  }, 'shadows', authored)
  const scenes = mount(initial)
  const user = userEvent.setup()
  for (const profile of ['off', 'low', 'medium', 'high', 'off']) {
    await user.selectOptions(quality(), profile)
    expect(quality().value).toBe(profile)
    expect(distance().value).toBe('65')
    expect(scenes.at(-1)).toEqual({ ...initial, render: { ...initial.render, shadows: { ...authored, quality: profile } } })
  }

  expect(distance().disabled).toBe(false)
  fireEvent.change(distance(), { target: { value: '75' } })
  expect(distance().value).toBe('75')
  expect(scenes.at(-1)).toEqual({ ...initial, render: { ...initial.render, shadows: { ...authored, quality: 'off', maxDistance: 75 } } })

  await user.selectOptions(quality(), 'medium')
  expect(scenes.at(-1)?.render?.shadows).toEqual({ ...authored, maxDistance: 75 })
  expect(authored).toEqual({ quality: 'medium', maxDistance: 65, extension: { keep: true } })
})

it.each([
  ['quality', { quality: 'ultra' }, 'quality', 'render.shadows.quality must be off, low, medium or high; got "ultra".'],
  ['negative distance', { quality: 'off', maxDistance: -9 }, 'distance', 'render.shadows.maxDistance must be a finite number from 0.01 to 1000; got -9.'],
  ['unreadable distance', { maxDistance: 'far' }, 'distance', 'render.shadows.maxDistance must be a finite number from 0.01 to 1000; got "far".'],
  ['null block', null, 'both', 'render.shadows must be an object; got null.'],
  ['array block', [42], 'both', 'render.shadows must be an object; got [42].'],
  ['string block', 'invalid', 'both', 'render.shadows must be an object; got "invalid".'],
])('CA-11: diagnoses stored %s accessibly without rewriting authored JSON', (...args) => {
  const [, block, invalid, message] = args
  const initial = setRenderProp(THREE_D, 'shadows', block)
  const before = JSON.stringify(initial)
  const scenes = mount(initial)
  const invalidControls = invalid === 'both' ? [quality(), distance()] : [invalid === 'quality' ? quality() : distance()]
  for (const control of invalidControls) {
    expect(control.getAttribute('aria-invalid')).toBe('true')
    const id = control.getAttribute('aria-describedby')
    expect(id).toBeTruthy()
    expect(document.getElementById(id ?? '')?.textContent).toContain(message)
  }
  expect(screen.getAllByRole('alert').some((alert) => alert.textContent?.includes(String(message)))).toBe(true)
  expect(scenes).toEqual([])
  expect(JSON.stringify(initial)).toBe(before)
})

it.each(['quality', 'distance'])('CA-11: a rejected %s edit reports the capacity error and keeps the last committed policy', async (field) => {
  const initial = setRenderProp(THREE_D, 'shadows', { quality: 'low', maxDistance: 35 })
  let reject = true
  const scenes = mount(initial, () => {
    if (reject) throw new RangeError('Shadow map size 4096 is unsupported by device capacity 2048.')
  })
  const user = userEvent.setup()
  if (field === 'quality') await user.selectOptions(quality(), 'high')
  else fireEvent.change(distance(), { target: { value: '80' } })

  expect(screen.getByRole('alert').textContent).toContain('Shadow map size 4096 is unsupported by device capacity 2048.')
  const control = field === 'quality' ? quality() : distance()
  expect(control.getAttribute('aria-invalid')).toBe('true')
  expect(document.getElementById(control.getAttribute('aria-describedby') ?? '')?.textContent).toContain('device capacity 2048')
  expect(quality().value).toBe('low')
  expect(distance().value).toBe('35')
  expect(scenes).toEqual([])
  expect(initial.render?.shadows).toEqual({ quality: 'low', maxDistance: 35 })

  reject = false
  if (field === 'quality') await user.selectOptions(quality(), 'medium')
  else fireEvent.change(distance(), { target: { value: '60' } })
  expect(screen.queryByRole('alert')).toBeNull()
  expect(control.getAttribute('aria-invalid')).toBeNull()
  expect(scenes.at(-1)?.render?.shadows).toEqual(field === 'quality'
    ? { quality: 'medium', maxDistance: 35 }
    : { quality: 'low', maxDistance: 60 })
})

it('CA-11: the distance field supports replacing the value and typing decimal world units with the keyboard', async () => {
  const scenes = mount()
  const user = userEvent.setup()
  await user.click(distance())
  await user.keyboard('0.25')
  expect(distance().value).toBe('0.25')
  expect(scenes.at(-1)?.render?.shadows).toEqual({ maxDistance: 0.25 })
  await user.tab()
  expect(distance().value).toBe('0.25')
})

it.each([
  [{}, 'medium', '40'],
  [{ quality: 'high' }, 'high', '40'],
  [{ maxDistance: 12 }, 'medium', '12'],
])('CA-11: absent fields in %j stay implicit when the inspector opens', (block, profile, maxDistance) => {
  const scenes = mount(setRenderProp(THREE_D, 'shadows', block))
  expect(quality().value).toBe(profile)
  expect(distance().value).toBe(maxDistance)
  expect(scenes).toEqual([])
})

it.each([undefined, '2d'])('CA-11: hides 3D shadow controls in a %s scene, even with a stored shadows block', (space) => {
  const twoD: SceneJson = { waicaScene: 3, entities: [] }
  const initial = setRenderProp(setRenderProp(twoD, 'space', space), 'shadows', { quality: 'high' })
  const scenes = mount(initial)
  expect(screen.queryByRole('combobox', { name: 'Shadow quality' })).toBeNull()
  expect(screen.queryByRole('spinbutton', { name: 'Scene shadow max distance' })).toBeNull()
  expect(screen.getByRole('checkbox', { name: 'Sprite batching' })).toBeTruthy()
  expect(scenes).toEqual([])
})

it.each([
  ['0', 0.01], ['-5', 0.01], ['0.01', 0.01], ['1000', 1000], ['1001', 1000],
])('CA-11: bounds an edited distance of %s to %s without materializing quality', (text, expected) => {
  const scenes = mount()
  fireEvent.change(distance(), { target: { value: text } })
  fireEvent.blur(distance())
  expect(scenes.at(-1)?.render?.shadows).toEqual({ maxDistance: expected })
  expect(distance().value).toBe(String(expected))
})

it('CA-11: an empty distance draft is not persisted or converted to zero', async () => {
  const scenes = mount()
  const user = userEvent.setup()
  await user.clear(distance())
  expect(scenes).toEqual([])
  await user.tab()
  expect(distance().value).toBe('40')
})

it('CA-11: editing quality preserves a diagnosed authored distance until the user explicitly fixes it', async () => {
  const scenes = mount(setRenderProp(THREE_D, 'shadows', { quality: 'low', maxDistance: -9, extension: true }))
  expect(distance().value).toBe('-9')
  await userEvent.setup().selectOptions(quality(), 'off')
  expect(scenes.at(-1)?.render?.shadows).toEqual({ quality: 'off', maxDistance: -9, extension: true })
  expect(distance().getAttribute('aria-invalid')).toBe('true')
  fireEvent.change(distance(), { target: { value: '10' } })
  expect(scenes.at(-1)?.render?.shadows).toEqual({ quality: 'off', maxDistance: 10, extension: true })
  expect(screen.queryByRole('alert')).toBeNull()
})

it('CA-11: repairing an invalid block never spreads array indexes into the authored policy', async () => {
  const scenes = mount(setRenderProp(THREE_D, 'shadows', [42]))
  await userEvent.setup().selectOptions(quality(), 'low')
  expect(scenes.at(-1)?.render?.shadows).toEqual({ quality: 'low' })
  expect(screen.queryByRole('alert')).toBeNull()
})

it('CA-11: a rejected repair reports the capacity failure as well as the stored-data diagnostic', async () => {
  const scenes = mount(setRenderProp(THREE_D, 'shadows', { quality: 'ultra' }), () => {
    throw new RangeError('Shadow map size 4096 is unsupported by device capacity 2048.')
  })
  await userEvent.setup().selectOptions(quality(), 'high')
  const message = screen.getByRole('alert').textContent
  expect(message).toContain('render.shadows.quality must be off, low, medium or high')
  expect(message).toContain('device capacity 2048')
  expect(quality().value).toBe('')
  expect(scenes).toEqual([])
})

it('CA-11: a rejected edit from the previous controlled scene does not diagnose the newly selected scene', async () => {
  const onRenderProp = (): void => { throw new RangeError('Shadow device capacity exceeded.') }
  const { rerender } = render(<SceneInspector scene={THREE_D} onRenderProp={onRenderProp} />, { reactStrictMode: true })
  await userEvent.setup().selectOptions(quality(), 'high')
  expect(screen.getByRole('alert').textContent).toContain('Shadow device capacity exceeded.')

  const next = setRenderProp(THREE_D, 'shadows', { quality: 'low', maxDistance: 12 })
  rerender(<SceneInspector scene={next} onRenderProp={onRenderProp} />)
  expect(screen.queryByRole('alert')).toBeNull()
  expect(quality().getAttribute('aria-invalid')).toBeNull()
  expect(quality().value).toBe('low')
  expect(distance().value).toBe('12')
})
