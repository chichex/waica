// @vitest-environment happy-dom
import { cleanup, fireEvent, within } from '@testing-library/react'
import { afterEach, expect, it } from 'vitest'
import type { SceneCameraJson } from '@waica/engine'
import { renderInspector, row, section } from './inspector-test-support'
import { defined } from '../../../engine/src/test-support'

// Issue #181 CA-33: the perspective camera's Follow section.

afterEach(cleanup)

const FIXED: SceneCameraJson = { kind: 'perspective', position: [0, 4, 10], target: [0, 1, 0], fov: 55 }
const FOLLOWING: SceneCameraJson = { ...FIXED, follow: 'Player', distance: 5 }
const ACTIONS = { look_left: ['KeyQ'], look_right: ['KeyE'], look_up: ['KeyR'], look_down: ['KeyF'], jump: ['Space'] }

function inspect(camera: SceneCameraJson) {
  return renderInspector({ kind: 'camera', camera, entityNames: ['Player', 'Skeleton'], space: '3d' }, { actions: ACTIONS })
}

const follow = (): HTMLElement => within(section('Follow')).getByRole('combobox', { name: 'follow' })
const slider = (name: RegExp): HTMLInputElement => within(section('Follow')).getByRole<HTMLInputElement>('slider', { name })

it('adds a Follow section whose entity select lists the scene, “none” meaning a fixed camera (CA-33)', () => {
  const props = inspect(FIXED)
  const options = within(follow()).getAllByRole<HTMLOptionElement>('option').map((option) => option.textContent)

  expect(options).toEqual(['none — fixed camera', 'Player', 'Skeleton'])
  fireEvent.change(follow(), { target: { value: 'Player' } })
  expect(props.onCameraProp).toHaveBeenLastCalledWith('follow', 'Player')
})

it('removes follow when “none” is picked (CA-33)', () => {
  const props = inspect(FOLLOWING)
  expect(follow()).toHaveProperty('value', 'Player')

  fireEvent.change(follow(), { target: { value: '' } })

  expect(props.onCameraProp).toHaveBeenLastCalledWith('follow', undefined)
})

it('disables the orbit rows while the camera follows nothing, and enables them once it follows (CA-33)', () => {
  inspect(FIXED)
  // happy-dom does not apply a disabled fieldset to its controls, so the test reads the fieldset that holds them.
  const rows = within(section('Follow')).getByRole<HTMLFieldSetElement>('group', { name: 'orbit' })

  expect(rows.disabled).toBe(true)
  expect(within(rows).getByRole('slider', { name: /^Distance/ })).toBeDefined()
  expect(within(rows).getByRole('checkbox', { name: 'invert Y' })).toBeDefined()
  expect(rows.contains(follow())).toBe(false)
  cleanup()
  inspect(FOLLOWING)
  expect(within(section('Follow')).getByRole<HTMLFieldSetElement>('group', { name: 'orbit' }).disabled).toBe(false)
})

it('edits each orbit number of a following camera (CA-33)', () => {
  const props = inspect(FOLLOWING)
  const edits: Array<[RegExp, string, number]> = [
    [/^Distance/, 'distance', 8],
    [/^Min distance/, 'minDistance', 3],
    [/^Max distance/, 'maxDistance', 14],
    [/^Min pitch/, 'minPitch', -20],
    [/^Max pitch/, 'maxPitch', 60],
    [/^Sensitivity/, 'sensitivity', 0.5],
    [/^Orbit speed/, 'orbitSpeed', 180],
  ]
  expect(slider(/^Distance/).value).toBe('5')
  expect(slider(/^Max distance/).value).toBe('12')

  for (const [name, field, value] of edits) {
    fireEvent.change(slider(name), { target: { value: String(value) } })
    expect(props.onCameraProp).toHaveBeenLastCalledWith(field, value)
  }
})

