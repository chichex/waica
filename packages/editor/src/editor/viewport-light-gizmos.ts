// The radius gizmo of every Light (issue #78 CA-13): a circle of its radius
// around where it shines, a 2:1 ellipse in an isometric scene, drawn on the
// Emissive layer so a dark scene never hides it. Edit mode only.
import { projectIsometric, THREE, type Game, type Light } from '@waica/engine'
import { addOverlay } from './viewport-selection-gizmos'

const LIGHT_GIZMO_COLOR = 0xffc857
const SEGMENTS = 64

/** A closed unit circle as a THREE.Line (WebGPURenderer rejects LineLoop). */
function unitCircle(): THREE.BufferGeometry {
  const points: number[] = []
  for (let index = 0; index <= SEGMENTS; index += 1) {
    const angle = (index / SEGMENTS) * Math.PI * 2
    points.push(Math.cos(angle), Math.sin(angle), 0)
  }
  return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(points, 3))
}

export function createLightGizmos(game: Game) {
  const geometry = unitCircle()
  const material = new THREE.LineBasicMaterial({ color: LIGHT_GIZMO_COLOR, transparent: true, opacity: 0.8 })
  const lines = new Map<Light, THREE.Line>()

  const lineFor = (light: Light): THREE.Line => {
    const existing = lines.get(light)
    if (existing) return existing
    const line = new THREE.Line(geometry, material)
    line.name = 'waica:light-gizmo'
    line.frustumCulled = false
    addOverlay(game, line)
    lines.set(light, line)
    return line
  }

  /** Places one gizmo per live Light; in play mode, or for a Light gone, none. */
  const sync = (mode: 'edit' | 'play'): void => {
    const live = new Set(game.lighting.lights)
    for (const [light, line] of lines) {
      if (live.has(light)) continue
      line.removeFromParent()
      lines.delete(light)
    }
    for (const light of live) {
      const line = lineFor(light)
      line.visible = mode === 'edit'
      const { x, y, radius } = light.field()
      const isometric = game.projection === 'isometric'
      const center = isometric ? projectIsometric(x, y) : { x, y }
      line.position.set(center.x, center.y, 4.3)
      if (isometric) line.scale.set(radius * Math.SQRT2, (radius * Math.SQRT2) / 2, 1)
      else line.scale.set(radius, radius, 1)
    }
  }

  return { sync }
}
