import * as THREE from 'three/webgpu'
import {
  isCameraVelocityProvider,
  resolveSceneCamera,
  stepSceneCamera,
  type CameraVelocityProvider,
  type ResolvedSceneCamera,
  type SceneCameraJson,
} from './camera.js'
import type { GameCamera } from './camera-projection.js'
import type { Component } from './component.js'
import type { Entity } from './entity.js'
import { EMISSIVE_LAYER } from './render-layers.js'
import { placePerspectiveCamera, resolvePerspectiveCamera, type PerspectiveSceneCameraJson } from './scene-camera-3d.js'
import type { SceneSpace } from './scene-space.js'

/** What following an entity needs from the Game: the scene's entities and its render projection. */
export interface CameraFollowHost {
  find(name: string): Entity | undefined
  /** A logical point in render space (the isometric projection, when the scene has one). */
  renderPoint(x: number, y: number): { x: number; y: number }
  /** The visible world height, i.e. the orthographic zoom. */
  readonly viewHeight: number
}

/**
 * The Game's cameras. The orthographic one is built with the Game and frames
 * every 2D scene; a 3D scene swaps in a perspective one (built on first use).
 * `camera` is whichever the loaded scene uses (ADR 0027).
 */
export class CameraRig {
  readonly orthographic = new THREE.OrthographicCamera()
  private perspective: THREE.PerspectiveCamera | null = null
  private current: GameCamera = this.orthographic
  private aspect = 1
  /** How far the perspective camera's declared target was from its declared position. */
  private distance = 1

  constructor() {
    this.orthographic.position.z = 10
    // Emissive drawables sit on their own layer; an unlit frame draws it in place.
    this.orthographic.layers.enable(EMISSIVE_LAYER)
  }

  get camera(): GameCamera {
    return this.current
  }

  /** The distance from the perspective camera to the point it was aimed at; a snapshot reports its target from it. */
  get lookDistance(): number {
    return this.distance
  }

  /**
   * Adopts a scene's camera block for its space: a 3D scene gets the
   * perspective camera (the block's, or the defaults), a 2D scene the
   * orthographic one. Returns the orthographic block resolved, for follow
   * and zoom; null when the host keeps control (no block, or a block of the
   * wrong kind for the space, which `validate_project` reports).
   */
  adopt(json: SceneCameraJson | undefined, space: SceneSpace): ResolvedSceneCamera | null {
    if (space === '3d') {
      this.useBlock(json?.kind === 'perspective' ? json : undefined)
      return null
    }
    this.current = this.orthographic
    if (!json || json.kind === 'perspective') return null
    return resolveSceneCamera(json)
  }

  /** Back to the orthographic camera, as a Game with no scene has it. */
  reset(): void {
    this.current = this.orthographic
  }

  /** Fits both cameras to the letterboxed view: the orthographic frame from `viewHeight`, the perspective aspect. */
  fit(aspect: number, viewHeight: number): void {
    this.aspect = aspect
    const halfH = viewHeight / 2
    const halfW = halfH * aspect
    const camera = this.orthographic
    camera.left = -halfW
    camera.right = halfW
    camera.top = halfH
    camera.bottom = -halfH
    camera.updateProjectionMatrix()
    if (!this.perspective) return
    this.perspective.aspect = aspect
    this.perspective.updateProjectionMatrix()
  }

  /** One Simulation Step of the orthographic follow camera (deadzone, lookahead, smoothing, limits). */
  follow(cam: ResolvedSceneCamera, host: CameraFollowHost, dt: number): void {
    const camera = this.orthographic
    const followed = cam.follow ? host.find(cam.follow) : undefined
    const provider = followed?.components.find(
      (c): c is Component & CameraVelocityProvider => isCameraVelocityProvider(c),
    )
    const velocity = provider?.getCameraVelocity()
    const target = followed ? host.renderPoint(followed.position.x, followed.position.y) : null
    const renderVelocity = velocity ? host.renderPoint(velocity.vx, velocity.vy) : { x: 0, y: 0 }
    const next = stepSceneCamera(cam, {
      x: camera.position.x,
      y: camera.position.y,
      halfW: (camera.right - camera.left) / 2,
      halfH: host.viewHeight / 2,
      target,
      vx: renderVelocity.x,
      vy: renderVelocity.y,
      dt,
    })
    camera.position.x = next.x
    camera.position.y = next.y
  }

  private useBlock(json: PerspectiveSceneCameraJson | undefined): void {
    this.perspective ??= new THREE.PerspectiveCamera()
    const resolved = resolvePerspectiveCamera(json)
    placePerspectiveCamera(this.perspective, resolved, this.aspect)
    this.distance = new THREE.Vector3(...resolved.position).distanceTo(new THREE.Vector3(...resolved.target)) || 1
    this.current = this.perspective
  }
}
