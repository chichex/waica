import { positionLocal } from 'three/tsl'
import * as THREE from 'three/webgpu'
import { expect, it } from 'vitest'
import { SpriteBatch } from './sprite-batch'
import { defined } from './test-support'

function untexturedBatch(): SpriteBatch {
  return new SpriteBatch(
    { texture: null, pixelArt: false, shape: 'rectangle' },
    { texture: () => { throw new Error('untextured: no texture request') } },
    new THREE.PlaneGeometry(1, 1),
  )
}

/** Just what the batch material's hooks read from three's node builder: the object being drawn. */
function builderFor(object: THREE.Object3D): THREE.NodeBuilder {
  return { object } as unknown as THREE.NodeBuilder
}

type UvContext = { getUV(texture: unknown, builder: THREE.NodeBuilder): unknown }

it('is a node material with no GLSL hook: the instance transform is TSL (ADR 0025)', () => {
  const { material } = untexturedBatch()

  expect(material.isNodeMaterial).toBe(true)
  // The GLSL path assigned its hook on the material itself; node materials ignore it.
  expect(Object.hasOwn(material, 'onBeforeCompile')).toBe(false)
})

it('keeps the instance transform to instanced draws, so a plain draw of the material uses three\'s own (review)', () => {
  const { material } = untexturedBatch()
  const instanced = builderFor(new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), material, 1))
  const plain = builderFor(new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material))
  const uvContext = defined(material.contextNode, 'the batch material context').value as UvContext

  // The instance matrix already holds view × world: no modelViewMatrix on top.
  expect(material.setupPositionView(instanced)).toBe(positionLocal)
  expect(material.setupPositionView(plain)).not.toBe(positionLocal)
  expect(uvContext.getUV(null, instanced)).not.toBeNull()
  expect(uvContext.getUV(null, plain)).toBeNull()
})
