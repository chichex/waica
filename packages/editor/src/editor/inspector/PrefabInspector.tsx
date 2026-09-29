import type { PrefabJson, SceneComponentJson } from '@waica/engine'
import { useArchetype, type ArchetypeManifest } from '../../project/archetype'
import { CHASSIS, splitComponents } from '../../project/chassis'
import type { MachineProps } from '../../project/states'
import { TilemapCard } from '../TilemapCard'
import type { ArtItem, DroppedFile } from '../use-project-art'
import type { ViewportComponentVisibility } from '../Viewport'
import { AppearanceSection } from './AppearanceSection'
import { BehavioursSection } from './BehavioursSection'
import { CollisionSection } from './CollisionSection'
import { characterClipsWarning, clipsOf, driverWarning, touchBehaviourNames } from './component-meta'
import { UpdateScheduleContext, UpdateScheduleError, updateScheduleFor } from './update-schedule'

/** The prefab inspector's callbacks, already bound to the selected prefab ref. */
export interface PrefabInspectorProps {
  refName: string
  prefab: PrefabJson
  art: ArtItem[]
  urlFor: (uri: string) => string
  onImportArt: (files: DroppedFile[]) => Promise<void>
  viewportVisibility: ViewportComponentVisibility
  onViewportVisibility: (role: keyof ViewportComponentVisibility, visible: boolean) => void
  onProp: (componentType: string, key: string, value: unknown) => void
  onAdd: (type: string) => void
  onRemove: (type: string) => void
  onToggleAnimated: () => void
  onSetTexture: (uri: string) => void
  onSetShape: () => void
  onSetCollision: (enabled: boolean) => void
  onEditAnimation: () => void
  stateFiles: string[]
  roleFiles: string[]
  onMachinePatch: (patch: Partial<MachineProps>) => void
  onCreateRoleFile: (role: string) => void
  onEditState: (state: string) => void
  pixelsPerUnit: number
  onSetSize: (componentType: string, size: { width: number; height: number }) => void
}

/** What the Collision section says when a prefab has no collider. */
function collisionOffHint(prefab: PrefabJson, archetype: ArchetypeManifest): string {
  if (CHASSIS[prefab.type].collision?.type === 'Solid') return 'no collision — this tile is decor'
  const touching = touchBehaviourNames(splitComponents(prefab.components).behaviours, archetype)
  return touching.length
    ? `no hitbox — ${touching.join('/')} won't react`
    : 'no hitbox — this object is decorative'
}

function PrefabAppearance({
  appearance,
  ...props
}: PrefabInspectorProps & { appearance: SceneComponentJson }) {
  const { prefab, onProp, onSetSize } = props
  return (
    <AppearanceSection
      key={props.refName}
      id={props.refName}
      comp={appearance}
      viewportVisible={props.viewportVisibility.appearance}
      onViewportVisibleChange={(visible) => props.onViewportVisibility('appearance', visible)}
      clipsWarning={
        prefab.type === 'character'
          ? characterClipsWarning(appearance, prefab.components)
          : undefined
      }
      art={props.art}
      urlFor={props.urlFor}
      onImportArt={props.onImportArt}
      onSetTexture={props.onSetTexture}
      onSetShape={props.onSetShape}
      onProp={(key, value) => onProp(appearance.type, key, value)}
      onToggleAnimated={props.onToggleAnimated}
      onEditAnimation={appearance.type === 'AnimatedSprite' ? props.onEditAnimation : undefined}
      pixelsPerUnit={props.pixelsPerUnit}
      onSetSize={(size) => onSetSize(appearance.type, size)}
    />
  )
}

function PrefabCollision(props: PrefabInspectorProps) {
  const archetype = useArchetype()
  const { prefab, onProp } = props
  const collision = CHASSIS[prefab.type].collision
  if (!collision) return null
  return (
    <CollisionSection
      id={props.refName}
      comp={splitComponents(prefab.components).collision}
      label={collision.type.toLowerCase()}
      viewportVisible={props.viewportVisibility.collision}
      onViewportVisibleChange={(visible) => props.onViewportVisibility('collision', visible)}
      offHint={collisionOffHint(prefab, archetype)}
      onProp={(key, value) => onProp(collision.type, key, value)}
      onToggle={collision.optional ? props.onSetCollision : undefined}
    />
  )
}

/** A prefab's tilemap: shape and tileset only — painting happens on scene instances. */
function PrefabTilemap({
  tilemap,
  refName,
  art,
  urlFor,
  onProp,
}: Pick<PrefabInspectorProps, 'refName' | 'art' | 'urlFor' | 'onProp'> & {
  tilemap: SceneComponentJson
}) {
  return (
    <TilemapCard
      id={refName}
      props={tilemap.props ?? {}}
      art={art}
      urlFor={urlFor}
      selectedTile={0}
      paint={false}
      brushEnabled={false}
      onProp={(key, value) => onProp('Tilemap', key, value)}
      onPickTexture={(uri) => onProp('Tilemap', 'texture', uri)}
      onSelectTile={() => {}}
      onPaint={() => {}}
    />
  )
}

function PrefabBehaviours(props: PrefabInspectorProps) {
  const archetype = useArchetype()
  const { prefab } = props
  const split = splitComponents(prefab.components)
  return (
    <BehavioursSection
      id={props.refName}
      comps={[...split.behaviours, ...split.extras].filter((comp) => comp.type !== 'Tilemap')}
      present={new Set(prefab.components.map((c) => c.type))}
      warning={driverWarning(prefab.components, archetype)}
      canRemove={() => true}
      machine={{
        clips: split.appearance ? Object.keys(clipsOf(split.appearance)) : [],
        stateFiles: props.stateFiles,
        roleFiles: props.roleFiles,
        onPatch: props.onMachinePatch,
        onCreateRoleFile: props.onCreateRoleFile,
        onEditState: props.onEditState,
      }}
      onProp={props.onProp}
      onRemove={props.onRemove}
      onAdd={props.onAdd}
    />
  )
}

export function PrefabInspector(props: PrefabInspectorProps) {
  const archetype = useArchetype()
  const { refName, prefab } = props
  // Appearance/Tilemap pick a texture, never a sound.
  const imageArt = props.art.filter((item) => item.kind === 'image')
  const appearance = splitComponents(prefab.components).appearance
  const tilemap = prefab.components.find((component) => component.type === 'Tilemap')
  const updateSchedule = updateScheduleFor(refName, prefab.components, archetype.registry.components)
  return (
    <UpdateScheduleContext.Provider value={updateSchedule}>
      <div className="ed-pad">
        <UpdateScheduleError schedule={updateSchedule} />
        {appearance && <PrefabAppearance {...props} art={imageArt} appearance={appearance} />}
        <PrefabCollision {...props} />
        {tilemap && <PrefabTilemap {...props} art={imageArt} tilemap={tilemap} />}
        <PrefabBehaviours {...props} />
      </div>
    </UpdateScheduleContext.Provider>
  )
}
