// Test support for the Sprite Batch tests (ADR 0024), excluded from builds.
// The test files mock three's WebGPURenderer with test-renderer.ts; these
// helpers only read the scene.
import * as THREE from 'three/webgpu'
import { afterEach, beforeEach, expect, vi } from 'vitest'
import { FakeTextureBackend } from './assets/test-helpers.js'
import { AnimatedSprite } from './components/animated-sprite.js'
import { Sprite } from './components/sprite.js'
import { Game } from './game.js'
import type { SceneEntityJson, SceneJson, SceneRegistry } from './scene.js'
import { StateMachine } from './state/state-machine.js'
import { fakeRendering, resetFakeRendering } from './test-renderer.js'
import { defined } from './test-support.js'

class ResizeObserverStub {
  observe(): void {}
  disconnect(): void {}
}

/** What the mocked renderer calls on every render, so a test can look at the scene as three would draw it. */
export function onRender(hook: (scene: unknown) => void): void {
  fakeRendering.onRender = (scene) => hook(scene)
}

/** A clean DOM, a ResizeObserver stub and no render hook around every test. */
export function useSpriteBatchTestEnvironment(): void {
  beforeEach(() => {
    document.body.innerHTML = ''
    vi.stubGlobal('ResizeObserver', ResizeObserverStub)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    resetFakeRendering()
  })
}

// AnimatedSprite updates after StateMachine, which must be resolvable.
export const REGISTRY: SceneRegistry = { components: { Sprite, AnimatedSprite, StateMachine } }

export function makeGame(textures = new FakeTextureBackend()): Game {
  const canvas = document.createElement('canvas')
  Object.defineProperties(canvas, {
    clientWidth: { value: 640 },
    clientHeight: { value: 360 },
  })
  document.body.append(canvas)
  return new Game({ canvas, textures })
}

/** A Game whose renderer is ready (ADR 0025), so its frames draw. */
export async function readyGame(textures = new FakeTextureBackend()): Promise<Game> {
  const game = makeGame(textures)
  await game.ready()
  return game
}

/** One rendered frame with no Simulation Step: the render pass only. */
export function renderFrame(game: Game): void {
  ;(game as unknown as { runFrame(steps: number): void }).runFrame(0)
}

/** One Simulation Step, then the render pass. */
export function stepFrame(game: Game): void {
  ;(game as unknown as { runFrame(steps: number): void }).runFrame(1)
}

export type AnyMesh = THREE.Mesh<THREE.BufferGeometry, THREE.Material | THREE.Material[]>
export type BasicMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshBasicMaterial>

/** Every mesh under the scene, and whether three may draw it (its whole ancestor chain visible). */
export function meshes(game: Game): { mesh: AnyMesh; drawn: boolean }[] {
  const found: { mesh: AnyMesh; drawn: boolean }[] = []
  const walk = (object: THREE.Object3D, visible: boolean): void => {
    const drawn = visible && object.visible
    if ((object as Partial<AnyMesh>).isMesh === true) found.push({ mesh: object as AnyMesh, drawn })
    for (const child of object.children) walk(child, drawn)
  }
  walk(game.scene, true)
  return found
}

export function drawnMeshes(game: Game): AnyMesh[] {
  return meshes(game).filter((entry) => entry.drawn).map((entry) => entry.mesh)
}

export function runMeshes(game: Game): THREE.InstancedMesh[] {
  return drawnMeshes(game).filter((mesh): mesh is THREE.InstancedMesh => mesh instanceof THREE.InstancedMesh)
}

export function onlyRun(game: Game): THREE.InstancedMesh {
  const runs = runMeshes(game)
  expect(runs).toHaveLength(1)
  return defined(runs[0], 'one Sprite Batch run')
}

/** Distinct materials referenced by any mesh in the scene, drawn or not. */
export function materials(game: Game): Set<THREE.Material> {
  const found = new Set<THREE.Material>()
  for (const { mesh } of meshes(game)) {
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) found.add(material)
  }
  return found
}

/** An unlit basic material: a sprite's own MeshBasicMaterial, or a batch's node equivalent (ADR 0025). */
export type BasicMaterial = THREE.MeshBasicMaterial | THREE.MeshBasicNodeMaterial

export function basic(material: THREE.Material | THREE.Material[]): BasicMaterial {
  if (material instanceof THREE.MeshBasicMaterial || material instanceof THREE.MeshBasicNodeMaterial) return material
  throw new Error('expected one MeshBasicMaterial or MeshBasicNodeMaterial')
}

/** The linear RGB a run carries for its instance at `index`. */
export function instanceColor(run: THREE.InstancedMesh, index: number): number[] {
  const color = new THREE.Color()
  run.getColorAt(index, color)
  return color.toArray()
}

/** The linear RGB of `hex` as a Float32 instance buffer holds it. */
export function linear(hex: number): number[] {
  return new THREE.Color().setHex(hex).toArray().map(Math.fround)
}

