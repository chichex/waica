import { useState } from 'react'
import type { SceneComponentJson } from '@waica/engine'
import { useArchetype } from '../../project/archetype'
import { appearanceKind } from '../../project/chassis'
import { IMAGE_RE, type ArtItem, type DroppedFile } from '../use-project-art'
import { ComponentRows, type ComponentPropHandlers } from './ComponentCard'
import { ANIMATION_KEYS, componentKeys } from './component-meta'
import { useFrameSize, type FrameSize } from './image-frame-size'
import { ComponentUpdateSchedule } from './update-schedule'
import { TexturePicker, TexturePreview } from './TextureControls'
import { useTextureDrop, type TextureDropProps } from './use-texture-drop'
import { ViewportVisibilityButton } from './ViewportVisibilityButton'

export interface AppearanceSectionProps extends ComponentPropHandlers {
  id: string
  comp: SceneComponentJson
  viewportVisible: boolean
  onViewportVisibleChange: (visible: boolean) => void
  overridden?: Set<string>
  /** State-graph gaps shown inline (characters). */
  clipsWarning?: string
  art: ArtItem[]
  urlFor: (uri: string) => string
  onImportArt: (files: DroppedFile[]) => Promise<void>
  onSetTexture: (uri: string) => void
  /** Present only at the prefab level: image <-> shape is structural. */
  onSetShape?: () => void
  /** Present only at the prefab level: animated <-> static is structural. */
  onToggleAnimated?: () => void
  /** Opens the animation editor (AnimatedSprite only). */
  onEditAnimation?: () => void
  /** Project art scale, for the "use image size" button. */
  pixelsPerUnit: number
  /** Commits width+height as one undo step. */
  onSetSize: (size: { width: number; height: number }) => void
  /** Present at the entity level only: sizes+centers this quad to the scene camera. */
  onFillCamera?: () => void
}

type AppearanceKind = 'image' | 'shape'

/** Prefab-level image <-> shape switch. */
function AppearanceTypeRow({
  kind,
  onChange,
}: {
  kind: AppearanceKind
  onChange: (kind: AppearanceKind) => void
}) {
  return (
    <label className="ed-row">
      <span>type</span>
      <select
        value={kind}
        onChange={(e) => onChange(e.target.value === 'shape' ? 'shape' : 'image')}
      >
        <option value="shape">shape</option>
        <option value="image">image</option>
      </select>
    </label>
  )
}

function ShapeRow({ comp, onProp }: { comp: SceneComponentJson; onProp: ComponentPropHandlers['onProp'] }) {
  const shape = comp.props?.shape === 'circle' ? 'circle' : 'rectangle'
  return (
    <label className="ed-row">
      <span>shape</span>
      <select value={shape} onChange={(e) => onProp('shape', e.target.value)}>
        <option value="rectangle">rectangle</option>
        <option value="circle">circle</option>
      </select>
    </label>
  )
}

/** "Use image size" and "Fill camera": one-click sizing of the appearance's box. */
function SizeActions({
  comp,
  frame: { frameRect, naturalSize },
  pixelsPerUnit,
  onSetSize,
  onFillCamera,
}: Pick<AppearanceSectionProps, 'comp' | 'pixelsPerUnit' | 'onSetSize' | 'onFillCamera'> & {
  frame: FrameSize
}) {
  if (!naturalSize && !onFillCamera) return null
  const animated = comp.type === 'AnimatedSprite'
  return (
    <div className="ed-appear-actions">
      {naturalSize && frameRect && (
        <button
          className="ed-mini"
          title={`${animated ? 'One frame' : 'The image'} is ${Math.round(frameRect.width)}×${Math.round(frameRect.height)}px — ${naturalSize.width}×${naturalSize.height} units at ${pixelsPerUnit} px/unit (Project → game)`}
          onClick={() => onSetSize(naturalSize)}
        >
          📐 Use image size
        </button>
      )}
      {onFillCamera && (
        <button
          className="ed-mini"
          title="Size and center this appearance to cover exactly what the scene camera shows"
          onClick={onFillCamera}
        >
          🎥 Fill camera
        </button>
      )}
    </div>
  )
}

function AnimationControls({
  clipsWarning,
  onEditAnimation,
}: Pick<AppearanceSectionProps, 'clipsWarning' | 'onEditAnimation'>) {
  return (
    <>
      {clipsWarning && <div className="ed-hint ed-warn">{clipsWarning}</div>}
      {onEditAnimation && (
        <button className="ed-wide" onClick={onEditAnimation}>
          🎞 Edit animation…
        </button>
      )}
    </>
  )
}

