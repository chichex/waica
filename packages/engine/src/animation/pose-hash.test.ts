import * as THREE from 'three/webgpu'
import { describe, expect, it } from 'vitest'
import { fnv1a, poseHash } from './pose-hash'

/** A skinned mesh of two bones under a root, the way a glTF rig loads. */
function rigOf(): { root: THREE.Group; bones: THREE.Bone[] } {
  const root = new THREE.Group()
  const hip = new THREE.Bone()
  const knee = new THREE.Bone()
  hip.add(knee)
  const mesh = new THREE.SkinnedMesh(new THREE.BufferGeometry(), new THREE.MeshStandardMaterial())
  mesh.add(hip)
  mesh.bind(new THREE.Skeleton([hip, knee]))
  root.add(mesh)
  return { root, bones: [hip, knee] }
}

describe('fnv1a (issue #166 CA-10)', () => {
  it('is the 32-bit FNV-1a of the text, as eight hex digits', () => {
    expect(fnv1a('')).toBe('811c9dc5')
    expect(fnv1a('a')).toBe('e40c292c')
    expect(fnv1a('foobar')).toBe('bf9cf968')
  })
})

describe('poseHash (issue #166 CA-10)', () => {
  it('hashes every bone quaternion and position in skeleton order, rounded to 1e-4, and is empty with no skeleton', () => {
    const { root, bones } = rigOf()
    const rest = poseHash(root)
    expect(rest).toMatch(/^[0-9a-f]{8}$/)
    expect(poseHash(new THREE.Group())).toBe('')

    defined(bones[1]).rotation.x = 0.5
    const bent = poseHash(root)
    expect(bent).not.toBe(rest)
    defined(bones[1]).position.y += 0.00001
    expect(poseHash(root)).toBe(bent)
    defined(bones[1]).position.y += 0.001
    expect(poseHash(root)).not.toBe(bent)
  })
})

function defined<T>(value: T | undefined): T {
  if (value === undefined) throw new Error('expected a value')
  return value
}
