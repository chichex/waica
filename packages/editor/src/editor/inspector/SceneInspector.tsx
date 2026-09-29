import { resolveSceneCamera, type SceneJson } from '@waica/engine'
import { RoRow } from './PropRow'

type RenderProp = (key: string, value: unknown) => void

/** The scene's draw-order and projection switches. */
function RenderOptions({ scene, onRenderProp }: { scene: SceneJson; onRenderProp: RenderProp }) {
  return (
    <>
      <label className="ed-row">
        <span>y-sort draw order</span>
        <input
          type="checkbox"
          data-testid="ysort-toggle"
          checked={scene.render?.sort === 'y'}
          onChange={(e) => onRenderProp('sort', e.target.checked ? 'y' : undefined)}
        />
      </label>
      <div className="ed-hint">
        y-sort draws same-layer sprites lower on screen in front — top-down depth
      </div>
      <label className="ed-row">
        <span>Isometric projection</span>
        <input
          type="checkbox"
          data-testid="isometric-toggle"
          checked={scene.render?.projection === 'isometric'}
          onChange={(e) =>
            onRenderProp('projection', e.target.checked ? 'isometric' : undefined)
          }
        />
      </label>
      <div className="ed-hint">
        entities stay in logical coordinates while the scene renders on a 2:1 diamond lattice
      </div>
    </>
  )
}

/** Scene-level summary shown while nothing inside the scene is selected. */
export function SceneInspector({
  scene,
  onRenderProp,
}: {
  scene: SceneJson
  onRenderProp: RenderProp
}) {
  const cam = resolveSceneCamera(scene.camera)
  return (
    <div className="ed-pad">
      <RoRow label="entities" value={String(scene.entities.length)} />
      <RoRow label="ui pieces" value={scene.ui?.length ? scene.ui.join(', ') : 'none'} />
      <RoRow
        label="camera"
        value={cam.follow ? `follows ${cam.follow}` : `fixed at ${cam.position[0]}, ${cam.position[1]}`}
      />
      <RenderOptions scene={scene} onRenderProp={onRenderProp} />
      <div className="ed-hint">
        click an entity in the viewport or the tree to edit it — drag prefabs from the left
        panel to add more
      </div>
    </div>
  )
}
