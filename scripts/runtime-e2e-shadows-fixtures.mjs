// Issue #203 CA-17/I-12 and issue #204 CA-15: project-owned, opaque, isolated light fixtures.
import { writeFile } from 'node:fs/promises'
import path from 'node:path'

export const CANVAS = { width: 640, height: 360 }
export const FRAME = 13
export const SUN_POINTS = { shadow: [1.5, 0, 1.5], control: [-4, 0, 2] }
export const POINT_POINTS = { shadow: [0, 0, 0], control: [0.5, 0, 0.5] }

/**
 * Issue #204 CA-15/CA-6. One SpotLight 1.5 above an opaque Plate, pointing down;
 * 5 below it, along the same axis, lies an opaque Ground. Its `distance` is 9
 * and its shadow range 2, so the Plate (depth 1.5) is inside the range and the
 * Ground (depth 5) is lit but outside it. The Caster (depth 0.75, 0.4 wide)
 * shadows the Plate under it, and would shadow the Ground's `beyond` point if
 * the range reached it. The cone's half-angle is 45 degrees: `control` and
 * `beyond` lie well inside it, `outside` lies past it on the Ground.
 */
export const SPOT = {
  position: [0, 1.5, 0], direction: [0, -1, 0], angle: 45, distance: 9, range: 2,
  plateDepth: 1.5, groundDepth: 5, casterDepth: 0.75, casterSize: 0.4,
}
export const SPOT_POINTS = {
  shadow: [0, 0, 0], control: [0.8, 0, 0],
  beyond: [0.7, -3.5, 0.7], outside: [-6.5, -3.5, 0],
}
export const POINTS = { sun: SUN_POINTS, point: POINT_POINTS, spot: SPOT_POINTS }
export const LIGHT_TYPES = { sun: 'Sun', point: 'PointLight', spot: 'SpotLight' }

export function model(name, position, props) {
  return { name, position, components: [{ type: 'Model', props }] }
}

function spotScene() {
  const [x, y, z] = SPOT.position
  return {
    waicaScene: 3,
    render: { space: '3d', shadows: { quality: 'medium' }, lighting: { ambient: { intensity: 0.15 } } },
    camera: { kind: 'perspective', position: [0, 3, 12], target: [0, -1.5, 0], fov: 55 },
    entities: [
      { name: 'Diagnostics', components: [{ type: 'ShadowDiagnostics' }] },
      model('Ground', [x, y - SPOT.groundDepth, z], { shape: 'plane', size: 30, castShadows: false }),
      // Mid grey: 1.5 from the light, a white Plate would clip at 255 and hide a faint shadow edge.
      model('Plate', [x, y - SPOT.plateDepth, z], { shape: 'plane', size: 2.4, color: '#808080', castShadows: false }),
      model('Caster', [x, y - SPOT.casterDepth, z], { shape: 'box', size: SPOT.casterSize }),
      { name: 'Light', position: SPOT.position, components: [{
        type: 'SpotLight',
        props: { castShadows: true, intensity: 20, distance: SPOT.distance, shadowMaxDistance: SPOT.range, angle: SPOT.angle, direction: SPOT.direction },
      }] },
    ],
  }
}

export function shadowScene(kind = 'sun') {
  if (kind === 'spot') return spotScene()
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
const MAIN = `import { Animator, Component, Game, Model, PointLight, SpotLight, StateMachine, Sun, THREE } from '@waica/engine'
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
    components: { Animator, Model, PointLight, SpotLight, StateMachine, Sun, ShadowMover, ShadowTeleport, ShadowDiagnostics },
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
