// @vitest-environment happy-dom
import { cleanup, fireEvent, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, expect, it } from 'vitest'
import type { PrefabJson } from '@waica/engine'
import type { InspectorSelection } from './Inspector'
import { HERO_ART, renderInspector, section } from './inspector-test-support'

/**
 * Characterization of the PrefabInspector before it is split by
 * responsibility: the shared blueprint's appearance, collision, tilemap and
 * behaviours, and the prefab callbacks each control fires.
 */

afterEach(cleanup)

const CRATE: PrefabJson = {
  waicaPrefab: 1,
  type: 'object',
  components: [
    { type: 'Sprite', props: { texture: HERO_ART.uri } },
    { type: 'Hitbox' },
    { type: 'Health' },
  ],
}

function prefabSelection(prefab: PrefabJson, ref = 'objects/crate'): InspectorSelection {
  return { kind: 'prefab', ref, prefab }
}

it('names the shared blueprint and edits its behaviours', async () => {
  const user = userEvent.setup()
  const props = renderInspector(prefabSelection(CRATE), { prefabs: { 'objects/crate': CRATE } })

  expect(screen.getByText('crate')).toBeDefined()
  expect(screen.getByText('object prefab')).toBeDefined()
  expect(
    screen.getByText('shared blueprint — changes here reach every instance in every scene'),
  ).toBeDefined()

  const behaviours = section('Behaviours')
  fireEvent.change(within(behaviours).getByRole('spinbutton', { name: /^Max health/ }), {
    target: { value: '4' },
  })
  expect(props.onPrefabProp).toHaveBeenLastCalledWith('objects/crate', 'Health', 'max', 4)
  await user.click(within(behaviours).getByTitle('Remove component'))
  expect(props.onPrefabRemoveComponent).toHaveBeenCalledWith('objects/crate', 'Health')
  await user.selectOptions(within(behaviours).getByDisplayValue('+ behaviour…'), 'Hazard')
  await user.click(within(behaviours).getByRole('button', { name: 'add' }))
  expect(props.onPrefabAddComponent).toHaveBeenCalledWith('objects/crate', 'Hazard')
})

it('switches the appearance from image to shape and toggles animation', async () => {
  const user = userEvent.setup()
  const props = renderInspector(prefabSelection(CRATE), { prefabs: { 'objects/crate': CRATE } })
  const appearance = section('Appearance')

  await user.click(within(appearance).getByRole('checkbox', { name: 'animated' }))
  expect(props.onPrefabToggleAnimated).toHaveBeenCalledWith('objects/crate')

  await user.click(within(appearance).getByRole('button', { name: /hero\.png/ }))
  expect(within(appearance).getByText('Drag an image here, or pick one:')).toBeDefined()
  await user.click(within(appearance).getByRole('button', { name: 'Keep current image' }))
  expect(within(appearance).queryByText('Drag an image here, or pick one:')).toBeNull()

  await user.selectOptions(within(appearance).getByRole('combobox', { name: 'type' }), 'shape')
  expect(props.onPrefabSetShape).toHaveBeenCalledWith('objects/crate')
})

it('invites an image on a shape prefab and picks it from the art grid', async () => {
  const user = userEvent.setup()
  const shape: PrefabJson = { ...CRATE, components: [{ type: 'Sprite' }, { type: 'Hitbox' }] }
  const props = renderInspector(prefabSelection(shape), { prefabs: { 'objects/crate': shape } })
  const appearance = section('Appearance')

  await user.selectOptions(within(appearance).getByRole('combobox', { name: 'type' }), 'image')
  expect(within(appearance).getByText('Drag an image here, or pick one:')).toBeDefined()
  expect(within(appearance).queryByRole('button', { name: /jump\.ogg/ })).toBeNull()
  await user.click(within(appearance).getByRole('button', { name: /hero\.png/ }))
  expect(props.onPrefabSetTexture).toHaveBeenCalledWith('objects/crate', HERO_ART.uri)
})

it('toggles optional collision off', async () => {
  const user = userEvent.setup()
  const props = renderInspector(prefabSelection(CRATE), { prefabs: { 'objects/crate': CRATE } })

  await user.click(within(section('Collision')).getByRole('checkbox', { name: 'hitbox' }))
  expect(props.onPrefabSetCollision).toHaveBeenCalledWith('objects/crate', false)
})

it('explains what a prefab without collision means', () => {
  const bare: PrefabJson = { ...CRATE, components: [{ type: 'Sprite' }, { type: 'Hazard' }] }
  renderInspector(prefabSelection(bare), { prefabs: { 'objects/crate': bare } })
  expect(within(section('Collision')).getByText("no hitbox — Hazard won't react")).toBeDefined()
  cleanup()

  const decor: PrefabJson = { ...CRATE, components: [{ type: 'Sprite' }] }
  renderInspector(prefabSelection(decor), { prefabs: { 'objects/crate': decor } })
  expect(within(section('Collision')).getByText('no hitbox — this object is decorative')).toBeDefined()
  cleanup()

  const tile: PrefabJson = { waicaPrefab: 1, type: 'tile', components: [{ type: 'Sprite' }] }
  renderInspector(prefabSelection(tile, 'tiles/grass'), { prefabs: { 'tiles/grass': tile } })
  expect(within(section('Collision')).getByText('no collision — this tile is decor')).toBeDefined()
})

it('edits a prefab tilemap without a paint brush', () => {
  const map: PrefabJson = {
    waicaPrefab: 1,
    type: 'object',
    components: [{ type: 'Tilemap', props: { cols: 1, rows: 1 } }],
  }
  const props = renderInspector(prefabSelection(map, 'objects/map'), {
    prefabs: { 'objects/map': map },
  })
  const tilemap = section('Tilemap')

  expect(within(tilemap).queryByRole('checkbox', { name: 'Paint' })).toBeNull()
  fireEvent.change(within(tilemap).getByRole('spinbutton', { name: 'layer' }), {
    target: { value: '2' },
  })
  expect(props.onPrefabProp).toHaveBeenLastCalledWith('objects/map', 'Tilemap', 'layer', 2)
})

it('opens the animation editor on a character prefab with fixed collision', async () => {
  const user = userEvent.setup()
  const hero: PrefabJson = {
    waicaPrefab: 1,
    type: 'character',
    components: [{ type: 'AnimatedSprite', props: { texture: HERO_ART.uri } }, { type: 'Hitbox' }],
  }
  const props = renderInspector(prefabSelection(hero, 'characters/hero'), {
    prefabs: { 'characters/hero': hero },
  })

  expect(screen.getByText('character prefab')).toBeDefined()
  expect(within(section('Collision')).queryByRole('checkbox')).toBeNull()
  await user.click(screen.getByRole('button', { name: /Edit animation/ }))
  expect(props.onEditAnimation).toHaveBeenCalledWith({ kind: 'prefab', ref: 'characters/hero' })
})
