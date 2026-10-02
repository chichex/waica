import type * as THREE from 'three'

/**
 * What a rendered scene holds: meshes plus the distinct three.js objects they
 * reference, counted by identity. These are JS objects, not GPU uploads:
 * Texture clones that share one Source (game.assets, ADR 0019) count once
 * each here but upload one image.
 */
export interface SceneCensus {
  meshes: number
  /** Meshes whose whole ancestor chain is visible — the ones three may draw. */
  visibleMeshes: number
  geometries: number
  materials: number
  textures: number
}

function isMesh(object: THREE.Object3D): object is THREE.Mesh {
  return (object as Partial<THREE.Mesh>).isMesh === true
}

function isTexture(value: unknown): value is THREE.Texture {
  return typeof value === 'object' && value !== null && (value as Partial<THREE.Texture>).isTexture === true
}

function texturesOf(material: THREE.Material): THREE.Texture[] {
  return Object.values(material).filter(isTexture)
}

function materialsOf(mesh: THREE.Mesh): THREE.Material[] {
  return Array.isArray(mesh.material) ? mesh.material : [mesh.material]
}

/** Every mesh under `root`, with whether it and all its ancestors are visible. */
function collectMeshes(root: THREE.Object3D): { mesh: THREE.Mesh; visible: boolean }[] {
  const found: { mesh: THREE.Mesh; visible: boolean }[] = []
  const walk = (object: THREE.Object3D, parentVisible: boolean): void => {
    const visible = parentVisible && object.visible
    if (isMesh(object)) found.push({ mesh: object, visible })
    for (const child of object.children) walk(child, visible)
  }
  walk(root, true)
  return found
}

/** Counts meshes and the distinct (by identity) geometry, material and Texture objects they use. */
export function census(root: THREE.Object3D): SceneCensus {
  const meshes = collectMeshes(root)
  const geometries = new Set<THREE.BufferGeometry>()
  const materials = new Set<THREE.Material>()
  const textures = new Set<THREE.Texture>()
  for (const { mesh } of meshes) {
    geometries.add(mesh.geometry)
    for (const material of materialsOf(mesh)) {
      materials.add(material)
      for (const texture of texturesOf(material)) textures.add(texture)
    }
  }
  return {
    meshes: meshes.length,
    visibleMeshes: meshes.filter((entry) => entry.visible).length,
    geometries: geometries.size,
    materials: materials.size,
    textures: textures.size,
  }
}

export interface CreationTotals {
  materialsCreated: number
  geometriesCreated: number
}

/**
 * Counts materials and geometries the first time they appear in the scene
 * across observations. Observed once per Simulation Step, it approximates
 * allocations: a resource created and discarded within one step is missed.
 */
export class CreationTracker {
  private readonly seenMaterials = new Set<string>()
  private readonly seenGeometries = new Set<string>()

  observe(root: THREE.Object3D): void {
    for (const { mesh } of collectMeshes(root)) {
      this.seenGeometries.add(mesh.geometry.uuid)
      for (const material of materialsOf(mesh)) this.seenMaterials.add(material.uuid)
    }
  }

  get totals(): CreationTotals {
    return {
      materialsCreated: this.seenMaterials.size,
      geometriesCreated: this.seenGeometries.size,
    }
  }
}