export function spriteEntity(
  name: string,
  props: Record<string, unknown>,
  position: [number, number] = [0, 0],
): SceneEntityJson {
  return { name, position, components: [{ type: 'Sprite', props }] }
}

export const SHEET = '/sheet.png'
const WALK = { frames: [0, 1, 2, 3, 4, 5], fps: 10 }

/** An AnimatedSprite on a 4×2 grid sheet, walking from its first frame. */
export function animatedEntity(
  name: string,
  props: Record<string, unknown>,
  position: [number, number] = [0, 0],
): SceneEntityJson {
  const defaults = { texture: SHEET, cols: 4, rows: 2, clips: { walk: WALK }, initialClip: 'walk' }
  return { name, position, components: [{ type: 'AnimatedSprite', props: { ...defaults, ...props } }] }
}

export function scene(entities: SceneEntityJson[], render?: SceneJson['render']): SceneJson {
  return { waicaScene: 3, entities, ...(render ? { render } : {}) }
}

export function spriteOf(game: Game, name: string): Sprite {
  return defined(defined(game.find(name), name).get(Sprite), `${name}'s Sprite`)
}

export interface InstanceRecord {
  matrix: number[]
  color: number[]
  uv: number[]
  map: THREE.Texture | null
}

function runRecords(run: THREE.InstancedMesh): InstanceRecord[] {
  const uv = run.geometry.getAttribute('instanceUv') as THREE.InstancedBufferAttribute
  const colors = defined(run.instanceColor, 'instance colors')
  return Array.from({ length: run.count }, (_, index) => ({
    matrix: Array.from(run.instanceMatrix.array.slice(index * 16, index * 16 + 16)),
    color: Array.from(colors.array.slice(index * 3, index * 3 + 3)),
    uv: Array.from(uv.array.slice(index * 4, index * 4 + 4)),
    map: basic(run.material).map,
  }))
}

/** Every instance the frame's runs carry, in draw order (run renderOrder, then index). */
export function instances(game: Game): InstanceRecord[] {
  return [...runMeshes(game)].sort((a, b) => a.renderOrder - b.renderOrder).flatMap(runRecords)
}

/** A Float32 view of what three would upload as the mesh's modelViewMatrix. */
function modelView(game: Game, mesh: THREE.Object3D): number[] {
  const matrix = new THREE.Matrix4().multiplyMatrices(game.camera.matrixWorldInverse, mesh.matrixWorld)
  return Array.from(new Float32Array(matrix.elements))
}

/** What the per-sprite mesh draws, in the same Float32 terms as an instance. */
export function meshRecord(game: Game, mesh: BasicMesh): Omit<InstanceRecord, 'map'> {
  const map = mesh.material.map
  return {
    matrix: modelView(game, mesh),
    color: mesh.material.color.toArray().map(Math.fround),
    uv: map ? [map.repeat.x, map.repeat.y, map.offset.x, map.offset.y].map(Math.fround) : [1, 1, 0, 0],
  }
}

/** The nearest ancestor Group's renderOrder: three's `groupOrder` for an object. */
function groupOrderOf(object: THREE.Object3D): number {
  for (let parent = object.parent; parent; parent = parent.parent) {
    if ((parent as Partial<THREE.Group>).isGroup === true) return parent.renderOrder
  }
  return 0
}

/** Clip-space z of the object's bounding-sphere center, the depth three sorts transparent objects by. */
function clipZ(game: Game, object: AnyMesh): number {
  const own = object as { boundingSphere?: THREE.Sphere | null }
  if (object.geometry.boundingSphere === null) object.geometry.computeBoundingSphere()
  const center = (own.boundingSphere ?? object.geometry.boundingSphere)?.center ?? new THREE.Vector3()
  const projScreen = new THREE.Matrix4().multiplyMatrices(game.camera.projectionMatrix, game.camera.matrixWorldInverse)
  return new THREE.Vector4(center.x, center.y, center.z, 1).applyMatrix4(object.matrixWorld).applyMatrix4(projScreen).z
}

/**
 * The order three would draw the scene's drawn transparent meshes in, by its
 * documented transparent sort (groupOrder, renderOrder, farther z first, id),
 * read at the moment of the render. Labels name what each mesh draws.
 */
export function transparentDrawOrder(game: Game, label: (mesh: AnyMesh) => string): string[] {
  game.scene.updateMatrixWorld()
  game.camera.updateMatrixWorld()
  const keyed = drawnMeshes(game)
    .filter((mesh) => (Array.isArray(mesh.material) ? mesh.material : [mesh.material]).some((m) => m.transparent))
    .map((mesh) => ({ mesh, groupOrder: groupOrderOf(mesh), renderOrder: mesh.renderOrder, z: clipZ(game, mesh), id: mesh.id }))
  keyed.sort((a, b) =>
    a.groupOrder !== b.groupOrder ? a.groupOrder - b.groupOrder
      : a.renderOrder !== b.renderOrder ? a.renderOrder - b.renderOrder
        : a.z !== b.z ? b.z - a.z : a.id - b.id,
  )
  return keyed.flatMap(({ mesh }) => label(mesh).split(','))
}
