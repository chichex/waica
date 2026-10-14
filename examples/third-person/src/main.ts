import {
  collectModuleComponents,
  Game,
  installArchetype,
  mergeRegistryComponents,
  type PrefabJson,
  type SceneJson,
} from '@waica/engine'
import { ARCHETYPE } from '@waica/archetype-third-person'
import controls from './controls.json'
import stats from './stats.json'
import settings from './game.json'

declare global {
  interface Window {
    /** DEV only: the live Game, for browser-driven logical-state probes. */
    __waica?: { game: Game }
  }
}

// The example is a synced copy of @waica/archetype-third-person (scripts/sync-scene.mjs).
// Your project's scenes (src/scenes/*.scene.json). One live scene at a
// time (ADR 0011): the catalog lets a SceneTransition or a role ask for
// another by name — game.loadSceneByName('crypt').
const sceneFiles = import.meta.glob<SceneJson>('./scenes/*.scene.json', {
  eager: true,
  import: 'default',
})
const scenes: Record<string, SceneJson> = {}
for (const [path, scene] of Object.entries(sceneFiles)) {
  // './scenes/crypt.scene.json' -> 'crypt'
  scenes[path.slice('./scenes/'.length, -'.scene.json'.length)] = scene
}

// Your components, roles and state code extend the installed archetype
// baseline when main() imports them.
const projectCode = import.meta.glob([
  './components/*.ts',
  './roles/*.ts',
  './states/*.ts',
  '!**/*.test.ts',
])

// Your prefabs ARE these files (saved by the editor, or hand-edited — they're
// just JSON). Nothing else: delete one and the game stops knowing about it.
const prefabFiles = import.meta.glob<PrefabJson>(
  ['./characters/*.character.json', './objects/*.object.json', './tiles/*.tile.json'],
  { eager: true, import: 'default' },
)
const prefabs: Record<string, PrefabJson> = {}
for (const [path, prefab] of Object.entries(prefabFiles)) {
  // './characters/skeleton.character.json' -> 'characters/skeleton'
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
  // './ui/player-health.html' -> 'player-health'
  ui[path.slice('./ui/'.length, -'.html'.length)] = html
}

// Your art (src/art/*): a Model's src stores the project path
// ('src/art/knight.glb'); this map turns each into a served, build-safe URL.
const artFiles = import.meta.glob<string>('./art/*', {
  eager: true,
  query: '?url',
  import: 'default',
})
const artUrls: Record<string, string> = {}
for (const [path, url] of Object.entries(artFiles)) {
  // './art/knight.glb' -> 'src/art/knight.glb'
  artUrls[`src/${path.slice(2)}`] = url
}

const registryBase = {
  ...ARCHETYPE.registry,
  // Keep these two: the spread above carries the archetype's own catalogs,
  // and these replace them with yours. Drop one and the game starts
  // resolving pieces that are nowhere in src/.
  prefabs,
  ui,
  resolveAsset: (uri: string) =>
    artUrls[uri] ?? ARCHETYPE.registry.resolveAsset?.(uri) ?? uri,
}

const canvas = document.querySelector<HTMLCanvasElement>('#game')
if (!canvas) throw new Error('missing <canvas id="game">')

// One game per page (guards against module re-runs).
if (canvas.dataset.waica) {
  location.reload()
} else {
  canvas.dataset.waica = 'mounted'
  main(canvas).catch((error: unknown) => {
    console.error('[waica] the game failed to start:', error)
  })
}

async function main(canvas: HTMLCanvasElement): Promise<void> {
  // The third-person archetype ships no directional animation contract and no music bed.
  installArchetype(ARCHETYPE.bundle)
  const projectModules = await Promise.all(Object.values(projectCode).map((load) => load()))
  const registry = mergeRegistryComponents(
    registryBase,
    collectModuleComponents(projectModules as Array<Record<string, unknown>>),
  )

  // Controls, stats and game settings come from src/*.json (the editor's
  // Project views). The camera (start framing, zoom, follow) lives in the scene.
  const game = new Game({
    canvas,
    background: 0x1a1a2e,
    resolution: settings.resolution.mode === 'fixed' ? settings.resolution : undefined,
    bindings: controls.bindings,
    stats: stats.stats,
  })

  // Persisted parameter overrides (public/waica.params.json) beat the defaults.
  await game.loadParams('/waica.params.json')

  // Your scenes: edit them with the Waica editor or by hand — they're just
  // JSON. Boots on "main"; its "ui" list mounts the UI pieces it starts
  // with (the hearts and the controls hint).
  game.registerSceneCatalog({ scenes, registry })
  game.loadSceneByName('main')
  // Assets Ready (ADR 0019): the scene above spawned synchronously and its
  // glbs and the Rapier module are still arriving; wait for them before the
  // first frame so nothing pops in. A failed load is recorded, not thrown:
  // this never rejects.
  await game.assets.ready()

  if (import.meta.env.DEV) {
    window.__waica = { game }
  }

  // The renderer initializes asynchronously (ADR 0025): WebGPU when the
  // browser offers it, otherwise WebGL2. A frame before it draws nothing, so
  // the first one waits; it rejects, naming both, when neither works.
  await game.ready()
  game.start()
}
