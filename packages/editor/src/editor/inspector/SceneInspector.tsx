import { isPerspectiveCameraJson, resolvePerspectiveCamera, resolveSceneSpace, type SceneJson } from '@waica/engine'
import { resolveOrthographicCamera } from '../../scene/camera-block'
import { RoRow } from './PropRow'
import { LightingOptions, PostOptions } from './SceneLightingOptions'

type RenderProp = (key: string, value: unknown) => void

/** One scene render switch: a labelled checkbox and the hint under it. */
function RenderToggle({
  label,
  testId,
  checked,
  onToggle,
  hint,
}: {
  label: string
  testId: string
  checked: boolean
  onToggle: (checked: boolean) => void
  hint: string
}) {
  return (
    <>
      <label className="ed-row">
        <span>{label}</span>
        <input
          type="checkbox"
          data-testid={testId}
          checked={checked}
          onChange={(e) => onToggle(e.target.checked)}
        />
      </label>
      <div className="ed-hint">{hint}</div>
    </>
  )
}

/** The scene's draw-order, batching and projection switches. */
function RenderOptions({ scene, onRenderProp }: { scene: SceneJson; onRenderProp: RenderProp }) {
  return (
    <>
      <RenderToggle
        label="y-sort draw order"
        testId="ysort-toggle"
        checked={scene.render?.sort === 'y'}
        onToggle={(on) => onRenderProp('sort', on ? 'y' : undefined)}
        hint="y-sort draws same-layer sprites lower on screen in front — top-down depth"
      />
      <RenderToggle
        label="Sprite batching"
        testId="batch-toggle"
        checked={scene.render?.batch !== false}
        onToggle={(on) => onRenderProp('batch', on ? undefined : false)}
        hint="Draws sprites that share art in one call. Turn off only to debug draw order or a visual difference."
      />
      <RenderToggle
        label="Isometric projection"
        testId="isometric-toggle"
        checked={scene.render?.projection === 'isometric'}
        onToggle={(on) => onRenderProp('projection', on ? 'isometric' : undefined)}
        hint="entities stay in logical coordinates while the scene renders on a 2:1 diamond lattice"
      />
    </>
  )
}

/** Where the scene's camera is: the follow target or fixed point of a 2D camera, the pose of a 3D one. */
function cameraSummary(scene: SceneJson): string {
  if (resolveSceneSpace(scene.render) === '3d') {
    const cam = resolvePerspectiveCamera(isPerspectiveCameraJson(scene.camera) ? scene.camera : undefined)
    return `perspective at ${cam.position.join(', ')}`
  }
  const cam = resolveOrthographicCamera(scene.camera)
  return cam.follow ? `follows ${cam.follow}` : `fixed at ${cam.position[0]}, ${cam.position[1]}`
}

/** Scene-level summary shown while nothing inside the scene is selected. */
export function SceneInspector({
  scene,
  onRenderProp,
}: {
  scene: SceneJson
  onRenderProp: RenderProp
}) {
  const threeD = resolveSceneSpace(scene.render) === '3d'
  return (
    <div className="ed-pad">
      <RoRow label="entities" value={String(scene.entities.length)} />
      <RoRow label="ui pieces" value={scene.ui?.length ? scene.ui.join(', ') : 'none'} />
      {threeD && <RoRow label="space" value="3d" />}
      <RoRow label="camera" value={cameraSummary(scene)} />
      {!threeD && <RenderOptions scene={scene} onRenderProp={onRenderProp} />}
      <LightingOptions scene={scene} onRenderProp={onRenderProp} />
      <PostOptions scene={scene} onRenderProp={onRenderProp} />
      <div className="ed-hint">
        click an entity in the viewport or the tree to edit it — drag prefabs from the left
        panel to add more
      </div>
    </div>
  )
}
