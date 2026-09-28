// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it } from 'vitest'
import type { PrefabJson, SceneEntityJson } from '@waica/engine'
import type { InspectorSelection } from './Inspector'
import { HERO_ART, renderInspector, row, section } from './inspector-test-support'
import { defined } from '../../../engine/src/test-support'

/**
 * Characterization of the EntityInspector before it is split by
 * responsibility: an inline entity's identity, appearance, collision,
 * tilemap and behaviours, and a prefab instance's overrides.
 */

afterEach(cleanup)

function inlineEntity(components: SceneEntityJson['components']): InspectorSelection {
  return { kind: 'entity', sceneName: 'main', entity: { name: 'Box', position: [1, 2], components } }
}

it('names an inline entity a one-off and edits its name and position', async () => {
  const user = userEvent.setup()
  const props = renderInspector(inlineEntity([{ type: 'Sprite' }]))

  expect(screen.getByText('entity')).toBeDefined()
  expect(screen.getByText('one-off entity — lives only in "main"')).toBeDefined()

  const name = screen.getByRole('textbox', { name: 'name' })
  await user.clear(name)
  await user.type(name, 'Crate')
  await user.tab()
  expect(props.onRename).toHaveBeenCalledWith('Box', 'Crate')

  const [x, y] = within(row('position')).getAllByRole('spinbutton')
  fireEvent.change(defined(x), { target: { value: '4' } })
  expect(props.onMove).toHaveBeenLastCalledWith('Box', [4, 2])
  fireEvent.change(defined(y), { target: { value: '5' } })
  expect(props.onMove).toHaveBeenLastCalledWith('Box', [1, 5])
})

it('edits a shape appearance and hides it from the viewport', async () => {
  const user = userEvent.setup()
  const props = renderInspector(
    inlineEntity([{ type: 'Sprite', props: { width: 2, color: 0xff0000 } }]),
  )
  const appearance = section('Appearance')

  expect(within(appearance).queryByRole('combobox', { name: 'type' })).toBeNull()
  await user.selectOptions(within(appearance).getByRole('combobox', { name: 'shape' }), 'circle')
  expect(props.onProp).toHaveBeenLastCalledWith('Box', 'Sprite', 'shape', 'circle')

  const color = defined(appearance.querySelector<HTMLInputElement>('input[type="color"]'))
  expect(color.value).toBe('#ff0000')
  fireEvent.change(color, { target: { value: '#00ff00' } })
  expect(props.onProp).toHaveBeenLastCalledWith('Box', 'Sprite', 'color', 0x00ff00)

  fireEvent.change(within(appearance).getByRole('spinbutton', { name: 'width' }), {
    target: { value: '3' },
  })
  expect(props.onProp).toHaveBeenLastCalledWith('Box', 'Sprite', 'width', 3)

  await user.click(
    within(appearance).getByRole('button', { name: 'Hide appearance in the viewport' }),
  )
  expect(props.onViewportVisibility).toHaveBeenCalledWith('appearance', false)
})

it('sizes the appearance to the scene camera with Fill camera', async () => {
  const user = userEvent.setup()
  const props = renderInspector(inlineEntity([{ type: 'Sprite' }]), {
    sceneCamera: { position: [3, 4], zoom: 9 },
  })

  await user.click(screen.getByRole('button', { name: /Fill camera/ }))
  expect(props.onSizeAppearance).toHaveBeenCalledWith('Box', 'Sprite', {
    width: 16,
    height: 9,
    offsetX: 2,
    offsetY: 2,
  })
})

it('picks an inline entity’s collision kind', async () => {
  const user = userEvent.setup()
  const props = renderInspector(inlineEntity([{ type: 'Sprite' }]))
  const collision = section('Collision')

  expect(within(collision).queryByRole('button', { name: /collision in the viewport/ })).toBeNull()
  await user.selectOptions(within(collision).getByRole('combobox', { name: 'type' }), 'Hitbox')
  expect(props.onSetEntityCollision).toHaveBeenCalledWith('Box', 'Hitbox')
})

it('edits a polygon hitbox and removes it', async () => {
  const user = userEvent.setup()
  const props = renderInspector(
    inlineEntity([
      { type: 'Sprite' },
      { type: 'Hitbox', props: { shape: 'polygon', points: [[0, 0], [2, 0], [0, 1]] } },
    ]),
  )
  const box = section('Collision')

  expect(within(box).getByRole('combobox', { name: 'shape' })).toBeDefined()
  expect(within(box).getByText('3 vertices — drag them in the viewport')).toBeDefined()
  expect(within(box).getByRole<HTMLButtonElement>('button', { name: '− last' }).disabled).toBe(true)
  await user.click(within(box).getByRole('button', { name: '+ vertex' }))
  expect(props.onProp).toHaveBeenLastCalledWith('Box', 'Hitbox', 'points', [
    [0, 1],
    [0, 0],
    [2, 0],
    [1, 0.5],
  ])

  await user.selectOptions(within(box).getByRole('combobox', { name: 'type' }), 'none')
  expect(props.onSetEntityCollision).toHaveBeenCalledWith('Box', null)
  await user.click(within(box).getByRole('button', { name: 'Hide collision in the viewport' }))
  expect(props.onViewportVisibility).toHaveBeenCalledWith('collision', false)
})

