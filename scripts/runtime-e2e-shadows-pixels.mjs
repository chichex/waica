import assert from 'node:assert/strict'
import { CANVAS } from './runtime-e2e-shadows-fixtures.mjs'

export async function projectPoints(view, points) {
  const { THREE, placePerspectiveCamera, resolvePerspectiveCamera, worldToNormalized } = await import('../packages/engine/dist/index.js')
  const camera = new THREE.PerspectiveCamera()
  const lens = resolvePerspectiveCamera({ kind: 'perspective', position: view.position, target: view.target, fov: view.fov })
  placePerspectiveCamera(camera, lens, CANVAS.width / CANVAS.height)
  return Object.fromEntries(Object.entries(points).map(([name, [x, y, z]]) => {
    const at = worldToNormalized(camera, { x, y, z })
    assert.ok(at, `${name} must be in front of the camera`)
    const pixel = { x: Math.round(at.nx * CANVAS.width), y: Math.round(at.ny * CANVAS.height) }
    assert.ok(pixel.x >= 2 && pixel.x < CANVAS.width - 2 && pixel.y >= 2 && pixel.y < CANVAS.height - 2, `${name} ROI must fit the canvas: ${JSON.stringify(pixel)}`)
    return [name, pixel]
  }))
}

// Serialized into the PNG-decoding page. Each ROI is 5x5, not a lone edge pixel.
export async function receiverSamples({ image, points }) {
  const { data, width } = await globalThis.decodePng(image)
  return Object.fromEntries(Object.entries(points).map(([name, centre]) => {
    const rgb = [0, 0, 0]
    for (let dy = -2; dy <= 2; dy += 1) {
      for (let dx = -2; dx <= 2; dx += 1) {
        const index = ((centre.y + dy) * width + centre.x + dx) * 4
        for (let channel = 0; channel < 3; channel += 1) rgb[channel] += data[index + channel] / 25
      }
    }
    return [name, { ...centre, rgb, brightness: rgb.reduce((sum, value) => sum + value, 0) / 3 }]
  }))
}

export function assertReceiverPair(on, off, name = 'shadow') {
  const darkening = off.samples[name].brightness - on.samples[name].brightness
  const controlDelta = off.samples.control.brightness - on.samples.control.brightness
  assert.ok(darkening >= 20, `${on.variant}/${name}: shadow must darken the receiver >=20; ${JSON.stringify({ darkening, on: on.samples, off: off.samples })}`)
  assert.ok(Math.abs(controlDelta) <= 5, `${on.variant}: illuminated control must stay within 5; ${JSON.stringify({ controlDelta, on: on.samples, off: off.samples })}`)
  assert.ok(off.samples.control.brightness >= 80, `${on.variant}: control must be visibly illuminated`)
  return { darkening, controlDelta, on: on.samples, off: off.samples, frame: on.frame, screenshots: [on.filename, off.filename] }
}

export function assertUnshadowed(on, off, name = 'shadow') {
  const delta = off.samples[name].brightness - on.samples[name].brightness
  assert.ok(Math.abs(delta) <= 5, `${on.variant}/${name}: disabled shadow must match Off within 5; ${JSON.stringify({ delta, on: on.samples, off: off.samples })}`)
  return delta
}
