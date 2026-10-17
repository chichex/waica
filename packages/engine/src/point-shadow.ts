import * as THREE from 'three/webgpu'
import { float, Fn, PointShadowFilter, positionWorld, uniform } from 'three/tsl'

export interface RangedPointShadow {
  /** Call before rendering, with the resolved finite, positive shadow range. */
  sync(maxDistance: number): void
  /** The owner must also notify the renderer's light node with light.dispose(). */
  dispose(): void
}

type PointShadowFilterCallback = (inputs: Parameters<typeof PointShadowFilter>[0]) => THREE.Node

function installShadowHooks(
  shadow: THREE.PointLightShadow,
  node: THREE.PointShadowNode,
  filterNode: PointShadowFilterCallback,
): () => void {
  const previousNode = shadow.shadowNode
  const previousFilter = 'filterNode' in shadow ? shadow.filterNode : undefined
  // Public WebGPURenderer filterNode hook, missing in @types/three 0.186.
  const hooks = Object.assign(shadow, { shadowNode: node, filterNode })
  return () => {
    if (hooks.shadowNode === node) shadow.shadowNode = previousNode
    if (hooks.filterNode === filterNode) Object.assign(hooks, { filterNode: previousFilter })
  }
}

/**
 * Keeps the shadow camera independent of the real light's attenuation.
 * The unparented proxy is never added to the scene and cannot illuminate it.
 * Three's stock node still renders all six faces and its stock PCF does the
 * filtering; the extra TSL gate clips receivers to an Euclidean world radius.
 */
export function createRangedPointShadow(light: THREE.PointLight): RangedPointShadow {
  const shadow = light.shadow
  const proxy = new THREE.PointLight()
  // lightShadowMatrix must use PointShadowNode's cubemap matrix, never LightShadow's target path.
  proxy.castShadow = true
  proxy.shadow = shadow
  const node = new THREE.PointShadowNode(proxy, shadow)
  const center = uniform(proxy.position)
  const radius = uniform(0)
  // Fn parameters are proxy arrays: nested functions need a fresh named-argument object.
  const filterNode: PointShadowFilterCallback = Fn(({ depthTexture, bd3D, dp, shadow: filterShadow }: Parameters<typeof PointShadowFilter>[0]) =>
    positionWorld.sub(center).length().lessThanEqual(radius).select(
      PointShadowFilter({ depthTexture, bd3D, dp, shadow: filterShadow }), float(1),
    ),
  )
  const unlinkHooks = installShadowHooks(shadow, node, filterNode)
  let disposed = false

  return {
    sync(maxDistance) {
      if (disposed) return
      const range = light.distance > 0 ? Math.min(light.distance, maxDistance) : maxDistance
      light.getWorldPosition(proxy.position)
      proxy.updateMatrixWorld()
      radius.value = range
      shadow.camera.near = Math.min(0.1, range / 100)
      shadow.camera.far = range
      shadow.camera.updateProjectionMatrix()
    },
    dispose() {
      if (disposed) return
      disposed = true
      node.dispose()
      unlinkHooks()
    },
  }
}
