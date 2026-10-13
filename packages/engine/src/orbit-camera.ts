import type * as THREE from 'three/webgpu'
import type { Entity } from './entity.js'
import type { Input } from './input.js'
import type { ResolvedOrbit } from './scene-camera-orbit.js'

/** How far in front of what blocks the view the camera stops, and how close to the look point it may come (CA-9). */
export const ORBIT_COLLISION_MARGIN = 0.2
export const ORBIT_MIN_DISTANCE = 0.5
/** World units of distance per CSS pixel of wheel (one ~100 px notch is one unit). */
export const ORBIT_WHEEL_ZOOM = 0.01

const RAD = Math.PI / 180

/** A point or direction in world space. */
export interface OrbitPoint {
  x: number
  y: number
  z: number
}

/** The ray from the look point toward the camera, which skips the followed entity's own colliders. */
export interface OrbitRay {
  origin: OrbitPoint
  direction: OrbitPoint
  maxDistance: number
  exclude: Entity
}

/** What orbiting reads from the Game each Simulation Step. */
export interface OrbitHost {
  find(name: string): Entity | undefined
  input(): Input
  /** The distance to the first solid collider along the ray (sensors never block it); null when nothing is hit. */
  rayDistance(ray: OrbitRay): number | null
}

/** The orbit's state as the Runtime Snapshot's `view` reports it (CA-10). */
export interface OrbitView {
  follow: string
  yaw: number
  pitch: number
  distance: number
  distanceActual: number
}

const clamp = (value: number, low: number, high: number): number => Math.min(Math.max(value, low), high)

/**
 * A perspective camera orbiting a followed entity (issue #181, ADR 0031): the
 * locked mouse, the orbit Actions and the wheel turn and zoom it once per
 * Simulation Step, and a ray from the look point pulls it in front of a wall
 * without changing the chosen distance. With no input the orbit holds.
 */
export class OrbitCamera {
  yaw: number
  pitch: number
  /** The chosen distance: the wheel's, clamped to [minDistance, maxDistance]. */
  distance: number
  /** Where the camera actually sits: the chosen distance, or less in front of a wall. */
  distanceActual: number

  constructor(readonly settings: ResolvedOrbit) {
    this.yaw = settings.yaw
    this.pitch = clamp(settings.pitch, settings.minPitch, settings.maxPitch)
    this.distance = clamp(settings.distance, settings.minDistance, settings.maxDistance)
    this.distanceActual = this.distance
  }

  /** One Simulation Step: turn and zoom by this step's input, then place `camera`. No followed entity: nothing moves. */
  step(camera: THREE.PerspectiveCamera, host: OrbitHost, dt: number): void {
    const followed = host.find(this.settings.follow)
    if (!followed) return
    this.turn(host.input(), dt)
    this.distance = clamp(
      this.distance + host.input().wheelDelta() * ORBIT_WHEEL_ZOOM,
      this.settings.minDistance,
      this.settings.maxDistance,
    )
    const look = this.lookPoint(followed)
    const away = this.awayFromLook()
    const hit = host.rayDistance({ origin: look, direction: away, maxDistance: this.distance, exclude: followed })
    this.distanceActual =
      hit === null ? this.distance : Math.min(this.distance, Math.max(hit - ORBIT_COLLISION_MARGIN, ORBIT_MIN_DISTANCE))
    camera.position.set(
      look.x + away.x * this.distanceActual,
      look.y + away.y * this.distanceActual,
      look.z + away.z * this.distanceActual,
    )
    camera.lookAt(look.x, look.y, look.z)
    camera.updateMatrixWorld()
  }

  /** The orbit for the Runtime Snapshot's view. */
  view(): OrbitView {
    const { yaw, pitch, distance, distanceActual } = this
    return { follow: this.settings.follow, yaw, pitch, distance, distanceActual }
  }

  /** The step's locked mouse movement times `sensitivity`, plus the orbit Actions at `orbitSpeed`; pitch clamped. */
  private turn(input: Input, dt: number): void {
    const { sensitivity, orbitSpeed, invertY, minPitch, maxPitch } = this.settings
    const mouse = input.mouseMovement()
    const actions = this.actionTurn(input)
    this.yaw += mouse.x * sensitivity + actions.yaw * orbitSpeed * dt
    const mousePitch = (invertY ? -mouse.y : mouse.y) * sensitivity
    this.pitch = clamp(this.pitch + mousePitch + actions.pitch * orbitSpeed * dt, minPitch, maxPitch)
  }

  /** The orbit Actions as -1..1 turns: right minus left for yaw, down minus up for pitch. */
  private actionTurn(input: Input): { yaw: number; pitch: number } {
    const { orbitLeftAction, orbitRightAction, orbitUpAction, orbitDownAction } = this.settings
    return {
      yaw: input.value(orbitRightAction) - input.value(orbitLeftAction),
      pitch: input.value(orbitDownAction) - input.value(orbitUpAction),
    }
  }

  private lookPoint(followed: Entity): OrbitPoint {
    const { x, y, z } = followed.position
    return { x, y: y + this.settings.lookHeight, z }
  }

  /** The unit direction from the look point to the camera: yaw 0 puts it on +z, yaw 90 on -x. */
  private awayFromLook(): OrbitPoint {
    const yaw = this.yaw * RAD
    const pitch = this.pitch * RAD
    return { x: -Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: Math.cos(yaw) * Math.cos(pitch) }
  }
}
