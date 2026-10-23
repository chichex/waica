import { expect, it } from 'vitest'
import * as THREE from 'three/webgpu'
import { float } from 'three/tsl'
import { createRangedPointShadow } from './point-shadow.js'

function installedShadowNode(light: THREE.PointLight): THREE.PointShadowNode {
  const shadow = light.shadow
  if (!('shadowNode' in shadow) || !(shadow.shadowNode instanceof THREE.PointShadowNode)) {
    throw new Error('Expected a point shadow node installed through the public light shadow hook')
  }
  return shadow.shadowNode
}

it('keeps a finite shadow camera independent of a nine-unit luminous distance', () => {
  const light = new THREE.PointLight(0xffcc88, 7, 9, 1.5)
  const adapter = createRangedPointShadow(light)
  adapter.sync(2)

  expect(light.shadow.camera.near).toBe(0.02)
  expect(light.shadow.camera.far).toBe(2)
  expect(light.distance).toBe(9)
  expect(light.intensity).toBe(7)
  expect(light.decay).toBe(1.5)
  expect(light.color.getHex()).toBe(0xffcc88)
  const shadowLight = installedShadowNode(light).light
  expect(shadowLight).not.toBe(light)
  expect(shadowLight).toBeInstanceOf(THREE.PointLight)
  expect(shadowLight).toHaveProperty('distance', 0)
  expect(shadowLight.parent).toBeNull()
  adapter.dispose()
})

it('keeps shadow-only uniforms on the cubemap update path instead of target-based light matrices', () => {
  const light = new THREE.PointLight(0xffffff, 7, 9)
  const adapter = createRangedPointShadow(light)
  adapter.sync(2)

  expect(installedShadowNode(light).light.castShadow).toBe(true)

  adapter.dispose()
})

it('follows a rotated and scaled parent and the latest local offset before render', () => {
  const parent = new THREE.Group()
  parent.position.set(10, 20, 30)
  parent.rotation.y = Math.PI / 2
  parent.scale.set(2, 3, 4)
  const light = new THREE.PointLight()
  light.position.set(1, 2, 3)
  parent.add(light)
  const adapter = createRangedPointShadow(light)
  adapter.sync(2)
  const proxy = installedShadowNode(light).light

  expect(proxy.getWorldPosition(new THREE.Vector3()).toArray()).toEqual([
    expect.closeTo(22), expect.closeTo(26), expect.closeTo(28),
  ])
  parent.position.set(100, 200, 300)
  light.position.set(2, 1, 1)
  adapter.sync(2)
  expect(proxy.getWorldPosition(new THREE.Vector3()).toArray()).toEqual([
    expect.closeTo(104), expect.closeTo(203), expect.closeTo(296),
  ])
  expect(parent.children).toEqual([light])
  adapter.dispose()
})

it('installs a world-space range filter without replacing the stock point shadow node', () => {
  const light = new THREE.PointLight(0xffffff, 7, 9)
  const adapter = createRangedPointShadow(light)
  adapter.sync(2)

  expect(light.shadow).toHaveProperty('filterNode', expect.any(Function))
  expect(installedShadowNode(light)).toBeInstanceOf(THREE.PointShadowNode)
  expect(light.shadow.camera.fov).toBe(90)
  expect(light.shadow.camera.aspect).toBe(1)
  adapter.dispose()
})

it('shares the live shadow matrix and settings with the shadow-only light', () => {
  const light = new THREE.PointLight()
  const adapter = createRangedPointShadow(light)
  adapter.sync(2)
  const proxy = installedShadowNode(light).light
  if (!(proxy instanceof THREE.PointLight)) throw new Error('Expected a shadow-only point light')

  expect(proxy.shadow).toBe(light.shadow)
  light.shadow.bias = -0.01
  light.shadow.normalBias = 0.03
  light.shadow.radius = 3
  light.shadow.matrix.makeTranslation(-5, -6, -7)
  expect(proxy.shadow.bias).toBe(-0.01)
  expect(proxy.shadow.normalBias).toBe(0.03)
  expect(proxy.shadow.radius).toBe(3)
  expect(proxy.shadow.matrix).toBe(light.shadow.matrix)
  adapter.dispose()
})

