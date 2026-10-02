import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { CreationTracker, census } from './census.ts'

function quad(material = new THREE.MeshBasicMaterial()): THREE.Mesh {
  return new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material)
}

describe('census', () => {
  it('counts nothing in an empty scene', () => {
    expect(census(new THREE.Scene())).toEqual({
      meshes: 0,
      visibleMeshes: 0,
      geometries: 0,
      materials: 0,
      textures: 0,
      textureSources: 0,
    })
  })

  it('counts two sprites that share nothing as two of everything', () => {
    const scene = new THREE.Scene()
    scene.add(quad(), quad())
    expect(census(scene)).toMatchObject({ meshes: 2, geometries: 2, materials: 2 })
  })

  it('counts a material reused by two meshes once', () => {
    const scene = new THREE.Scene()
    const shared = new THREE.MeshBasicMaterial()
    scene.add(quad(shared), quad(shared))
    expect(census(scene)).toMatchObject({ meshes: 2, materials: 1 })
  })
})

describe('census visibility and textures', () => {
  it('counts an invisible mesh, or one under an invisible parent, as not visible', () => {
    const scene = new THREE.Scene()
    const hidden = quad()
    hidden.visible = false
    const group = new THREE.Group()
    group.visible = false
    group.add(quad())
    scene.add(hidden, group, quad())
    expect(census(scene)).toMatchObject({ meshes: 3, visibleMeshes: 1 })
  })

  it('counts Texture clones of one base once as a texture source', () => {
    const scene = new THREE.Scene()
    const base = new THREE.Texture()
    scene.add(
      quad(new THREE.MeshBasicMaterial({ map: base.clone() })),
      quad(new THREE.MeshBasicMaterial({ map: base.clone() })),
    )
    expect(census(scene)).toMatchObject({ textures: 2, textureSources: 1 })
  })

  it('counts distinct textures across materials', () => {
    const scene = new THREE.Scene()
    const texture = new THREE.Texture()
    scene.add(
      quad(new THREE.MeshBasicMaterial({ map: texture })),
      quad(new THREE.MeshBasicMaterial({ map: texture })),
      quad(new THREE.MeshBasicMaterial({ map: new THREE.Texture() })),
    )
    expect(census(scene).textures).toBe(2)
  })
})

describe('CreationTracker', () => {
  it('counts each material and geometry the first time it is seen', () => {
    const tracker = new CreationTracker()
    const scene = new THREE.Scene()
    const first = quad()
    scene.add(first)
    tracker.observe(scene)
    tracker.observe(scene)
    expect(tracker.totals).toEqual({ materialsCreated: 1, geometriesCreated: 1 })

    scene.remove(first)
    scene.add(quad())
    tracker.observe(scene)
    expect(tracker.totals).toEqual({ materialsCreated: 2, geometriesCreated: 2 })
  })
})
