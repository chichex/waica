import * as THREE from 'three/webgpu'

/** Keeps Three's transparent-object sort key on live vertices, never unused capacity. */
export function refreshParticleSortBounds(
  geometry: THREE.BufferGeometry,
  active: number,
  emptyZ: number,
): void {
  const positions = geometry.getAttribute('position') as THREE.BufferAttribute
  const sphere = geometry.boundingSphere ?? new THREE.Sphere()
  geometry.boundingSphere = sphere
  if (active === 0) {
    sphere.center.set(0, 0, emptyZ)
    sphere.radius = 0
    return
  }
  let minX = Number.POSITIVE_INFINITY
  let minY = Number.POSITIVE_INFINITY
  let minZ = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  let maxY = Number.NEGATIVE_INFINITY
  let maxZ = Number.NEGATIVE_INFINITY
  for (let vertex = 0; vertex < active * 4; vertex += 1) {
    const x = positions.getX(vertex)
    const y = positions.getY(vertex)
    const z = positions.getZ(vertex)
    minX = Math.min(minX, x)
    minY = Math.min(minY, y)
    minZ = Math.min(minZ, z)
    maxX = Math.max(maxX, x)
    maxY = Math.max(maxY, y)
    maxZ = Math.max(maxZ, z)
  }
  const width = maxX - minX
  const height = maxY - minY
  const depth = maxZ - minZ
  sphere.center.set(minX + width / 2, minY + height / 2, minZ + depth / 2)
  sphere.radius = Math.sqrt(width * width + height * height + depth * depth) / 2
}
