// @vitest-environment happy-dom
import { vec4 } from 'three/tsl'
import * as THREE from 'three/webgpu'
import { expect, it } from 'vitest'
import { canvasBackground, drawLikeCanvas, drawStraightToCanvas, mapUvPerVertex } from './render-output'

type OutputContext = { getOutput?: (output: THREE.Node, builder: { renderer: { getRenderTarget(): unknown } }) => THREE.Node }

function outputContext(renderer: THREE.WebGPURenderer): OutputContext {
  return renderer.contextNode.value as OutputContext
}

it('draws straight to the canvas, with no intermediate linear target or output pass (WebGLRenderer parity)', () => {
  const renderer = new THREE.WebGPURenderer({ canvas: document.createElement('canvas') })
  expect(renderer.needsFrameBufferTarget).toBe(true)

  drawStraightToCanvas(renderer)

  expect(renderer.needsFrameBufferTarget).toBe(false)
})

it('encodes every material output to sRGB on the canvas, and leaves a render target linear', () => {
  const renderer = new THREE.WebGPURenderer({ canvas: document.createElement('canvas') })
  drawStraightToCanvas(renderer)
  const getOutput = outputContext(renderer).getOutput
  if (!getOutput) throw new Error('no getOutput in the renderer context')
  const color = vec4(0.5, 0.5, 0.5, 1)

  const onCanvas = getOutput(color, { renderer: { getRenderTarget: () => null } }) as THREE.Node & { colorNode?: unknown; target?: string }
  expect(onCanvas.type).toBe('ColorSpaceNode')
  expect(onCanvas.colorNode).toBe(color)
  expect(onCanvas.target).toBe(THREE.SRGBColorSpace)
  expect(getOutput(color, { renderer: { getRenderTarget: () => ({}) } })).toBe(color)
})

it('encodes to sRGB into a render target that draws like the canvas: a Post Effect frame (issue #78)', () => {
  const renderer = new THREE.WebGPURenderer({ canvas: document.createElement('canvas') })
  drawStraightToCanvas(renderer)
  const getOutput = outputContext(renderer).getOutput
  if (!getOutput) throw new Error('no getOutput in the renderer context')
  const color = vec4(0.5, 0.5, 0.5, 1)
  const frame = new THREE.RenderTarget(4, 4)
  drawLikeCanvas(frame)

  const intoFrame = getOutput(color, { renderer: { getRenderTarget: () => frame } }) as THREE.Node & { target?: string }
  expect(intoFrame.type).toBe('ColorSpaceNode')
  expect(intoFrame.target).toBe(THREE.SRGBColorSpace)
  expect(getOutput(color, { renderer: { getRenderTarget: () => new THREE.RenderTarget(4, 4) } })).toBe(color)
})

it('clears with the background as the canvas stores it: the sRGB-encoded bytes', () => {
  const background = canvasBackground(0x1a1a2e)
  const byte = (channel: number): number => Math.round(channel * 255)

  expect([byte(background.r), byte(background.g), byte(background.b)]).toEqual([0x1a, 0x1a, 0x2e])
  // The plain linear components would clear far darker (0x1a → 3 of 255).
  expect(byte(new THREE.Color(0x1a1a2e).r)).toBe(3)
})

type UvContext = { getUV?: (texture: unknown, builder: unknown) => unknown }

it('transforms a material map UV per vertex, as WebGLRenderer did, instead of per fragment', () => {
  const renderer = new THREE.WebGPURenderer({ canvas: document.createElement('canvas') })
  mapUvPerVertex(renderer)
  const getUV = (renderer.contextNode.value as UvContext).getUV
  if (!getUV) throw new Error('no getUV in the renderer context')
  const map = new THREE.TextureNode(new THREE.Texture())
  const mesh = { object: new THREE.Mesh() }

  const uvNode = getUV(map, mesh) as THREE.Node

  expect(uvNode.type).toBe('VaryingNode')
  // The fragment no longer applies the texture matrix on top.
  expect(map.updateMatrix).toBe(false)
})

it('leaves a texture with its own UV, or one sampled outside a mesh, to three', () => {
  const renderer = new THREE.WebGPURenderer({ canvas: document.createElement('canvas') })
  mapUvPerVertex(renderer)
  const getUV = (renderer.contextNode.value as UvContext).getUV
  if (!getUV) throw new Error('no getUV in the renderer context')
  const quad = new THREE.TextureNode(new THREE.Texture())

  expect(getUV(quad, { object: new THREE.Object3D() })).toBeNull()
  expect(quad.updateMatrix).toBe(true)
})