it('restores pre-existing public shadow hooks when disposed', () => {
  const light = new THREE.PointLight()
  const originalNode = new THREE.PointShadowNode(light, light.shadow)
  const originalFilter = () => float(1)
  const hooks = Object.assign(light.shadow, { shadowNode: originalNode, filterNode: originalFilter })
  const adapter = createRangedPointShadow(light)
  adapter.sync(2)
  expect(hooks.shadowNode).not.toBe(originalNode)
  expect(hooks.filterNode).not.toBe(originalFilter)

  adapter.dispose()

  expect(hooks.shadowNode).toBe(originalNode)
  expect(hooks.filterNode).toBe(originalFilter)
  originalNode.dispose()
})

it('applies the latest light and shadow distances without replacing live hooks', () => {
  const light = new THREE.PointLight(0xffffff, 7, 9)
  const adapter = createRangedPointShadow(light)
  adapter.sync(2)
  const node = installedShadowNode(light)
  const filter = 'filterNode' in light.shadow ? light.shadow.filterNode : undefined

  light.distance = 1.25
  adapter.sync(40)
  expect(light.shadow.camera.far).toBe(1.25)
  expect(light.shadow.camera.near).toBe(0.0125)
  light.distance = 0
  adapter.sync(40)
  expect(light.shadow.camera.far).toBe(40)
  expect(light.shadow.camera.near).toBe(0.1)
  expect(installedShadowNode(light)).toBe(node)
  expect(light.shadow).toHaveProperty('filterNode', filter)
  expect(light.distance).toBe(0)
  expect(light.intensity).toBe(7)
  adapter.dispose()
})

it.each([
  { distance: 0, maxDistance: 0.01, near: 0.0001, far: 0.01 },
  { distance: 0, maxDistance: 1000, near: 0.1, far: 1000 },
  { distance: 0.005, maxDistance: 2, near: 0.00005, far: 0.005 },
])('keeps projection matrices finite for light distance $distance and range $maxDistance', (sample) => {
  const light = new THREE.PointLight(0xffffff, 1, sample.distance)
  const adapter = createRangedPointShadow(light)
  adapter.sync(sample.maxDistance)

  expect(light.shadow.camera.near).toBe(sample.near)
  expect(light.shadow.camera.far).toBe(sample.far)
  expect(light.shadow.camera.projectionMatrix.elements.every(Number.isFinite)).toBe(true)
  expect(light.shadow.camera.projectionMatrixInverse.elements.every(Number.isFinite)).toBe(true)
  adapter.dispose()
})

it('releases real node shadow materials across ten disable and re-enable cycles', () => {
  const light = new THREE.PointLight()
  const nodes = new Set<THREE.PointShadowNode>()
  let materialDisposals = 0
  for (let cycle = 0; cycle < 10; cycle++) {
    const adapter = createRangedPointShadow(light)
    adapter.sync(2)
    const node = installedShadowNode(light)
    nodes.add(node)
    node.getShadowMaterial().addEventListener('dispose', () => { materialDisposals++ })

    adapter.dispose()
    adapter.dispose()
    // The renderer's AnalyticLightNode may also dispose its cached node.
    node.dispose()

    expect(materialDisposals).toBe(cycle + 1)
    expect(light.shadow.shadowNode).toBeUndefined()
    expect(light.shadow).toHaveProperty('filterNode', undefined)
  }
  expect(nodes.size).toBe(10)
})

it('ignores synchronization after disposal and leaves later hook replacements alone', () => {
  const light = new THREE.PointLight()
  const adapter = createRangedPointShadow(light)
  adapter.sync(2)
  const replacement = new THREE.PointShadowNode(light, light.shadow)
  const replacementFilter = () => float(1)
  const hooks = Object.assign(light.shadow, { shadowNode: replacement, filterNode: replacementFilter })

  adapter.dispose()
  light.position.set(5, 6, 7)
  adapter.sync(100)

  expect(hooks.shadowNode).toBe(replacement)
  expect(hooks.filterNode).toBe(replacementFilter)
  expect(light.shadow.camera.far).toBe(2)
  replacement.dispose()
})
