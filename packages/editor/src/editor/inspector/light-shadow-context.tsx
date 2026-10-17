import { createContext } from 'react'
import { resolveSceneShadows, resolveSceneSpace, type ResolvedSceneShadows, type SceneRenderJson, type SceneSpace } from '@waica/engine'

/** The scene being inspected, not whichever scene happened to be open before a prefab. */
export const LightShadowContext = createContext<{ scene: ResolvedSceneShadows; label: string; space: SceneSpace }>({
  scene: resolveSceneShadows(undefined),
  label: 'Scene shadows',
  space: '3d',
})

export function lightShadowContext(render: SceneRenderJson | undefined, prefab = false, space?: SceneSpace) {
  return {
    scene: resolveSceneShadows(render?.shadows),
    label: prefab ? 'Prefab preview shadows' : 'Scene shadows',
    // The current prefab viewport constructs a render-less, 2D preview scene.
    space: prefab ? '2d' as const : (space ?? resolveSceneSpace(render)),
  }
}