it('edits, removes and adds behaviours and deletes the entity', async () => {
  const user = userEvent.setup()
  const props = renderInspector(
    inlineEntity([{ type: 'Sprite' }, { type: 'Health', props: { max: 5 } }]),
  )
  const behaviours = section('Behaviours')

  expect(within(behaviours).getByText('Health')).toBeDefined()
  fireEvent.change(within(behaviours).getByRole('spinbutton', { name: /^Max health/ }), {
    target: { value: '7' },
  })
  expect(props.onProp).toHaveBeenLastCalledWith('Box', 'Health', 'max', 7)
  await user.click(within(behaviours).getByTitle('Remove component'))
  expect(props.onRemoveComponent).toHaveBeenCalledWith('Box', 'Health')

  const add = within(behaviours).getByRole<HTMLButtonElement>('button', { name: 'add' })
  expect(add.disabled).toBe(true)
  await user.selectOptions(within(behaviours).getByDisplayValue('+ behaviour…'), 'Hazard')
  await user.click(add)
  expect(props.onAddComponent).toHaveBeenCalledWith('Box', 'Hazard')

  await user.click(screen.getByRole('button', { name: /Delete entity/ }))
  expect(props.onDelete).toHaveBeenCalledWith('Box')
})

it('shows no behaviours yet on an entity without any', () => {
  renderInspector(inlineEntity([{ type: 'Sprite' }]))

  expect(within(section('Behaviours')).getByText('no behaviours yet')).toBeDefined()
})

