// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it, vi } from 'vitest'
import type { PrefabJson, SceneEntityJson, SceneJson } from '@waica/engine'
import { defined } from '../../../../engine/src/test-support'
import { MemFS } from '../../fs/project-fs'
import { clearComponentOverride, setComponentProp } from '../../scene/ops'
import { GlbClipCache } from '../glb-clips'
import { renderInspector, renderInspectorWithClips, section } from '../inspector-test-support'
import { ComponentRows } from './ComponentCard'

afterEach(cleanup)

const sun = (props?: Record<string, unknown>): SceneEntityJson => ({
  name: 'Sun', components: [{ type: 'Sun', props }],
})

const shadowRow = (label: string): HTMLElement => screen.getByRole('group', { name: label })

async function openAdvanced(): Promise<void> {
  await userEvent.setup().click(screen.getByRole('button', { name: 'Advanced shadows', expanded: false }))
}

it('opens advanced shadows from the keyboard without materializing inherited scene values', async () => {
  const props = renderInspector({ kind: 'entity', entity: sun(), sceneName: 'main', space: '3d' }, {
    sceneRender: { space: '3d', shadows: { quality: 'high', maxDistance: 75 } },
  })
  const advanced = screen.getByRole('button', { name: 'Advanced shadows', expanded: false })
  expect(screen.queryByRole('group', { name: 'Shadow map size' })).toBeNull()
  advanced.focus()
  await userEvent.setup().keyboard('{Enter}')

  const map = screen.getByRole('group', { name: 'Shadow map size' })
  expect(map.textContent).toContain('Inherited from scene')
  expect(map.textContent).toContain('Effective: 4096')
  expect(within(map).getByRole('checkbox', { name: 'Override Shadow map size' })).toHaveProperty('checked', false)
  expect(within(map).queryByRole('combobox')).toBeNull()
  expect(screen.getByRole('group', { name: 'Shadow max distance' }).textContent).toContain('Effective: 75')
  expect(props.onProp).not.toHaveBeenCalled()
  expect(props.onResetProp).not.toHaveBeenCalled()
})

it('inherits scene 2048 with explicit null, while reset removes the instance key and restores prefab 1024', async () => {
  const prefab: PrefabJson = { waicaPrefab: 1, type: 'object', components: [{ type: 'Sun', props: { shadowMapSize: 1024 } }] }
  let scene: SceneJson = {
    waicaScene: 3, render: { space: '3d', shadows: { quality: 'medium' } },
    entities: [{ name: 'Sun', prefab: 'objects/sun', overrides: { Sun: { shadowMapSize: 512 } } }],
  }
  const selection = () => ({ kind: 'entity' as const, entity: defined(scene.entities[0]), sceneName: 'main', space: '3d' as const })
  const view = renderInspectorWithClips(selection(), new GlbClipCache(new MemFS('shadows', {})), {
    prefabs: { 'objects/sun': prefab }, sceneRender: scene.render,
  })
  view.props.onProp.mockImplementation((...args) => {
    scene = setComponentProp(scene, ...args, view.props.prefabs)
    view.rerender(selection())
  })
  view.props.onResetProp.mockImplementation((entity, type, key) => {
    scene = clearComponentOverride(scene, entity, type, key)
    view.rerender(selection())
  })
  await openAdvanced()
  const row = () => shadowRow('Shadow map size')
  expect(within(row()).getByRole('combobox', { name: 'Shadow map size' })).toHaveProperty('value', '512')

  await userEvent.setup().click(within(row()).getByRole('button', { name: 'Inherit scene for Shadow map size' }))
  expect(scene.entities[0]?.overrides).toEqual({ Sun: { shadowMapSize: null } })
  expect(row().textContent).toContain('Effective: 2048')
  expect(view.props.onResetProp).not.toHaveBeenCalled()

  await userEvent.setup().click(within(row()).getByTitle("Reset to the prefab's value"))
  expect(scene.entities[0]?.overrides).toBeUndefined()
  expect(row().textContent).toContain('Stored: 1024')
  expect(row().textContent).toContain('Effective: 1024')

  fireEvent.change(within(row()).getByRole('combobox', { name: 'Shadow map size' }), { target: { value: '256' } })
  expect(scene.entities[0]?.overrides).toEqual({ Sun: { shadowMapSize: 256 } })
  await userEvent.setup().click(within(row()).getByTitle('Apply to the prefab — every instance gets this value'))
  expect(view.props.onApplyProp).toHaveBeenLastCalledWith('Sun', 'Sun', 'shadowMapSize')
  expect(prefab.components[0]?.props).toEqual({ shadowMapSize: 1024 })
})

