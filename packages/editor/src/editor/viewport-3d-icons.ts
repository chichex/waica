// Icons of the 3D edit view (issue #173 CA-14): a billboard of constant screen
// size for every Sun, PointLight and entity with no Model, and one for the
// scene camera at its JSON position, so a click can select what has no mesh.
// They are the extra targets raycastPick tests beside the Model roots.
import { Model, PointLight, resolvePerspectiveCamera, Sun, THREE, type Entity, type Game, type PickTarget } from '@waica/engine'
import type { ViewportLive } from './viewport-live'
import { addOverlay } from './viewport-selection-gizmos'

type IconKind = 'sun' | 'light' | 'entity' | 'camera'

/** The icon's share of the viewport height (a sprite without size attenuation). */
const ICON_SIZE = 0.045
const ICON_NAME = 'waica:editor-icon'

const GLYPHS: Readonly<Record<IconKind, { glyph: string; color: string }>> = {
  sun: { glyph: '☀', color: '#ffc857' },
  light: { glyph: '◉', color: '#ffc857' },
  entity: { glyph: '◇', color: '#d8d8e8' },
  camera: { glyph: '▣', color: '#7fd3ff' },
}

/** The glyph drawn on a canvas, or the plain color where there is no 2D canvas to draw it on. */
function iconMaterial(kind: IconKind): THREE.SpriteMaterial {
  const { glyph, color } = GLYPHS[kind]
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const context = canvas.getContext('2d')
  const material = new THREE.SpriteMaterial({ sizeAttenuation: false, depthTest: false, transparent: true })
  if (!context) {
    material.color.set(color)
    return material
  }
  context.fillStyle = color
  context.font = '52px sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText(glyph, 32, 34)
  material.map = new THREE.CanvasTexture(canvas)
  return material
}

/** What an entity's icon shows; null when its mesh is what a click hits (a Model with no mesh yet, loading or broken, still gets one). */
function iconKindOf(entity: Entity): IconKind | null {
  if (entity.components.some((component) => component instanceof Sun)) return 'sun'
  if (entity.components.some((component) => component instanceof PointLight)) return 'light'
  if (!entity.components.some((component) => component instanceof Model)) return 'entity'
  return new THREE.Box3().setFromObject(entity.node).isEmpty() ? 'entity' : null
}

/** Icon sprites of each kind over the Game's scene, sharing one material per kind. */
function iconSprites(game: Game) {
  const materials = new Map<IconKind, THREE.SpriteMaterial>()
  const materialFor = (kind: IconKind): THREE.SpriteMaterial => {
    const material = materials.get(kind) ?? iconMaterial(kind)
    materials.set(kind, material)
    return material
  }
  return {
    materialFor,
    dispose(): void {
      for (const material of materials.values()) {
        material.map?.dispose()
        material.dispose()
      }
      materials.clear()
    },
    create(kind: IconKind): THREE.Sprite {
      const icon = new THREE.Sprite(materialFor(kind))
      icon.name = ICON_NAME
      icon.scale.set(ICON_SIZE, ICON_SIZE, 1)
      icon.visible = false
      addOverlay(game, icon)
      return icon
    },
  }
}

/** The icon kind of each live entity that gets one. */
function iconKinds(game: Game): Map<Entity, IconKind> {
  const kinds = new Map<Entity, IconKind>()
  for (const entity of game.entities.filter((candidate) => candidate.alive)) {
    const kind = iconKindOf(entity)
    if (kind) kinds.set(entity, kind)
  }
  return kinds
}

export function createIcons3d(game: Game) {
  const sprites = iconSprites(game)
  const camera = sprites.create('camera')
  const icons = new Map<Entity, THREE.Sprite>()

  /** Places one icon per meshless entity (dropping those of entities gone), and the camera's; hides them all when not `visible`. */
  const sync = (live: ViewportLive, visible: boolean): void => {
    if (!visible) {
      for (const icon of icons.values()) icon.visible = false
      camera.visible = false
      return
    }
    const kinds = iconKinds(game)
    for (const [entity, icon] of icons) {
      if (kinds.has(entity)) continue
      icon.removeFromParent()
      icons.delete(entity)
    }
    for (const [entity, kind] of kinds) {
      const icon = icons.get(entity) ?? sprites.create(kind)
      icons.set(entity, icon)
      icon.material = sprites.materialFor(kind)
      entity.node.getWorldPosition(icon.position)
      icon.visible = true
    }
    camera.position.set(...resolvePerspectiveCamera(live.scene.camera?.kind === 'perspective' ? live.scene.camera : undefined).position)
    camera.visible = true
  }

  return {
    sync,
    /** Frees the glyph textures and materials. */
    dispose(): void {
      sprites.dispose()
    },
    /** The icons a click can hit: each entity's, and the scene camera's. */
    targets: (): PickTarget[] => [
      ...[...icons].filter(([, icon]) => icon.visible).map(([entity, icon]) => ({ object: icon, entity })),
      ...(camera.visible ? [{ object: camera, entity: 'camera' as const }] : []),
    ],
  }
}
