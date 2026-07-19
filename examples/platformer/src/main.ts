import { Game, loadScene, type PrefabJson } from '@waica/engine'
import { PLATFORMER_REGISTRY } from '@waica/archetype-platformer'
import scene from './scenes/main.scene.json'

// The project's prefab files (src/characters|objects|tiles|ui/*.json) override
// the archetype defaults, so the game runs what the editor saved.
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

  // Parameters tuned from the inspector override the archetype defaults.
  await game.loadParams('/waica.params.json')

  // The scene lives in src/scenes/main.scene.json — editable with the Waica
  // editor. Its Hud entity (the 'ui/coin-counter' prefab) renders the counter.
  loadScene(game, scene as never, registry)

  if (import.meta.env.DEV) {
    const { attachOverlay } = await import('@waica/overlay')
    attachOverlay(game)
    ;(window as unknown as Record<string, unknown>).__waica = { game }
  }

  game.start()
}
