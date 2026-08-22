import type { SceneJson } from '@waica/engine'
import type { GridSettings } from '../project/editor-settings'

/** Scene projection owns the lattice shape; project settings own its behavior and size. */
export function effectiveGrid(scene: SceneJson, settings: GridSettings): GridSettings {
  return scene.render?.projection === 'isometric'
    ? { ...settings, type: 'isometric' }
    : settings
}
