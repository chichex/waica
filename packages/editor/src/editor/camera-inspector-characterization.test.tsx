// @vitest-environment happy-dom
import { cleanup, fireEvent, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it } from 'vitest'
import { renderInspector, row, section } from './inspector-test-support'
import { defined } from '../../../engine/src/test-support'

/**
 * Characterization of the CameraInspector before it is split by
 * responsibility: position, framing, follow and limits, and the camera props
 * each control commits.
 */

afterEach(cleanup)

it('edits a fixed camera’s position and matches the game resolution', async () => {
  const user = userEvent.setup()
  const props = renderInspector({
    kind: 'camera',
    camera: { position: [1, 2], zoom: 10 },
    entityNames: ['Hero', 'Coin'],
  })

  const [x, y] = within(row('position')).getAllByRole('spinbutton')
  fireEvent.change(defined(x), { target: { value: '3' } })
  expect(props.onCameraProp).toHaveBeenLastCalledWith('position', [3, 2])
  fireEvent.change(defined(y), { target: { value: '4' } })
  expect(props.onCameraProp).toHaveBeenLastCalledWith('position', [1, 4])

  const framing = section('Framing')
  expect(within(framing).getByText(/× 10 units$/)).toBeDefined()
  expect(within(framing).getByText(/× 160 px$/)).toBeDefined()
  fireEvent.change(within(framing).getByRole('slider', { name: /^Zoom \(world height\)/ }), {
    target: { value: '12' },
  })
  expect(props.onCameraProp).toHaveBeenLastCalledWith('zoom', 12)
  await user.click(
    within(framing).getByRole('button', { name: /Match game resolution \(640×360\)/ }),
  )
  expect(props.onCameraProp).toHaveBeenLastCalledWith('zoom', 22.5)
})

it('picks a follow target and turns limits on', async () => {
  const user = userEvent.setup()
  const props = renderInspector({
    kind: 'camera',
    camera: { position: [1, 2], zoom: 10 },
    entityNames: ['Hero', 'Coin'],
  })

  const follow = section('Follow')
  expect(within(follow).getByText(/pick a target/)).toBeDefined()
  await user.selectOptions(within(follow).getByRole('combobox', { name: 'target' }), 'Hero')
  expect(props.onCameraProp).toHaveBeenLastCalledWith('follow', 'Hero')

  const limits = section('Limits')
  expect(within(limits).getByText('no limits — the camera can go anywhere')).toBeDefined()
  await user.click(within(limits).getByRole('checkbox', { name: 'limit the view' }))
  expect(props.onCameraProp).toHaveBeenLastCalledWith('limits', {
    minX: -20,
    maxX: 20,
    minY: -12,
    maxY: 12,
  })
})

it('shows follow sliders for a following camera in fill mode', async () => {
  const user = userEvent.setup()
  const props = renderInspector(
    { kind: 'camera', camera: { follow: 'Hero', zoom: 22.5 }, entityNames: ['Hero'] },
    { resolution: { mode: 'fill', width: 640, height: 360 } },
  )

  expect(within(row('position')).getByText('on Hero')).toBeDefined()
  const framing = section('Framing')
  expect(within(framing).queryByRole('button', { name: /Match game resolution/ })).toBeNull()
  expect(within(framing).getByText(/fill mode follows the real window's shape/)).toBeDefined()

  const follow = section('Follow')
  for (const label of [/^Deadzone width/, /^Deadzone height/, /^Lookahead \(vertical\)/, /^Smoothing/]) {
    expect(within(follow).getByRole('slider', { name: label })).toBeDefined()
  }
  expect(within(follow).getAllByRole('slider', { name: /^Lookahead/ })).toHaveLength(2)
  await user.selectOptions(within(follow).getByRole('combobox', { name: 'target' }), '')
  expect(props.onCameraProp).toHaveBeenLastCalledWith('follow', undefined)
})

it('edits and turns off the camera limits', async () => {
  const user = userEvent.setup()
  const props = renderInspector({
    kind: 'camera',
    camera: { limits: { minX: -5, maxX: 5, minY: -3, maxY: 3 } },
    entityNames: [],
  })

  const limits = section('Limits')
  expect(within(limits).getByText(/never shows anything outside these world bounds/)).toBeDefined()
  fireEvent.change(within(limits).getByRole('spinbutton', { name: 'left' }), {
    target: { value: '-8' },
  })
  expect(props.onCameraProp).toHaveBeenLastCalledWith('limits', {
    minX: -8,
    maxX: 5,
    minY: -3,
    maxY: 3,
  })
  for (const label of ['right', 'bottom', 'top']) {
    expect(within(limits).getByRole('spinbutton', { name: label })).toBeDefined()
  }
  await user.click(within(limits).getByRole('checkbox', { name: 'limit the view' }))
  expect(props.onCameraProp).toHaveBeenLastCalledWith('limits', undefined)
})
