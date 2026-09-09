import {
  collectModuleComponents,
  Game,
  installArchetype,
  installDirectionalAnimation,
  mergeRegistryComponents,
  type PrefabJson,
  type SceneJson,
} from '@waica/engine'
import { ARCHETYPE } from '@waica/archetype-isometric'
import controls from './controls.json'
import stats from './stats.json'
import settings from './game.json'

// The project's scenes (src/scenes/*.scene.json). One live scene at a
// time (ADR 0011): the catalog lets a SceneTransition or a role ask for
// another by name — game.loadSceneByName('cave').
const sceneFiles = import.meta.glob<SceneJson>('./scenes/*.scene.json', {
  eager: true,
  import: 'default',
})
const scenes: Record<string, SceneJson> = {}
for (const [path, scene] of Object.entries(sceneFiles)) {
  // './scenes/cave.scene.json' -> 'cave'
  scenes[path.slice('./scenes/'.length, -'.scene.json'.length)] = scene
}

// Components, roles and state code extend the installed archetype baseline
// when main() imports them.
const projectCode = import.meta.glob([
  './components/*.ts',
  './roles/*.ts',
  './states/*.ts',
  '!**/*.test.ts',
])

// The project's prefabs ARE its files (src/characters|objects|tiles/*.json).
// Nothing else: the game knows exactly what the editor lists.
const prefabFiles = import.meta.glob<PrefabJson>(
  ['./characters/*.character.json', './objects/*.object.json', './tiles/*.tile.json'],
  { eager: true, import: 'default' },
)
const prefabs: Record<string, PrefabJson> = {}
for (const [path, prefab] of Object.entries(prefabFiles)) {
  // './characters/orc.character.json' -> 'characters/orc'
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
  // './ui/crate-counter.html' -> 'crate-counter'
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

const registryBase = {
  ...ARCHETYPE.registry,
  // Keep these two: the spread above carries the archetype's own catalogs,
  // and these replace them with the project's. Drop one and the game starts
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
  void main(canvas)
}

async function main(canvas: HTMLCanvasElement): Promise<void> {
  installArchetype(ARCHETYPE.bundle)
  // installArchetype resets the directional registry, so the contract goes
  // right after it — this is what makes <state>-<dir> clips resolve.
  installDirectionalAnimation(ARCHETYPE.animation ?? null)
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

  // The project's scenes live in src/scenes/*.scene.json — editable with the
  // Waica editor. Boots on "main"; its "ui" list mounts the UI pieces it
  // starts with (the counter).
  game.registerSceneCatalog({ scenes, registry })
  game.loadSceneByName('main')
  // CA-19: a looping music bed, session-scoped (ADR 0012) so a Scene
  // Transition never stops or restarts it — every combat one-shot stays
  // scene-scoped by default. The isometric archetype declares its own
  // music uri in the manifest (G8: ArchetypeManifest.music); this file
  // just asks for it, the same way the generic project template does for
  // any archetype that has one — one mechanism, not a hardcoded uri here
  // plus a declarative one for generated projects. game.audio resolves
  // "waica:" uris itself through the registered scene catalog's registry,
  // the same one resolveProps runs every prefab's sound prop through — a
  // direct call like this one needs no manual resolveAsset step. CA-9's
  // preload keeps the four shipped sounds decoded ahead of time, so the
  // first swing doesn't pay for the fetch. This call runs before any
  // input, so the engine retains the loop and starts it at the autoplay
  // unlock instead of discarding it.
  void game.audio.preload(['waica:iso-sword-swing', 'waica:iso-hit', 'waica:iso-hurt', 'waica:iso-town-theme'])
  if (ARCHETYPE.music) {
    game.audio.play(ARCHETYPE.music, { channel: 'music', loop: true, scope: 'session' })
  }

  if (import.meta.env.DEV) {
    ;(window as unknown as Record<string, unknown>).__waica = { game }
  }

  game.start()
}
