import { createContext } from 'react'
import { resolveSceneShadows, type SceneRenderJson } from '@waica/engine'

/** The scene being inspected, not whichever scene happened to be open before a prefab. */
export const LightShadowContext = createContext({
  scene: resolveSceneShadows(undefined),
  label: 'Scene shadows',
})

export function lightShadowContext(render: SceneRenderJson | undefined, prefab = false) {
  return {
    scene: resolveSceneShadows(render?.shadows),
    label: prefab ? 'Prefab preview shadows' : 'Scene shadows',
  }
}
