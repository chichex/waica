// Issue #203 CA-17/I-12: project-owned, opaque, isolated light fixtures.
import { writeFile } from 'node:fs/promises'
import path from 'node:path'

export const CANVAS = { width: 640, height: 360 }
export const FRAME = 13
export const SUN_POINTS = { shadow: [1.5, 0, 1.5], control: [-4, 0, 2] }
export const POINT_POINTS = { shadow: [0, 0, 0], control: [0.5, 0, 0.5] }

export function model(name, position, props) {
  return { name, position, components: [{ type: 'Model', props }] }
}

export function shadowScene(kind = 'sun') {
  const point = kind === 'point'
  return {
    waicaScene: 3,
    render: { space: '3d', shadows: { quality: 'medium' }, lighting: { ambient: { intensity: 0.15 } } },
    camera: { kind: 'perspective', position: point ? [4, 4, 5] : [6, 5, 8], target: [0, 0, 0], fov: 50 },
    entities: [
      { name: 'Diagnostics', components: [{ type: 'ShadowDiagnostics' }] },
      model('Ground', [0, 0, 0], { shape: 'plane', size: 20, castShadows: false }),
      model('Caster', point ? [-0.5, 0.5, -0.5] : [0, 1, 0], { shape: 'box', size: point ? 0.5 : 2 }),
      { name: 'Light', position: point ? [-1, 1, -1] : [0, 0, 0], components: [{
        type: point ? 'PointLight' : 'Sun',
        props: point ? { castShadows: true, intensity: 15, distance: 9, shadowMaxDistance: 2 } : { castShadows: true, intensity: 2, direction: [1, -2, 1] },
      }] },
    ],
  }
}

export function propsOf(scene, name, type = 'Model') {
  return scene.entities.find((entity) => entity.name === name).components.find((component) => component.type === type).props
}

// Generated application code: public engine imports, not a renderer or bridge fake.
const MAIN = `import { Animator, Component, Game, Model, PointLight, StateMachine, Sun, THREE } from '@waica/engine'
import scene from './scenes/main.scene.json'

const browserErrors = []
const originalError = console.error.bind(console)
console.error = (...values) => {
  browserErrors.push(values.map(String).join(' '))
  originalError(...values)
}
window.addEventListener('error', (event) => browserErrors.push(event.message || 'resource load error'), true)
window.addEventListener('unhandledrejection', (event) => browserErrors.push(String(event.reason)))
class ShadowDiagnostics extends Component {
  static componentName = 'ShadowDiagnostics'
  inspectState() {
    const root = this.game.find('Caster')?.get(Model)?.root
    const bounds = root ? new THREE.Box3().setFromObject(root, true) : null
    return { browserErrors: [...browserErrors], casterBounds: bounds ? { min: bounds.min.toArray(), max: bounds.max.toArray() } : null }
  }
}

class ShadowMover extends Component {
  static componentName = 'ShadowMover'
  onUpdate(dt) { this.entity.position.x += 4 * dt }
}
class ShadowTeleport extends Component {
  static componentName = 'ShadowTeleport'
  onUpdate() { this.entity.position.set(500, 0, 500) }
}

const canvas = document.querySelector('#game')
if (!(canvas instanceof HTMLCanvasElement)) throw new Error('missing game canvas')
const game = new Game({ canvas, resolution: { width: 640, height: 360 }, background: 0x203040 })
game.registerSceneCatalog({
  scenes: { main: scene },
  registry: {
    components: { Animator, Model, PointLight, StateMachine, Sun, ShadowMover, ShadowTeleport, ShadowDiagnostics },
    resolveAsset: (uri) => uri.startsWith('src/') ? '/' + uri : uri,
  },
})
game.loadSceneByName('main')
await game.assets.ready()
await game.ready()
game.start()
`

export async function writeShadowFixture(project, scene) {
  await writeFile(path.join(project, 'src/main.ts'), MAIN)
  await writeFile(path.join(project, 'src/scenes/main.scene.json'), `${JSON.stringify(scene, null, 2)}\n`)
  // The scaffold already supplies #game; make its pixel layout unambiguous.
  await writeFile(path.join(project, 'index.html'), `<!doctype html><html><head><link rel="icon" href="data:," />
<style>html,body{margin:0;background:#203040}canvas{display:block;width:640px;height:360px}</style>
</head><body><canvas id="game"></canvas><script type="module" src="/src/main.ts"></script></body></html>\n`)
}