it('offers typed references as a picker with a custom text escape hatch', async () => {
  const user = userEvent.setup()
  const props = renderInspector(inlineEntity([{ type: 'Collectible', props: { stat: 'gems' } }]))
  const behaviours = section('Behaviours')
  const picker = within(behaviours).getByRole<HTMLSelectElement>('combobox', { name: /^Adds to stat/ })

  expect(picker.value).toBe('gems')
  expect(picker.getAttribute('aria-invalid')).toBe('true')
  await user.selectOptions(picker, 'points')
  expect(props.onProp).toHaveBeenLastCalledWith('Box', 'Collectible', 'stat', 'points')

  await user.selectOptions(picker, 'Custom…')
  const custom = within(behaviours).getByRole('textbox', { name: /^Adds to stat/ })
  fireEvent.change(custom, { target: { value: 'coins' } })
  expect(props.onProp).toHaveBeenLastCalledWith('Box', 'Collectible', 'stat', 'coins')
  await user.click(within(behaviours).getByTitle(/Pick from the project's known values/))
  expect(within(behaviours).getByRole('combobox', { name: /^Adds to stat/ })).toBeDefined()
})

it('edits and paints an entity tilemap through the brush', async () => {
  const user = userEvent.setup()
  const props = renderInspector(
    inlineEntity([{ type: 'Tilemap', props: { cols: 2, rows: 1, mapWidth: 4 } }]),
    { tilemapBrush: { entity: 'Box', tile: 1, paint: false } },
  )
  const tilemap = section('Tilemap')

  fireEvent.change(within(tilemap).getByRole('spinbutton', { name: 'map width' }), {
    target: { value: '6' },
  })
  expect(props.onProp).toHaveBeenLastCalledWith('Box', 'Tilemap', 'mapWidth', 6)
  await user.click(within(tilemap).getByRole('button', { name: '0' }))
  expect(props.onTilemapBrush).toHaveBeenLastCalledWith({ entity: 'Box', tile: 0, paint: false })
  await user.click(within(tilemap).getByRole('checkbox', { name: 'Paint' }))
  expect(props.onTilemapBrush).toHaveBeenLastCalledWith({ entity: 'Box', tile: 1, paint: true })
  expect(within(section('Behaviours')).queryByText('Tilemap')).toBeNull()
})

const COIN: PrefabJson = {
  waicaPrefab: 1,
  type: 'object',
  components: [
    { type: 'Sprite', props: { width: 1 } },
    { type: 'Hitbox', props: { width: 1, height: 1 } },
    { type: 'Collectible', props: { value: 1 } },
  ],
}

const COIN_INSTANCE: InspectorSelection = {
  kind: 'entity',
  sceneName: 'main',
  entity: { name: 'Coin 1', prefab: 'objects/coin', overrides: { Sprite: { width: 3 } } },
}

it('marks an instance’s overrides and resets or applies them one by one', async () => {
  const user = userEvent.setup()
  const props = renderInspector(COIN_INSTANCE, { prefabs: { 'objects/coin': COIN } })

  expect(screen.getByText('instance')).toBeDefined()
  expect(
    screen.getByText('changes affect only this instance in "main" — the prefab stays untouched'),
  ).toBeDefined()
  expect(screen.getByText(/● marks props changed here/)).toBeDefined()
  await user.click(screen.getByRole('button', { name: /instance of objects\/coin · 1 override$/ }))
  expect(props.onOpenPrefab).toHaveBeenCalledWith('objects/coin')

  const appearance = section('Appearance')
  await user.click(within(appearance).getByTitle("Reset to the prefab's value"))
  expect(props.onResetProp).toHaveBeenCalledWith('Coin 1', 'Sprite', 'width')
  await user.click(
    within(appearance).getByTitle('Apply to the prefab — every instance gets this value'),
  )
  expect(props.onApplyProp).toHaveBeenCalledWith('Coin 1', 'Sprite', 'width')
})

it('resets or applies every override of an instance at once', async () => {
  const user = userEvent.setup()
  const props = renderInspector(COIN_INSTANCE, { prefabs: { 'objects/coin': COIN } })

  await user.click(screen.getByRole('button', { name: '↺ Reset all' }))
  expect(props.onResetAllProps).toHaveBeenCalledWith('Coin 1')
  await user.click(screen.getByRole('button', { name: '⤒ Apply all' }))
  expect(props.onApplyAllProps).toHaveBeenCalledWith('Coin 1')
})

it('keeps prefab-owned behaviours locked and an instance’s collision kind fixed', async () => {
  const user = userEvent.setup()
  const props = renderInspector(COIN_INSTANCE, { prefabs: { 'objects/coin': COIN } })
  const collision = section('Collision')

  expect(within(section('Behaviours')).queryByTitle('Remove component')).toBeNull()
  expect(within(collision).queryByRole('combobox', { name: 'type' })).toBeNull()
  expect(within(collision).queryByRole('checkbox')).toBeNull()
  fireEvent.change(within(collision).getByRole('spinbutton', { name: /^height/ }), {
    target: { value: '2' },
  })
  expect(props.onProp).toHaveBeenLastCalledWith('Coin 1', 'Hitbox', 'height', 2)
  await user.selectOptions(within(collision).getByRole('combobox', { name: 'shape' }), 'circle')
  expect(props.onProp).toHaveBeenLastCalledWith('Coin 1', 'Hitbox', 'shape', 'circle')
})

it('hides the override actions on an instance without overrides', () => {
  renderInspector(
    { kind: 'entity', sceneName: 'main', entity: { name: 'Coin 2', prefab: 'objects/coin' } },
    { prefabs: { 'objects/coin': COIN } },
  )

  expect(screen.getByRole('button', { name: 'instance of objects/coin' })).toBeDefined()
  expect(screen.queryByRole('button', { name: '↺ Reset all' })).toBeNull()
  expect(screen.queryByText(/● marks props changed here/)).toBeNull()
})

it('shows the prefab’s missing collision hint on an instance', () => {
  const bush: PrefabJson = { waicaPrefab: 1, type: 'object', components: [{ type: 'Sprite' }] }
  renderInspector(
    { kind: 'entity', sceneName: 'main', entity: { name: 'Bush', prefab: 'objects/bush' } },
    { prefabs: { 'objects/bush': bush } },
  )

  expect(within(section('Collision')).getByText('no collision — defined by the prefab')).toBeDefined()
})

it('warns about missing clips and edits the animation where the sprite lives', async () => {
  const user = userEvent.setup()
  const hero: PrefabJson = {
    waicaPrefab: 1,
    type: 'character',
    components: [
      { type: 'AnimatedSprite', props: { texture: HERO_ART.uri, clips: { idle: {} } } },
      { type: 'Hitbox' },
      { type: 'StateMachine', props: { role: 'player', initial: 'idle', states: { idle: {}, run: {} } } },
    ],
  }
  const props = renderInspector(
    { kind: 'entity', sceneName: 'main', entity: { name: 'Hero', prefab: 'characters/hero' } },
    { prefabs: { 'characters/hero': hero } },
  )

  expect(screen.getByText('missing clips: run')).toBeDefined()
  expect(screen.getByText('Role')).toBeDefined()
  await user.click(screen.getByRole('button', { name: /Edit animation/ }))
  expect(props.onEditAnimation).toHaveBeenCalledWith({ kind: 'prefab', ref: 'characters/hero' })
})

it('edits the animation of an entity that owns its sprite', async () => {
  const user = userEvent.setup()
  const props = renderInspector({
    kind: 'entity',
    sceneName: 'main',
    entity: { name: 'Bat', components: [{ type: 'AnimatedSprite', props: { texture: HERO_ART.uri } }] },
  })

  await user.click(screen.getByRole('button', { name: /Edit animation/ }))
  expect(props.onEditAnimation).toHaveBeenCalledWith({ kind: 'entity', name: 'Bat' })
})
