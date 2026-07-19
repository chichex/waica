import { Game, loadScene, type PrefabJson } from '@waica/engine'
import { PLATFORMER_REGISTRY } from '@waica/archetype-platformer'
import scene from './scenes/main.scene.json'

// Your prefab files (saved by the editor, or hand-edited — they're just JSON)
// override the archetype defaults, so the shipped game runs what you tweaked.
const prefabFiles = import.meta.glob<PrefabJson>(
  [
    './characters/*.character.json',
    './objects/*.object.json',
    './tiles/*.tile.json',
    './ui/*.ui.json',
  ],
  { eager: true, import: 'default' },
)
const prefabs = { ...PLATFORMER_REGISTRY.prefabs }
for (const [path, prefab] of Object.entries(prefabFiles)) {
  // './characters/slime.character.json' -> 'characters/slime'
  prefabs[path.slice(2, path.indexOf('.', 2))] = prefab
}
const registry = { ...PLATFORMER_REGISTRY, prefabs }

const canvas = document.querySelector<HTMLCanvasElement>('#game')
if (!canvas) throw new Error('missing <canvas id="game">')

// One game per page (guards against module re-runs).
if (canvas.dataset.waica) {
  location.reload()
} else {
  canvas.dataset.waica = 'mounted'
  void main(canvas)
}

async function main(canvas: HTMLCanvasElement): Promise<void> {
  const game = new Game({ canvas, viewHeight: 12, background: 0x1a1a2e })

  // Whatever you tweak in the inspector (~) is saved here and overrides the defaults.
  await game.loadParams('/waica.params.json')

  // Your scene: edit it with the Waica editor or by hand — it's just JSON.
  // Its Hud entity (the 'ui/coin-counter' prefab) renders the coin counter.
  loadScene(game, scene as never, registry)

  if (import.meta.env.DEV) {
    const { attachOverlay } = await import('@waica/overlay')
    attachOverlay(game)
  }

  game.start()
}