it('toggles invertY and picks each orbit Action from the project’s bindings (CA-33)', () => {
  const props = inspect(FOLLOWING)
  fireEvent.click(within(section('Follow')).getByRole('checkbox', { name: 'invert Y' }))
  expect(props.onCameraProp).toHaveBeenLastCalledWith('invertY', true)

  const left = within(section('Follow')).getByRole<HTMLSelectElement>('combobox', { name: /Orbit left/ })
  expect(left.value).toBe('look_left')
  expect(within(left).getAllByRole('option').map((option) => option.getAttribute('value'))).toEqual(
    expect.arrayContaining(['look_left', 'look_right', 'look_up', 'look_down', 'jump']),
  )
  fireEvent.change(left, { target: { value: 'jump' } })
  expect(props.onCameraProp).toHaveBeenLastCalledWith('orbitLeftAction', 'jump')
  for (const name of [/Orbit right/, /Orbit up/, /Orbit down/]) {
    expect(defined(within(section('Follow')).getByRole('combobox', { name }))).toBeDefined()
  }
})

it('keeps each minimum at or below its maximum and the distance between them, so no edit inverts a range (CA-33)', () => {
  const props = inspect({ ...FOLLOWING, maxDistance: 9, minPitch: 5 })
  const bounds = (name: RegExp): [string, string] => [slider(name).min, slider(name).max]

  expect(bounds(/^Min distance/)).toEqual(['0.5', '9'])
  expect(bounds(/^Max distance/)).toEqual(['2', '30'])
  expect(bounds(/^Distance/)).toEqual(['2', '9'])
  expect(bounds(/^Min pitch/)).toEqual(['-88', '70'])
  expect(bounds(/^Max pitch/)).toEqual(['5', '88'])
  fireEvent.change(slider(/^Min distance/), { target: { value: '14' } })
  expect(props.onCameraProp).toHaveBeenLastCalledWith('minDistance', 9)
})

it('shows a follow that names a missing entity as missing, not as none (CA-33)', () => {
  inspect({ ...FIXED, follow: 'Ghost' })

  expect(follow()).toHaveProperty('value', 'Ghost')
  const options = within(follow()).getAllByRole<HTMLOptionElement>('option').map((option) => option.textContent)
  expect(options).toEqual(['none — fixed camera', 'Ghost (missing)', 'Player', 'Skeleton'])
})

it('edits the initial yaw and pitch and the look height, the pitch kept inside its limits (CA-33)', () => {
  const props = inspect({ ...FOLLOWING, minPitch: 5, maxPitch: 60 })

  expect([slider(/^Yaw/).min, slider(/^Yaw/).max]).toEqual(['-180', '180'])
  expect([slider(/^Pitch/).min, slider(/^Pitch/).max, slider(/^Pitch/).value]).toEqual(['5', '60', '20'])
  expect(slider(/^Look height/).value).toBe('1.2')
  fireEvent.change(slider(/^Yaw/), { target: { value: '90' } })
  expect(props.onCameraProp).toHaveBeenLastCalledWith('yaw', 90)
  fireEvent.change(slider(/^Look height/), { target: { value: '1.6' } })
  expect(props.onCameraProp).toHaveBeenLastCalledWith('lookHeight', 1.6)
  fireEvent.change(slider(/^Pitch/), { target: { value: '75' } })
  expect(props.onCameraProp).toHaveBeenLastCalledWith('pitch', 60)
})

it('shows position and target read-only, with a hint, while the camera follows; editable again without follow (CA-33)', () => {
  inspect(FOLLOWING)
  for (const label of ['position', 'target']) {
    expect(within(row(label)).queryAllByRole('spinbutton'), label).toEqual([])
    expect(row(label).textContent).toContain(label === 'position' ? '0, 4, 10' : '0, 1, 0')
  }
  expect(document.body.textContent).toContain('the orbit places the camera while playing')
  cleanup()

  inspect(FIXED)
  expect(within(row('position')).getAllByRole('spinbutton')).toHaveLength(3)
})
