import { CharacterMotor } from '@waica/behaviors'
import { Collider, Game, Model, PointLight, RigidBody, Sun, type SceneJson, type SceneRegistry } from '@waica/engine'
import { BINDINGS } from './controls'

declare global {
  interface Window {
    /** DEV only: the live Game, for browser-driven logical-state probes. */
    __waica?: { game: Game }
  }
}

// The scenes (src/scenes/*.scene.json). One live scene at a time (ADR 0011):
// the catalog lets game.loadSceneByName('main') ask for one by name.
const sceneFiles = import.meta.glob<SceneJson>('./scenes/*.scene.json', {
  eager: true,
  import: 'default',
})
const scenes: Record<string, SceneJson> = {}
for (const [path, scene] of Object.entries(sceneFiles)) {
  // './scenes/main.scene.json' -> 'main'
  scenes[path.slice('./scenes/'.length, -'.scene.json'.length)] = scene
}

// The art lives in art/ beside src/ (a generated Project keeps it in src/art/):
// Model.src stores the project path ('src/art/tree.glb'); this map turns each
// into a served, build-safe URL.
const artFiles = import.meta.glob<string>('../art/*', {
  eager: true,
  query: '?url',
  import: 'default',
})
const artUrls: Record<string, string> = {}
for (const [path, url] of Object.entries(artFiles)) {
  // '../art/tree.glb' -> 'src/art/tree.glb'
  artUrls[`src/art/${path.slice('../art/'.length)}`] = url
}

// No archetype: this example uses the engine's 3D components and the character
// motor directly.
const registry: SceneRegistry = {
  components: { Model, Sun, PointLight, Collider, RigidBody, CharacterMotor },
  resolveAsset: (uri) => artUrls[uri] ?? uri,
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
  const game = new Game({ canvas, background: 0x1a1a2e, bindings: { ...BINDINGS } })
  game.registerSceneCatalog({ scenes, registry })
  game.loadSceneByName('main')
  // Assets Ready (ADR 0019): the scene spawned synchronously, its glb is still
  // arriving and so is the physics module (ADR 0028, a 3D scene loads it on
  // demand); wait for both before the first frame so nothing pops in and
  // nothing falls before it can land. A failed file is recorded, not thrown:
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