it('edits only a chosen numeric override, preserving false and explicit zero without turning null into zero', async () => {
  const props = renderInspector({ kind: 'entity', entity: sun({ castShadows: false, shadowBias: 0, shadowNormalBias: 0, shadowRadius: 0 }), sceneName: 'main', space: '3d' })
  expect(screen.getByRole('checkbox', { name: 'Cast shadows' })).toHaveProperty('checked', false)
  await openAdvanced()
  for (const label of ['Shadow bias', 'Shadow normal bias', 'Shadow radius']) {
    expect(within(shadowRow(label)).getByRole('spinbutton', { name: label })).toHaveProperty('value', '0')
    expect(shadowRow(label).textContent).toContain('Stored: 0')
  }
  const bias = within(shadowRow('Shadow bias')).getByRole('spinbutton', { name: 'Shadow bias' })
  fireEvent.change(bias, { target: { value: '-0.001' } })
  expect(props.onProp).toHaveBeenLastCalledWith('Sun', 'Sun', 'shadowBias', -0.001)
  fireEvent.change(bias, { target: { value: '' } })
  expect(props.onProp).toHaveBeenCalledTimes(1)
  fireEvent.change(bias, { target: { value: '2' } })
  expect(props.onProp).toHaveBeenCalledTimes(1)
  expect(within(shadowRow('Shadow bias')).getByRole('alert').textContent).toContain('-0.1')
  await userEvent.setup().click(within(shadowRow('Shadow radius')).getByRole('checkbox', { name: 'Override Shadow radius' }))
  expect(props.onProp).toHaveBeenLastCalledWith('Sun', 'Sun', 'shadowRadius', null)
  expect(within(shadowRow('Shadow max distance')).queryByRole('spinbutton')).toBeNull()
  await userEvent.setup().click(within(shadowRow('Shadow max distance')).getByRole('checkbox', { name: 'Override Shadow max distance' }))
  expect(props.onProp).toHaveBeenLastCalledWith('Sun', 'Sun', 'shadowMaxDistance', 40)
})

it('keeps invalid stored values visible with diagnostics instead of replacing them with normalized values', async () => {
  const props = renderInspector({ kind: 'entity', entity: sun({ shadowMapSize: 333, shadowBias: 2, shadowRadius: 'oops' }), sceneName: 'main', space: '3d' })
  await openAdvanced()
  const map = within(shadowRow('Shadow map size')).getByRole('combobox', { name: 'Shadow map size' })
  expect(within(map).getByRole('option', { selected: true }).textContent).toContain('333 — invalid')
  expect(map.getAttribute('aria-invalid')).toBe('true')
  expect(shadowRow('Shadow map size').textContent).toContain('Effective: 2048')
  expect(within(shadowRow('Shadow bias')).getByRole('spinbutton', { name: 'Shadow bias' })).toHaveProperty('value', '2')
  expect(shadowRow('Shadow bias').textContent).toContain('Effective: 0.1')
  expect(within(shadowRow('Shadow radius')).getByRole('textbox', { name: 'Stored Shadow radius' })).toHaveProperty('value', '"oops"')
  expect(screen.getAllByRole('alert')).toHaveLength(3)
  expect(props.onProp).not.toHaveBeenCalled()
  fireEvent.change(within(shadowRow('Shadow radius')).getByRole('spinbutton', { name: 'Shadow radius' }), { target: { value: '0' } })
  expect(props.onProp).toHaveBeenLastCalledWith('Sun', 'Sun', 'shadowRadius', 0)
})

