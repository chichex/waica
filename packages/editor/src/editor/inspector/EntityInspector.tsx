import {
  resolveSceneCamera,
  type PrefabJson,
  type SceneComponentJson,
  type SceneEntityJson,
} from '@waica/engine'
import { useArchetype } from '../../project/archetype'
import { CHASSIS, splitComponents } from '../../project/chassis'
import { prefabOwns, resolveComponents } from '../../scene/ops'
import { cameraViewSize } from '../box-math'
import { TilemapCard } from '../TilemapCard'
import { AppearanceSection } from './AppearanceSection'
import { BehavioursSection } from './BehavioursSection'
import { CollisionSection, InlineCollisionSection } from './CollisionSection'
import { EntityIdentityRows, InstanceChip } from './EntityIdentity'
import { characterClipsWarning, clipsOf, driverWarning } from './component-meta'
import type { InspectorProps } from './inspector-props'
import { UpdateScheduleContext, UpdateScheduleError, updateScheduleFor } from './update-schedule'

export type EntityInspectorProps = Omit<
  InspectorProps,
  | 'selection'
  | 'onPrefabProp'
  | 'onPrefabAddComponent'
  | 'onPrefabRemoveComponent'
  | 'onPrefabToggleAnimated'
  | 'onPrefabSetTexture'
  | 'onPrefabSetShape'
  | 'onPrefabSetCollision'
  | 'onPrefabSizeAppearance'
> & {
  entity: SceneEntityJson
}

/** Instance-override readers and writers for one entity's components. */
function instanceOverrides(
  entity: SceneEntityJson,
  onResetProp: InspectorProps['onResetProp'],
  onApplyProp: InspectorProps['onApplyProp'],
) {
  return {
    overridesOf: (type: string) => new Set(Object.keys(entity.overrides?.[type] ?? {})),
    resetOf: (type: string) => (key: string) => onResetProp(entity.name, type, key),
    applyOf: (type: string) => (key: string) => onApplyProp(entity.name, type, key),
  }
}

function EntityAppearance({
  appearance,
  components,
  prefab,
  ...props
}: EntityInspectorProps & {
  appearance: SceneComponentJson
  components: SceneComponentJson[]
  prefab: PrefabJson | undefined
}) {
  const { entity, prefabs, onSizeAppearance } = props
  const [x, y] = entity.position ?? [0, 0]
  const { overridesOf, resetOf, applyOf } = instanceOverrides(
    entity,
    props.onResetProp,
    props.onApplyProp,
  )
  const fillCamera = (): void => {
    const cam = resolveSceneCamera(props.sceneCamera)
    const view = cameraViewSize(cam.zoom, props.resolution.width / props.resolution.height)
    onSizeAppearance(entity.name, appearance.type, {
      ...view,
      offsetX: Math.round((cam.position[0] - x) * 100) / 100,
      offsetY: Math.round((cam.position[1] - y) * 100) / 100,
    })
  }
  const editAnimation = (): void =>
    props.onEditAnimation(
      entity.prefab && prefabOwns(entity, appearance.type, prefabs)
        ? { kind: 'prefab', ref: entity.prefab }
        : { kind: 'entity', name: entity.name },
    )
  return (
    <AppearanceSection
      key={entity.name}
      id={entity.name}
      comp={appearance}
      viewportVisible={props.viewportVisibility.appearance}
      onViewportVisibleChange={(visible) => props.onViewportVisibility('appearance', visible)}
      overridden={overridesOf(appearance.type)}
      clipsWarning={
        prefab?.type === 'character' ? characterClipsWarning(appearance, components) : undefined
      }
      art={props.art}
      urlFor={props.urlFor}
      onImportArt={props.onImportArt}
      onSetTexture={(uri) => props.onSetTexture(entity.name, appearance.type, uri)}
      onProp={(key, value) => props.onProp(entity.name, appearance.type, key, value)}
      onReset={resetOf(appearance.type)}
      onApply={applyOf(appearance.type)}
      pixelsPerUnit={props.pixelsPerUnit}
      onSetSize={(size) => onSizeAppearance(entity.name, appearance.type, size)}
      onFillCamera={fillCamera}
      onEditAnimation={appearance.type === 'AnimatedSprite' ? editAnimation : undefined}
    />
  )
}

/** Prefab instances keep the prefab's collision kind; inline entities pick theirs. */
function EntityCollision({
  collision,
  prefab,
  ...props
}: EntityInspectorProps & {
  collision: SceneComponentJson | null
  prefab: PrefabJson | undefined
}) {
  const { entity, viewportVisibility, onViewportVisibility } = props
  const onProp = (key: string, value: unknown) =>
    collision && props.onProp(entity.name, collision.type, key, value)
  if (!prefab) {
    return (
      <InlineCollisionSection
        id={entity.name}
        comp={collision}
        viewportVisible={viewportVisibility.collision}
        onViewportVisibleChange={(visible) => onViewportVisibility('collision', visible)}
        onProp={onProp}
        onSet={(type) => props.onSetEntityCollision(entity.name, type)}
      />
    )
  }
  const rule = CHASSIS[prefab.type]
  if (!rule.collision) return null
  const { overridesOf, resetOf, applyOf } = instanceOverrides(
    entity,
    props.onResetProp,
    props.onApplyProp,
  )
  return (
    <CollisionSection
      id={entity.name}
      comp={collision}
      label={rule.collision.type.toLowerCase()}
      viewportVisible={viewportVisibility.collision}
      onViewportVisibleChange={(visible) => onViewportVisibility('collision', visible)}
      overridden={collision ? overridesOf(collision.type) : undefined}
      offHint="no collision — defined by the prefab"
      onProp={onProp}
      onReset={collision ? resetOf(collision.type) : undefined}
      onApply={collision ? applyOf(collision.type) : undefined}
    />
  )
}