/** Everything below the texture picker: preview, sizing, prop rows and animation. */
function AppearanceDetails({
  kind,
  texture,
  frame,
  drop,
  onChangeImage,
  ...props
}: AppearanceSectionProps & {
  kind: AppearanceKind
  texture: string
  frame: FrameSize
  drop: { dropping: boolean; dragProps: TextureDropProps }
  onChangeImage: () => void
}) {
  const archetype = useArchetype()
  const animated = props.comp.type === 'AnimatedSprite'
  const keys = componentKeys(props.comp, archetype).filter(
    (k) =>
      !ANIMATION_KEYS.has(k) &&
      k !== 'texture' &&
      k !== 'shape' &&
      (kind === 'shape' || k !== 'color'),
  )
  const image = kind === 'image'
  return (
    <>
      {image && (
        <TexturePreview
          texture={texture}
          art={props.art}
          urlFor={props.urlFor}
          overridden={props.overridden?.has('texture') ?? false}
          {...drop}
          onChange={onChangeImage}
        />
      )}
      {image && props.onToggleAnimated && (
        <label className="ed-row">
          <span>animated</span>
          <input type="checkbox" checked={animated} onChange={props.onToggleAnimated} />
        </label>
      )}
      <SizeActions {...props} frame={frame} />
      <ComponentRows {...props} keys={keys} />
      {animated && <AnimationControls {...props} />}
    </>
  )
}

/**
 * The image/shape choice workflow: which kind the section shows, whether the
 * texture picker is open, and what picking, importing or switching kind does.
 */
function useAppearanceChoice({
  comp,
  onSetTexture,
  onSetShape,
  onImportArt,
}: Pick<AppearanceSectionProps, 'comp' | 'onSetTexture' | 'onSetShape' | 'onImportArt'>) {
  // "image with nothing dropped yet" isn't a storable state — a texture-less
  // Sprite reads as a shape — so the invite-to-drop phase lives here.
  const [wantsImage, setWantsImage] = useState(false)
  const [picking, setPicking] = useState(false)
  const kind = wantsImage ? 'image' : appearanceKind(comp)

  const choose = (uri: string): void => {
    onSetTexture(uri)
    setPicking(false)
    setWantsImage(false)
  }
  const importImage = async (files: DroppedFile[]): Promise<void> => {
    const image = files.find((f) => IMAGE_RE.test(f.file.name))
    if (!image) return
    await onImportArt(files)
    // importArt writes to src/art/<relativePath>, so the stored uri is deterministic.
    choose(`src/art/${image.relativePath}`)
  }
  const switchKind = (next: AppearanceKind): void => {
    if (next === 'shape') {
      setWantsImage(false)
      setPicking(false)
      if (appearanceKind(comp) === 'image') onSetShape?.()
    } else if (kind === 'shape') {
      setWantsImage(true)
    }
  }
  return { kind, picking, setPicking, choose, importImage, switchKind }
}

export function AppearanceSection(props: AppearanceSectionProps) {
  const { comp } = props
  const { kind, picking, setPicking, choose, importImage, switchKind } = useAppearanceChoice(props)
  const texture = typeof comp.props?.texture === 'string' ? comp.props.texture : ''
  const drop = useTextureDrop(props.art, choose, importImage)
  const frame = useFrameSize(
    comp,
    kind === 'image' && texture ? props.urlFor(texture) : null,
    props.pixelsPerUnit,
  )

  return (
    <div className="ed-section">
      <header className="ed-sec-head">
        <span>Appearance</span>
        <ComponentUpdateSchedule type={comp.type} />
        <ViewportVisibilityButton
          label="Appearance"
          visible={props.viewportVisible}
          onChange={props.onViewportVisibleChange}
        />
      </header>
      {props.onSetShape && <AppearanceTypeRow kind={kind} onChange={switchKind} />}
      {kind === 'shape' && <ShapeRow comp={comp} onProp={props.onProp} />}
      {kind === 'image' && (!texture || picking) ? (
        <TexturePicker
          art={props.art}
          hasTexture={texture !== ''}
          {...drop}
          onPick={choose}
          onKeep={() => setPicking(false)}
          onImport={importImage}
        />
      ) : (
        <AppearanceDetails
          {...props}
          kind={kind}
          texture={texture}
          frame={frame}
          drop={drop}
          onChangeImage={() => setPicking(true)}
        />
      )}
    </div>
  )
}
