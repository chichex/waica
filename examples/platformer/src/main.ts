import { Game, loadScene, type PrefabJson } from '@waica/engine'
import { PLATFORMER_REGISTRY } from '@waica/archetype-platformer'
import scene from './scenes/main.scene.json'
import controls from './controls.json'
import stats from './stats.json'
import settings from './game.json'

// State code (src/states/*.ts) self-registers via defineStates on import —
// dropping a file in the folder is all it takes.
import.meta.glob('./states/*.ts', { eager: true })

// The project's prefab files (src/characters|objects|tiles/*.json) override
// the archetype defaults, so the game runs what the editor saved.
const prefabFiles = import.meta.glob<PrefabJson>(
  ['./characters/*.character.json', './objects/*.object.json', './tiles/*.tile.json'],
  { eager: true, import: 'default' },
)
const prefabs = { ...PLATFORMER_REGISTRY.prefabs }
for (const [path, prefab] of Object.entries(prefabFiles)) {
  // './characters/slime.character.json' -> 'characters/slime'
  prefabs[path.slice(2, path.indexOf('.', 2))] = prefab
}

// UI pieces are plain HTML (src/ui/*.html): presentation only — markup,
// styles and {{stat}} bindings. Code toggles them via game.ui.
const uiFiles = import.meta.glob<string>('./ui/*.html', {
  eager: true,
  query: '?raw',
  import: 'default',
})
const ui = { ...PLATFORMER_REGISTRY.ui }
for (const [path, html] of Object.entries(uiFiles)) {
  // './ui/coin-counter.html' -> 'coin-counter'
  ui[path.slice('./ui/'.length, -'.html'.length)] = html
}

const registry = { ...PLATFORMER_REGISTRY, prefabs, ui }

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
  // Controls, stats and game settings come from src/*.json (the editor's
  // Project views). The camera (start framing, zoom, follow) lives in the scene.
  const game = new Game({
    canvas,
    background: 0x1a1a2e,
    resolution: settings.resolution.mode === 'fixed' ? settings.resolution : undefined,
    bindings: controls.bindings,
    stats: stats.stats,
  })

  // Parameters tuned from the inspector override the archetype defaults.
  await game.loadParams('/waica.params.json')

  // The scene lives in src/scenes/main.scene.json — editable with the Waica
  // editor. Its "ui" list mounts the UI pieces it starts with (the counter).
  loadScene(game, scene as never, registry)

  if (import.meta.env.DEV) {
    const { attachOverlay } = await import('@waica/overlay')
    attachOverlay(game)
    ;(window as unknown as Record<string, unknown>).__waica = { game }
  }

  game.start()
}
