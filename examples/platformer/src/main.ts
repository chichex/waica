import { Game, installArchetype, loadScene, type PrefabJson } from '@waica/engine'
import { PLATFORMER_BUNDLE, PLATFORMER_REGISTRY } from '@waica/archetype-platformer'
import scene from './scenes/main.scene.json'
import controls from './controls.json'
import stats from './stats.json'
import settings from './game.json'

// Roles (src/roles/*.ts) and state code (src/states/*.ts) extend the
// installed archetype baseline when main() imports them.
const projectCode = import.meta.glob(['./roles/*.ts', './states/*.ts'])

// The project's prefabs ARE its files (src/characters|objects|tiles/*.json).
// Nothing else: the game knows exactly what the editor lists.
const prefabFiles = import.meta.glob<PrefabJson>(
  ['./characters/*.character.json', './objects/*.object.json', './tiles/*.tile.json'],
  { eager: true, import: 'default' },
)
const prefabs: Record<string, PrefabJson> = {}
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
const ui: Record<string, string> = {}
for (const [path, html] of Object.entries(uiFiles)) {
  // './ui/coin-counter.html' -> 'coin-counter'
  ui[path.slice('./ui/'.length, -'.html'.length)] = html
}

// The project's art (src/art/*): texture props store the project path
// ('src/art/hero.png'); this map turns each into a served, build-safe URL.
const artFiles = import.meta.glob<string>('./art/*', {
  eager: true,
  query: '?url',
  import: 'default',
})
const artUrls: Record<string, string> = {}
for (const [path, url] of Object.entries(artFiles)) {
  // './art/hero.png' -> 'src/art/hero.png'
  artUrls[`src/${path.slice(2)}`] = url
}

const registry = {
  ...PLATFORMER_REGISTRY,
  // Keep these two: the spread above carries the archetype's own catalogs,
  // and these replace them with the project's. Drop one and the game starts
  // resolving pieces that are nowhere in src/.
  prefabs,
  ui,
  resolveAsset: (uri: string) =>
    artUrls[uri] ?? PLATFORMER_REGISTRY.resolveAsset?.(uri) ?? uri,
}

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
  installArchetype(PLATFORMER_BUNDLE)
  await Promise.all(Object.values(projectCode).map((load) => load()))

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
