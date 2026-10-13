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
import { OrbitCamera, type OrbitHost, type OrbitView } from './orbit-camera.js'
import { EMISSIVE_LAYER } from './render-layers.js'
import { placePerspectiveCamera, resolvePerspectiveCamera, type PerspectiveSceneCameraJson } from './scene-camera-3d.js'
import type { SceneSpace } from './scene-space.js'

/** What following an entity needs from the Game: the scene's entities and its render projection, and the orbit's input and ray (OrbitHost). */
export interface CameraFollowHost extends OrbitHost {
  find(name: string): Entity | undefined
  /** A logical point in render space (the isometric projection, when the scene has one). */
  renderPoint(x: number, y: number): { x: number; y: number }
  /** The visible world height, i.e. the orthographic zoom, as it is when called. */
  viewHeight(): number
}

/**
 * The Game's cameras. The orthographic one is built with the Game and frames
 * every 2D scene; a 3D scene swaps in a perspective one (built on first use).
 * `sceneCamera` is whichever the loaded scene uses (ADR 0027); `camera` is
 * that one, or the host's view camera over a 3D scene while one is set.
 */
export class CameraRig {
  readonly orthographic = new THREE.OrthographicCamera()
  private perspective: THREE.PerspectiveCamera | null = null
  private current: GameCamera = this.orthographic
  /** A host-owned camera drawn through instead of the scene's (the editor's, issue #173). */
  private view: THREE.PerspectiveCamera | null = null
  /** Set once the 2D-scene warning of setViewCamera was logged. */
  private warnedFlatView = false
  private aspect = 1
  /** How far the perspective camera's look point is: the declared target's distance, or the orbit's placed distance. */
  private distance = 1
  /** The orbit of a perspective block that follows an entity (issue #181); null for a fixed camera or a 2D scene. */
  private orbit: OrbitCamera | null = null

  constructor() {
    this.orthographic.position.z = 10
    // Emissive drawables sit on their own layer; an unlit frame draws it in place.
    this.orthographic.layers.enable(EMISSIVE_LAYER)
  }

  /**
   * The camera the frame draws, the Pointer picks and `worldToScreen`
   * projects through: the view camera over a 3D scene while one is set,
   * else the scene camera.
   */
  get camera(): GameCamera {
    return this.view && this.current === this.perspective ? this.view : this.current
  }

  /** The camera placed from the scene's JSON, whatever view camera is set; `adopt` keeps updating it. */
  get sceneCamera(): GameCamera {
    return this.current
  }

  /**
   * Draws a 3D scene through `camera` instead of the scene camera, until
   * cleared with null (issue #173 CA-1): the editor's own camera, which game
   * code never sees because the editor's Game does not simulate. The rig fits
   * its aspect to the view and lets it see the Emissive layer, as it does the
   * scene camera. Over a 2D scene (or none yet) it has no effect and warns
   * once; the camera is still kept, so it takes over when a 3D scene loads.
   */
  setViewCamera(camera: THREE.PerspectiveCamera | null): void {
    if (camera && this.current !== this.perspective && !this.warnedFlatView) {
      console.warn('[waica] setViewCamera has no effect over a 2D scene or none: its camera is orthographic')
      this.warnedFlatView = true
    }
    this.view = camera
    if (!camera) return
    camera.layers.enable(EMISSIVE_LAYER)
    camera.aspect = this.aspect
    camera.updateProjectionMatrix()
  }

  /** The distance from the perspective camera to the point it was aimed at; a snapshot reports its target from it. */
  get lookDistance(): number {
    return this.distance
  }

  /** True while the scene's perspective camera orbits a followed entity. */
  get orbiting(): boolean {
    return this.orbit !== null && this.current === this.perspective
  }

  /** The orbit's yaw, pitch and distances for the Runtime Snapshot; null for any other camera. */
  get orbitView(): OrbitView | null {
    return this.orbiting && this.orbit ? this.orbit.view() : null
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
    this.orbit = null
    if (!json || json.kind === 'perspective') return null
    return resolveSceneCamera(json)
  }

  /** Back to the orthographic camera, as a Game with no scene has it. */
  reset(): void {
    this.current = this.orthographic
    this.orbit = null
  }

  /**
   * One Simulation Step of the scene camera: the orbit of a following
   * perspective camera (issue #181), else the orthographic follow of `cam`.
   */
  step(cam: ResolvedSceneCamera | null, host: CameraFollowHost, dt: number): void {
    if (this.orbit && this.perspective && this.current === this.perspective) {
      this.orbit.step(this.perspective, host, dt)
      this.distance = this.orbit.distanceActual
      return
    }
    if (cam) this.follow(cam, host, dt)
  }

  /**
   * Moves the scene camera by a Camera Effects shake `offset` for one draw
   * and returns how to put it back (ADR 0020). The orthographic camera moves
   * by the offset; a perspective one (issue #181 CA-11) along its own right
   * and up, scaled so the look point's image moves as far on screen as it
   * would under an orthographic camera `viewHeight` tall.
   */
  shake(offset: { x: number; y: number }, viewHeight: number): () => void {
    const camera = this.current === this.perspective ? this.perspective : null
    if (!camera) {
      const flat = this.orthographic
      const { x, y } = flat.position
      flat.position.x = x + offset.x
      flat.position.y = y + offset.y
      return () => {
        flat.position.x = x
        flat.position.y = y
      }
    }
    const base = camera.position.clone()
    camera.updateMatrixWorld()
    const perUnit = (2 * this.distance * Math.tan((camera.fov * Math.PI) / 360)) / viewHeight
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0)
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1)
    camera.position.addScaledVector(right, offset.x * perUnit).addScaledVector(up, offset.y * perUnit)
    camera.updateMatrixWorld()
    return () => {
      camera.position.copy(base)
      camera.updateMatrixWorld()
    }
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
    for (const lens of [this.perspective, this.view]) {
      if (!lens) continue
      lens.aspect = aspect
      lens.updateProjectionMatrix()
    }
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
      halfH: host.viewHeight() / 2,
      target,
      vx: renderVelocity.x,
      vy: renderVelocity.y,
      dt,
    })
    camera.position.x = next.x
    camera.position.y = next.y
  }

  private useBlock(json: PerspectiveSceneCameraJson | undefined): void {
    if (!this.perspective) {
      this.perspective = new THREE.PerspectiveCamera()
      // A 3D scene is never lit, so an Emissive drawable is drawn in place on the camera's own layers.
      this.perspective.layers.enable(EMISSIVE_LAYER)
    }
    const resolved = resolvePerspectiveCamera(json)
    placePerspectiveCamera(this.perspective, resolved, this.aspect)
    this.distance = new THREE.Vector3(...resolved.position).distanceTo(new THREE.Vector3(...resolved.target)) || 1
    this.orbit = resolved.orbit ? new OrbitCamera(resolved.orbit) : null
    this.current = this.perspective
  }
}
