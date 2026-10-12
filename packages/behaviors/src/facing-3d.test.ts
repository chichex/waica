import { THREE } from '@waica/engine'
import { describe, expect, it } from 'vitest'
import { turnYawToward } from './facing-3d'

const DT = 1 / 60
const degrees = (radians: number): number => (radians * 180) / Math.PI
/** A yaw folded into (-180, 180], so a turn through ±180° is compared where it lands. */
const wrapped = (radians: number): number => degrees(Math.atan2(Math.sin(radians), Math.cos(radians)))

/** A node facing the given yaw in degrees. */
function facing(yawDegrees: number): THREE.Object3D {
  const node = new THREE.Object3D()
  node.rotation.y = (yawDegrees * Math.PI) / 180
  return node
}

describe('turnYawToward (issue #166 CA-13)', () => {
  it('turns from 0 toward +x at 180°/s: 45° after 15 steps, 90° after 30', () => {
    const node = facing(0)
    for (let step = 0; step < 15; step += 1) turnYawToward(node, 1, 0, 180, DT)
    expect(Math.abs(degrees(node.rotation.y) - 45)).toBeLessThan(1e-6)
    for (let step = 0; step < 15; step += 1) turnYawToward(node, 1, 0, 180, DT)
    expect(Math.abs(degrees(node.rotation.y) - 90)).toBeLessThan(1e-6)
    // Already there: another step changes nothing.
    turnYawToward(node, 1, 0, 180, DT)
    expect(Math.abs(degrees(node.rotation.y) - 90)).toBeLessThan(1e-6)
  })

  it('crosses ±180° the short way: from 170° toward -170° it passes through 180°, not back through 0', () => {
    const node = facing(170)
    const target = (-170 * Math.PI) / 180
    for (let step = 0; step < 5; step += 1) turnYawToward(node, Math.sin(target), Math.cos(target), 180, DT)
    // Five steps of 3°: 185°, which is -175° folded.
    expect(Math.abs(wrapped(node.rotation.y) - -175)).toBeLessThan(1e-6)
    for (let step = 0; step < 5; step += 1) turnYawToward(node, Math.sin(target), Math.cos(target), 180, DT)
    expect(Math.abs(wrapped(node.rotation.y) - -170)).toBeLessThan(1e-6)
  })

  it('snaps in one call with turnSpeed 0', () => {
    const node = facing(0)
    turnYawToward(node, -1, 0, 0, DT)
    expect(Math.abs(degrees(node.rotation.y) - -90)).toBeLessThan(1e-6)
  })

  it('faces where it walks: +z (a glTF front) is yaw 0, -z is 180°', () => {
    const forward = facing(37)
    turnYawToward(forward, 0, 1, 0, DT)
    expect(Math.abs(wrapped(forward.rotation.y))).toBeLessThan(1e-6)
    const back = facing(0)
    turnYawToward(back, 0, -1, 0, DT)
    expect(Math.abs(Math.abs(wrapped(back.rotation.y)) - 180)).toBeLessThan(1e-6)
  })

  it('changes nothing for a zero direction', () => {
    const node = facing(42)
    turnYawToward(node, 0, 0, 180, DT)
    expect(wrapped(node.rotation.y)).toBeCloseTo(42, 9)
  })
})
