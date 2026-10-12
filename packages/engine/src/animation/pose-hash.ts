import * as THREE from 'three/webgpu'

const FNV_OFFSET = 0x811c9dc5
const FNV_PRIME = 0x01000193

/** The 32-bit FNV-1a hash of `text` (UTF-8), as eight lowercase hex digits. Synchronous and dependency-free, the same on every backend. */
export function fnv1a(text: string): string {
  let hash = FNV_OFFSET
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= byte
    hash = Math.imul(hash, FNV_PRIME) >>> 0
  }
  return hash.toString(16).padStart(8, '0')
}

const round = (value: number): string => (Math.round(value * 1e4) / 1e4).toFixed(4)

type AnySkinnedMesh = THREE.SkinnedMesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>

/** A skinned mesh, typed for what a glTF gives it (the generics three leaves at `any`). */
function isSkinnedMesh(object: THREE.Object3D): object is AnySkinnedMesh {
  return object instanceof THREE.SkinnedMesh
}

/** The skinned meshes under `root`, in traversal order. */
function skinnedMeshesUnder(root: THREE.Object3D): AnySkinnedMesh[] {
  const found: AnySkinnedMesh[] = []
  root.traverse((object) => {
    if (isSkinnedMesh(object)) found.push(object)
  })
  return found
}

/**
 * A fingerprint of a rig's pose (issue #166 CA-10): FNV-1a over every bone's
 * local quaternion and position rounded to 1e-4, in skeleton order, skeleton
 * by skeleton. Empty with no skinned mesh under `root`. Two frames of the same
 * clip differ; the same step of the same clip hashes alike on every platform.
 */
export function poseHash(root: THREE.Object3D): string {
  const parts: string[] = []
  for (const mesh of skinnedMeshesUnder(root)) {
    for (const bone of mesh.skeleton.bones) {
      const { x, y, z, w } = bone.quaternion
      const { x: px, y: py, z: pz } = bone.position
      parts.push([x, y, z, w, px, py, pz].map(round).join(','))
    }
  }
  return parts.length === 0 ? '' : fnv1a(parts.join(';'))
}