it('reports a rejected numeric edit and restores the old controlled value even while focused', async () => {
  const props = renderInspector({ kind: 'entity', entity: sun({ shadowBias: 0.02 }), sceneName: 'main', space: '3d' })
  props.onProp.mockImplementation(() => { throw new Error('Shadow map exceeds device capacity') })
  await openAdvanced()
  const bias = within(shadowRow('Shadow bias')).getByRole('spinbutton', { name: 'Shadow bias' })
  fireEvent.focus(bias)
  fireEvent.change(bias, { target: { value: '0.03' } })
  const restored = within(shadowRow('Shadow bias')).getByRole('spinbutton', { name: 'Shadow bias' })
  expect(restored).toHaveProperty('value', '0.02')
  expect(document.activeElement).toBe(restored)
  expect(screen.getByRole('alert').textContent).toContain('Shadow map exceeds device capacity')
})

it.each(['inherit', 'reset', 'apply'] as const)('reports a rejected %s without discarding a prefab override', async (action) => {
  const prefab: PrefabJson = { waicaPrefab: 1, type: 'object', components: [{ type: 'Sun' }] }
  const entity: SceneEntityJson = { name: 'Sun', prefab: 'objects/sun', overrides: { Sun: { shadowMapSize: 512 } } }
  const props = renderInspector({ kind: 'entity', entity, sceneName: 'main', space: '3d' }, { prefabs: { 'objects/sun': prefab } })
  for (const callback of [props.onProp, props.onResetProp, props.onApplyProp]) {
    callback.mockImplementation(() => { throw new Error('Device capacity rejected change') })
  }
  await openAdvanced()
  const row = () => shadowRow('Shadow map size')
  const target = action === 'inherit'
    ? within(row()).getByRole('button', { name: 'Inherit scene for Shadow map size' })
    : within(row()).getByTitle(action === 'reset' ? "Reset to the prefab's value" : 'Apply to the prefab — every instance gets this value')
  await userEvent.setup().click(target)
  expect(within(row()).getByRole('combobox', { name: 'Shadow map size' })).toHaveProperty('value', '512')
  expect(screen.getByRole('alert').textContent).toContain('Device capacity rejected change')
  expect(entity.overrides).toEqual({ Sun: { shadowMapSize: 512 } })
})

it('catches a rejected per-light activation without changing false to true', async () => {
  const props = renderInspector({ kind: 'entity', entity: sun({ castShadows: false }), sceneName: 'main', space: '3d' })
  props.onProp.mockImplementation(() => { throw new Error('Cannot activate shadow map on device') })
  await userEvent.setup().click(screen.getByRole('checkbox', { name: 'Cast shadows' }))
  expect(screen.getByRole('checkbox', { name: 'Cast shadows' })).toHaveProperty('checked', false)
  expect(screen.getByRole('alert').textContent).toContain('Cannot activate shadow map on device')
})

it('keeps an invalid stored light flag visible and accepts only a real boolean repair', () => {
  const props = renderInspector({ kind: 'entity', entity: sun({ castShadows: 'false' }), sceneName: 'main', space: '3d' })
  const field = screen.getByRole('textbox', { name: 'Cast shadows' })
  expect(field).toHaveProperty('value', 'false')
  expect(screen.getByRole('alert').textContent).toContain('must be a boolean')
  fireEvent.change(field, { target: { value: 'invalid' } })
  expect(props.onProp).not.toHaveBeenCalled()
  fireEvent.change(field, { target: { value: 'true' } })
  expect(props.onProp).toHaveBeenLastCalledWith('Sun', 'Sun', 'castShadows', true)
})

it('shows global Off even while collapsed, and changes only inherited effective values when the scene preset changes', async () => {
  const entity = sun({ shadowMapSize: 1024, shadowBias: 0 })
  const selection = { kind: 'entity' as const, entity, sceneName: 'main', space: '3d' as const }
  const view = renderInspectorWithClips(selection, new GlbClipCache(new MemFS('shadows', {})), {
    sceneRender: { space: '3d', shadows: { quality: 'off', maxDistance: 40 } },
  })
  expect(screen.getByRole('status').textContent).toContain('Inactive')
  expect(screen.getByRole('status').textContent).toContain('off')
  await openAdvanced()
  expect(shadowRow('Shadow map size').textContent).toContain('Stored: 1024')
  view.props.sceneRender = { space: '3d', shadows: { quality: 'high', maxDistance: 80 } }
  view.rerender()
  expect(screen.getByRole('status').textContent).toContain('Active')
  expect(shadowRow('Shadow map size').textContent).toContain('Effective: 1024')
  expect(shadowRow('Shadow max distance').textContent).toContain('Effective: 80')
  expect(shadowRow('Shadow bias').textContent).toContain('Effective: 0')
  expect(entity.components?.[0]?.props).toEqual({ shadowMapSize: 1024, shadowBias: 0 })
  expect(view.props.onProp).not.toHaveBeenCalled()
})