/** The entity's tilemap, painting through the editor-wide brush. */
function EntityTilemap({
  tilemap,
  entity,
  art,
  urlFor,
  tilemapBrush,
  onTilemapBrush,
  onProp,
  onSetTexture,
}: Pick<
  EntityInspectorProps,
  'entity' | 'art' | 'urlFor' | 'tilemapBrush' | 'onTilemapBrush' | 'onProp' | 'onSetTexture'
> & { tilemap: SceneComponentJson }) {
  const activeBrush = tilemapBrush?.entity === entity.name ? tilemapBrush : null
  return (
    <TilemapCard
      id={entity.name}
      props={tilemap.props ?? {}}
      art={art}
      urlFor={urlFor}
      selectedTile={activeBrush?.tile ?? 0}
      paint={activeBrush?.paint ?? false}
      onProp={(key, value) => onProp(entity.name, 'Tilemap', key, value)}
      onPickTexture={(uri) => onSetTexture(entity.name, 'Tilemap', uri)}
      onSelectTile={(tile) =>
        onTilemapBrush?.({ entity: entity.name, tile, paint: activeBrush?.paint ?? false })
      }
      onPaint={(paint) =>
        onTilemapBrush?.({ entity: entity.name, tile: activeBrush?.tile ?? 0, paint })
      }
    />
  )
}

function EntityBehaviours({
  components,
  ...props
}: EntityInspectorProps & { components: SceneComponentJson[] }) {
  const archetype = useArchetype()
  const { entity, prefabs } = props
  const split = splitComponents(components)
  // State structure is shared truth: edits land on the prefab when it
  // owns the machine (like the animation editor), else on the entity.
  const machineRef = entity.prefab && prefabOwns(entity, 'StateMachine', prefabs) ? entity.prefab : null
  return (
    <BehavioursSection
      id={entity.name}
      comps={[...split.behaviours, ...split.extras].filter((comp) => comp.type !== 'Tilemap')}
      present={new Set(components.map((c) => c.type))}
      warning={driverWarning(components, archetype)}
      canRemove={(c) => !prefabOwns(entity, c.type, prefabs)}
      machine={{
        clips: split.appearance ? Object.keys(clipsOf(split.appearance)) : [],
        stateFiles: props.stateFiles,
        roleFiles: props.roleFiles,
        onPatch: (patch) =>
          machineRef
            ? props.onPrefabMachinePatch(machineRef, patch)
            : props.onMachinePatch(entity.name, patch),
        onCreateRoleFile: props.onCreateRoleFile,
        onEditState: (state) =>
          props.onEditState(
            machineRef
              ? { kind: 'prefab', ref: machineRef, state }
              : { kind: 'entity', name: entity.name, state },
          ),
      }}
      overriddenFor={instanceOverrides(entity, props.onResetProp, props.onApplyProp).overridesOf}
      onProp={(type, key, value) => props.onProp(entity.name, type, key, value)}
      onRemove={(type) => props.onRemoveComponent(entity.name, type)}
      onAdd={(type) => props.onAddComponent(entity.name, type)}
      onReset={(type, key) => props.onResetProp(entity.name, type, key)}
      onApply={(type, key) => props.onApplyProp(entity.name, type, key)}
    />
  )
}

export function EntityInspector(props: EntityInspectorProps) {
  const archetype = useArchetype()
  const { entity, prefabs } = props
  // Appearance/Tilemap pick a texture, never a sound.
  const imageArt = props.art.filter((item) => item.kind === 'image')
  const components = resolveComponents(entity, prefabs)
  const prefab = entity.prefab ? prefabs[entity.prefab] : undefined
  const split = splitComponents(components)
  const tilemap = components.find((component) => component.type === 'Tilemap')
  const updateSchedule = updateScheduleFor(entity.name, components, archetype.registry.components)
  return (
    <UpdateScheduleContext.Provider value={updateSchedule}>
      <div className="ed-pad">
        <UpdateScheduleError schedule={updateSchedule} />
        <EntityIdentityRows {...props} />
        <InstanceChip {...props} />
        {split.appearance && (
          <EntityAppearance
            {...props}
            art={imageArt}
            appearance={split.appearance}
            components={components}
            prefab={prefab}
          />
        )}
        <EntityCollision {...props} collision={split.collision} prefab={prefab} />
        {tilemap && <EntityTilemap {...props} art={imageArt} tilemap={tilemap} />}
        <EntityBehaviours {...props} components={components} />
        <button className="ed-danger" onClick={() => props.onDelete(entity.name)}>
          🗑 Delete entity
        </button>
      </div>
    </UpdateScheduleContext.Provider>
  )
}
