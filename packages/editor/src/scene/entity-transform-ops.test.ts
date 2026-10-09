import { describe, expect, it } from 'vitest'
import type { SceneJson } from '@waica/engine'
import { parseSceneJson } from './scene-file'
import * as ops from './ops'

const SCENE: SceneJson = {
  waicaScene: 3,
  render: { space: '3d' },
  camera: { kind: 'perspective', position: [0, 4, 12], target: [0, 0, 0], fov: 55 },
  entities: [
    { name: 'Crate', position: [1, 2, 3], rotation: [0, 90, 0], scale: [2, 1, 2], components: [{ type: 'Model', props: { shape: 'box' } }] },
    { name: 'Flat', position: [4, 5] },
  ],
}

function entity(scene: SceneJson, name: string) {
  const found = ops.findEntity(scene, name)
  if (!found) throw new Error(`no entity ${name}`)
  return found
}

describe('scene writer round trip (CA-5)', () => {
  it('keeps a 3-number position, rotation, scale, render.space and a perspective camera through JSON', () => {
    const text = JSON.stringify(SCENE, null, 2) + '\n'
    expect(parseSceneJson(text)).toEqual(SCENE)
  })

  it('keeps them through every entity edit the editor can make', () => {
    let scene = ops.renameEntity(SCENE, 'Crate', 'Box')
    scene = ops.setComponentProp(scene, 'Box', 'Model', 'color', '#ff0000')
    scene = ops.addComponent(scene, 'Box', 'Sun')
    scene = ops.removeComponent(scene, 'Box', 'Sun')
    scene = ops.moveEntity(scene, 'Box', [9, 8])
    scene = ops.setRenderProp(scene, 'lighting', { ambient: { intensity: 0.5 } })
    scene = ops.setCameraProp(scene, 'fov', 70)
    const box = entity(scene, 'Box')
    expect(box.position).toEqual([9, 8, 3])
    expect(box.rotation).toEqual([0, 90, 0])
    expect(box.scale).toEqual([2, 1, 2])
    expect(scene.render?.space).toBe('3d')
    expect(scene.camera).toMatchObject({ kind: 'perspective', position: [0, 4, 12], fov: 70 })
  })
})

describe('moveEntity (CA-5)', () => {
  it('keeps the z of a 3-number position and leaves a 2-number one at two numbers', () => {
    expect(entity(ops.moveEntity(SCENE, 'Crate', [7, 7]), 'Crate').position).toEqual([7, 7, 3])
    expect(entity(ops.moveEntity(SCENE, 'Flat', [7, 7]), 'Flat').position).toEqual([7, 7])
  })
})

describe('setEntityTransform (CA-21)', () => {
  it('writes a position, rotation or scale and leaves the others', () => {
    const moved = entity(ops.setEntityTransform(SCENE, 'Crate', { position: [0, 1, 2] }), 'Crate')
    expect(moved).toMatchObject({ position: [0, 1, 2], rotation: [0, 90, 0], scale: [2, 1, 2] })
    const turned = entity(ops.setEntityTransform(SCENE, 'Crate', { rotation: [10, 20, 30] }), 'Crate')
    expect(turned).toMatchObject({ position: [1, 2, 3], rotation: [10, 20, 30] })
    const scaled = entity(ops.setEntityTransform(SCENE, 'Crate', { scale: [3, 3, 3] }), 'Crate')
    expect(scaled.scale).toEqual([3, 3, 3])
  })

  it('drops a rotation or scale that is back at its identity, so the file stays clean', () => {
    expect(entity(ops.setEntityTransform(SCENE, 'Crate', { rotation: [0, 0, 0] }), 'Crate')).not.toHaveProperty('rotation')
    expect(entity(ops.setEntityTransform(SCENE, 'Crate', { scale: [1, 1, 1] }), 'Crate')).not.toHaveProperty('scale')
  })

  it('does not touch other entities nor mutate the scene', () => {
    const before = structuredClone(SCENE)
    const next = ops.setEntityTransform(SCENE, 'Crate', { position: [5, 5, 5] })
    expect(SCENE).toEqual(before)
    expect(entity(next, 'Flat')).toEqual(entity(SCENE, 'Flat'))
  })
})

describe('offsetPosition (CA-5)', () => {
  it('shifts x and keeps the shape of the position', () => {
    expect(ops.offsetPosition([1, 2], 0.5)).toEqual([1.5, 2])
    expect(ops.offsetPosition([1, 2, 3], 0.5)).toEqual([1.5, 2, 3])
    expect(ops.offsetPosition(undefined, 0.5)).toEqual([0.5, 0])
  })
})

describe('setCameraProp in a 3D scene (CA-21)', () => {
  it('writes kind: perspective when the scene has no camera block', () => {
    const scene: SceneJson = { waicaScene: 3, render: { space: '3d' }, entities: [] }
    expect(ops.setCameraProp(scene, 'position', [1, 2, 3]).camera).toEqual({ kind: 'perspective', position: [1, 2, 3] })
  })

  it('replaces an orthographic block, which a 3D scene ignores, with a perspective one', () => {
    const scene: SceneJson = { waicaScene: 3, render: { space: '3d' }, camera: { zoom: 12 }, entities: [] }
    expect(ops.setCameraProp(scene, 'fov', 40).camera).toEqual({ kind: 'perspective', fov: 40 })
  })

  it('keeps the other fields of a perspective block', () => {
    expect(ops.setCameraProp(SCENE, 'fov', 70).camera).toEqual({ ...SCENE.camera, fov: 70 })
  })

  it('leaves a 2D scene without a camera block as it was: no kind', () => {
    const scene: SceneJson = { waicaScene: 3, entities: [] }
    expect(ops.setCameraProp(scene, 'zoom', 20).camera).toEqual({ zoom: 20 })
  })
})

describe('moveEntity keeps z (CA-5)', () => {
  it('moves in the XY plane and leaves the z of a 3-number position', () => {
    expect(ops.moveEntity(SCENE, 'Crate', [7, 8]).entities[0]?.position).toEqual([7, 8, 3])
    expect(ops.moveEntity(SCENE, 'Flat', [7, 8]).entities[1]?.position).toEqual([7, 8])
  })
})