it.each([undefined, 20])('shows PointLight distance 9 as the effective range, with stored shadow distance %s', async (shadowMaxDistance) => {
  renderInspector({ kind: 'entity', sceneName: 'main', space: '3d', entity: {
    name: 'Torch', components: [{ type: 'PointLight', props: { distance: 9, shadowMaxDistance } }],
  } }, { sceneRender: { space: '3d', shadows: { maxDistance: 40 } } })
  await openAdvanced()
  expect(shadowRow('Shadow max distance').textContent).toContain('Effective: 9')
  expect(shadowRow('Shadow map size').textContent).toContain('Effective: 512')
  if (shadowMaxDistance !== undefined) expect(shadowRow('Shadow max distance').textContent).toContain('Stored: 20')
})

it('uses the prefab preview scene policy rather than the unrelated open scene', async () => {
  const prefab: PrefabJson = { waicaPrefab: 1, type: 'object', components: [{ type: 'Sun' }] }
  const props = renderInspector({ kind: 'prefab', ref: 'objects/sun', prefab }, {
    sceneRender: { space: '3d', shadows: { quality: 'high', maxDistance: 200 } },
  })
  await openAdvanced()
  expect(screen.getByRole('status').textContent).toContain('Prefab preview shadows: medium')
  expect(screen.getByRole('status').textContent).toContain('Inactive')
  expect(screen.getByRole('status').textContent).toContain('2D preview')
  expect(shadowRow('Shadow map size').textContent).toContain('Effective: 2048')
  expect(shadowRow('Shadow max distance').textContent).toContain('Effective: 40')
  await userEvent.setup().click(within(shadowRow('Shadow map size')).getByRole('checkbox', { name: 'Override Shadow map size' }))
  expect(props.onPrefabProp).toHaveBeenLastCalledWith('objects/sun', 'Sun', 'shadowMapSize', 2048)
})

it('keeps existing Model and per-light boolean editing in multiselection without an advanced section', async () => {
  const entities = ['A', 'B'].map((name) => ({ name, components: [{ type: 'Model' }, { type: 'Sun' }] }))
  const props = renderInspector({ kind: 'multi', entities, sceneName: 'main' })
  expect(screen.queryByRole('button', { name: 'Advanced shadows' })).toBeNull()
  expect(screen.queryByText('Shadow map size')).toBeNull()
  await userEvent.setup().click(within(section('Sun')).getByRole('checkbox', { name: 'Cast shadows' }))
  expect(props.onMultiProp).toHaveBeenLastCalledWith(['A', 'B'], 'Sun', 'castShadows', false)
  await userEvent.setup().click(within(section('Model')).getByRole('checkbox', { name: 'Receive shadows' }))
  expect(props.onMultiProp).toHaveBeenLastCalledWith(['A', 'B'], 'Model', 'receiveShadows', false)
})

it('honors a ComponentRows custom key list without exposing other advanced fields or generic duplicates', async () => {
  render(<ComponentRows id="custom" comp={{ type: 'Sun', props: { shadowMapSize: 512, shadowBias: 0 } }}
    keys={['shadowMapSize']} onProp={vi.fn()} />, { reactStrictMode: true })
  await openAdvanced()
  expect(screen.getAllByRole('group', { name: 'Shadow map size' })).toHaveLength(1)
  expect(screen.getAllByRole('combobox', { name: 'Shadow map size' })).toHaveLength(1)
  expect(screen.queryByText('Shadow bias')).toBeNull()
})
