// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { SceneCameraJson, SceneEntityJson, SceneJson } from '@waica/engine'
import { SceneInspector } from './inspector/SceneInspector'
import { renderInspector, row, section } from './inspector-test-support'
import { defined } from '../../../engine/src/test-support'

afterEach(cleanup)

const CRATE: SceneEntityJson = { name: 'Crate', position: [1, 2, 3], rotation: [0, 90, 0], scale: [2, 1, 2] }

function fields(label: string): HTMLInputElement[] {
  return within(row(label)).getAllByRole<HTMLInputElement>('spinbutton')
}

describe('entity transform rows in a 3D scene (CA-21)', () => {
  it('edits position as X/Y/Z', () => {
    const props = renderInspector({ kind: 'entity', entity: CRATE, sceneName: 'main', space: '3d' })
    const [x, y, z] = fields('position')
    expect([x?.value, y?.value, z?.value]).toEqual(['1', '2', '3'])
    fireEvent.change(defined(z), { target: { value: '9' } })
    expect(props.onTransform).toHaveBeenLastCalledWith('Crate', { position: [1, 2, 9] })
    fireEvent.change(defined(x), { target: { value: '-4' } })
    expect(props.onTransform).toHaveBeenLastCalledWith('Crate', { position: [-4, 2, 3] })
    expect(props.onMove).not.toHaveBeenCalled()
  })

  it('edits rotation (degrees) and scale rows', () => {
    const props = renderInspector({ kind: 'entity', entity: CRATE, sceneName: 'main', space: '3d' })
    const rotation = fields('rotation')
    expect(rotation.map((field) => field.value)).toEqual(['0', '90', '0'])
    fireEvent.change(defined(rotation[1]), { target: { value: '45' } })
    expect(props.onTransform).toHaveBeenLastCalledWith('Crate', { rotation: [0, 45, 0] })
    const scale = fields('scale')
    fireEvent.change(defined(scale[2]), { target: { value: '3' } })
    expect(props.onTransform).toHaveBeenLastCalledWith('Crate', { scale: [2, 1, 3] })
  })

  it('shows the defaults for a transform the entity does not declare, and a 2-number position as z 0', () => {
    renderInspector({ kind: 'entity', entity: { name: 'Bare', position: [5, 6] }, sceneName: 'main', space: '3d' })
    expect(fields('position').map((field) => field.value)).toEqual(['5', '6', '0'])
    expect(fields('rotation').map((field) => field.value)).toEqual(['0', '0', '0'])
    expect(fields('scale').map((field) => field.value)).toEqual(['1', '1', '1'])
  })

  it('keeps the 2D rows for a 2D scene: two position fields, no rotation or scale', () => {
    const props = renderInspector({ kind: 'entity', entity: { name: 'Hero', position: [1, 2] }, sceneName: 'main' })
    const [x, y, z] = fields('position')
    expect(z).toBeUndefined()
    fireEvent.change(defined(y), { target: { value: '7' } })
    expect(props.onMove).toHaveBeenLastCalledWith('Hero', [1, 7])
    expect(defined(x).value).toBe('1')
    expect(screen.queryByText('rotation', { selector: 'span' })).toBeNull()
    expect(screen.queryByText('scale', { selector: 'span' })).toBeNull()
  })
})

describe('SceneInspector (CA-21)', () => {
  const SCENE_3D: SceneJson = {
    waicaScene: 3,
    render: { space: '3d' },
    camera: { kind: 'perspective', position: [0, 4, 12], target: [0, 0, 0] },
    entities: [],
  }

  it('shows render.space read-only and hides sort, batching and projection in a 3D scene', () => {
    render(<SceneInspector scene={SCENE_3D} onRenderProp={vi.fn()} />, { reactStrictMode: true })
    const space = row('space')
    expect(space.textContent).toContain('3d')
    expect(within(space).queryByRole('combobox')).toBeNull()
    expect(within(space).queryByRole('textbox')).toBeNull()
    expect(screen.queryByTestId('ysort-toggle')).toBeNull()
    expect(screen.queryByTestId('batch-toggle')).toBeNull()
    expect(screen.queryByTestId('isometric-toggle')).toBeNull()
    expect(row('camera').textContent).toContain('perspective')
  })

  it('shows the 2D switches and no space row in a 2D scene, as before', () => {
    render(<SceneInspector scene={{ waicaScene: 3, entities: [] }} onRenderProp={vi.fn()} />, { reactStrictMode: true })
    expect(screen.getByTestId('ysort-toggle')).toBeDefined()
    expect(screen.getByTestId('batch-toggle')).toBeDefined()
    expect(screen.getByTestId('isometric-toggle')).toBeDefined()
    expect(screen.queryByText('space', { selector: 'span' })).toBeNull()
  })
})

describe('CameraInspector, perspective camera (CA-21)', () => {
  const camera: SceneCameraJson = { kind: 'perspective', position: [1, 2, 3], target: [4, 5, 6], fov: 50 }

  it('edits position, target and fov', () => {
    const props = renderInspector({ kind: 'camera', camera, entityNames: [] })
    const position = fields('position')
    fireEvent.change(defined(position[2]), { target: { value: '20' } })
    expect(props.onCameraProp).toHaveBeenLastCalledWith('position', [1, 2, 20])
    const target = fields('target')
    expect(target.map((field) => field.value)).toEqual(['4', '5', '6'])
    fireEvent.change(defined(target[0]), { target: { value: '0' } })
    expect(props.onCameraProp).toHaveBeenLastCalledWith('target', [0, 5, 6])
    fireEvent.change(screen.getByRole('slider', { name: /^Field of view/ }), { target: { value: '70' } })
    expect(props.onCameraProp).toHaveBeenLastCalledWith('fov', 70)
  })

  it('shows the defaults of an empty perspective block', () => {
    renderInspector({ kind: 'camera', camera: { kind: 'perspective' }, entityNames: [] })
    expect(fields('position').map((field) => field.value)).toEqual(['0', '5', '10'])
    expect(fields('target').map((field) => field.value)).toEqual(['0', '0', '0'])
  })

  it('has no zoom, follow or limits sections', () => {
    renderInspector({ kind: 'camera', camera, entityNames: ['Hero'] })
    expect(screen.queryByText('Framing', { selector: 'header, header > span' })).toBeNull()
    expect(screen.queryByText('Follow', { selector: 'header, header > span' })).toBeNull()
    expect(screen.queryByText('Limits', { selector: 'header, header > span' })).toBeNull()
  })

  it('keeps the orthographic sections for a 2D camera', () => {
    renderInspector({ kind: 'camera', camera: { position: [1, 2], zoom: 10 }, entityNames: ['Hero'] })
    expect(within(section('Framing')).getByRole('slider', { name: /^Zoom/ })).toBeDefined()
  })
})
