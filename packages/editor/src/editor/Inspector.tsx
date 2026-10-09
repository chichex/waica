import { useArchetype } from '../project/archetype'
import { countOverrides } from '../scene/ops'
import { CameraInspector } from './inspector/CameraInspector'
import { ContextHeader, contextOf } from './inspector/ContextHeader'
import { EntityInspector } from './inspector/EntityInspector'
import type { InspectorProps, InspectorSelection } from './inspector/inspector-props'
import { MultiInspector } from './inspector/MultiInspector'
import { PrefabInspector } from './inspector/PrefabInspector'
import { RoRow } from './inspector/PropRow'
import { RefTargetsContext, referenceContextFor } from './inspector/ref-targets-context'
import { SceneInspector } from './inspector/SceneInspector'
import { ScriptInspector } from './inspector/ScriptInspector'

export type { AnimTarget, InspectorSelection } from './inspector/inspector-props'
export { componentDefaults, componentKeys } from './inspector/component-meta'

type Selected<K extends NonNullable<InspectorSelection>['kind']> = Extract<
  NonNullable<InspectorSelection>,
  { kind: K }
>

/** Reset all / Apply all, offered on a prefab instance that has overrides. */
function InstanceOverrideActions({
  entityName,
  onResetAllProps,
  onApplyAllProps,
}: Pick<InspectorProps, 'onResetAllProps' | 'onApplyAllProps'> & { entityName: string }) {
  return (
    <>
      <button
        title="Clear every override — this instance goes back to the prefab's values"
        onClick={() => onResetAllProps(entityName)}
      >
        ↺ Reset all
      </button>
      <button
        className="is-apply"
        title="Write every override into the prefab — all instances get these values"
        onClick={() => onApplyAllProps(entityName)}
      >
        ⤒ Apply all
      </button>
    </>
  )
}

/** Binds the prefab inspector's edits to the selected prefab ref. */
function PrefabSelectionInspector({
  selection,
  ...props
}: InspectorProps & { selection: Selected<'prefab'> }) {
  const ref = selection.ref
  return (
    <PrefabInspector
      refName={ref}
      prefab={selection.prefab}
      art={props.art}
      urlFor={props.urlFor}
      onImportArt={props.onImportArt}
      viewportVisibility={props.viewportVisibility}
      onViewportVisibility={props.onViewportVisibility}
      onProp={(type, key, value) => props.onPrefabProp(ref, type, key, value)}
      onAdd={(type) => props.onPrefabAddComponent(ref, type)}
      onRemove={(type) => props.onPrefabRemoveComponent(ref, type)}
      onToggleAnimated={() => props.onPrefabToggleAnimated(ref)}
      onSetTexture={(uri) => props.onPrefabSetTexture(ref, uri)}
      onSetShape={() => props.onPrefabSetShape(ref)}
      onSetCollision={(enabled) => props.onPrefabSetCollision(ref, enabled)}
      onEditAnimation={() => props.onEditAnimation({ kind: 'prefab', ref })}
      stateFiles={props.stateFiles}
      roleFiles={props.roleFiles}
      onMachinePatch={(patch) => props.onPrefabMachinePatch(ref, patch)}
      onCreateRoleFile={props.onCreateRoleFile}
      onEditState={(state) => props.onEditState({ kind: 'prefab', ref, state })}
      pixelsPerUnit={props.pixelsPerUnit}
      onSetSize={(type, size) => props.onPrefabSizeAppearance(ref, type, size)}
    />
  )
}

/** The editor body for the selected kind, below the context header. */
function SelectionBody({
  selection,
  ...props
}: InspectorProps & { selection: NonNullable<InspectorSelection> }) {
  switch (selection.kind) {
    case 'scene':
      return <SceneInspector scene={selection.scene} onRenderProp={props.onRenderProp} />
    case 'entity':
      return <EntityInspector {...props} entity={selection.entity} space={selection.space} />
    case 'multi':
      return (
        <MultiInspector
          entities={selection.entities}
          prefabs={props.prefabs}
          onMultiProp={props.onMultiProp}
        />
      )
    case 'camera':
      return (
        <CameraInspector
          camera={selection.camera}
          entityNames={selection.entityNames}
          space={selection.space}
          onProp={props.onCameraProp}
          pixelsPerUnit={props.pixelsPerUnit}
          resolution={props.resolution}
        />
      )
    case 'prefab':
      return <PrefabSelectionInspector {...props} selection={selection} />
    case 'ui':
      return (
        <div className="ed-pad">
          <div className="ed-hint">
            a UI piece is plain HTML: markup, styles and {'{{stat}}'} bindings — presentation
            only. Scenes list the pieces they start with; code toggles them with
            game.ui.show / hide / toggle.
          </div>
        </div>
      )
    case 'script':
      return <ScriptInspector name={selection.name} />
    case 'controls':
    case 'stats':
    case 'game':
      return <div className="ed-hint ed-pad">edited in the center pane</div>
    case 'art':
      return (
        <div className="ed-pad">
          <RoRow
            label="size"
            value={selection.dims ? `${selection.dims[0]} × ${selection.dims[1]} px` : '…'}
          />
        </div>
      )
  }
}

export function Inspector(props: InspectorProps) {
  const archetype = useArchetype()
  const { selection } = props
  return (
    <RefTargetsContext.Provider value={referenceContextFor(props)}>
      <section className="ed-panel ed-inspector">
        <header className="ed-panel-head">Inspector</header>
        {selection == null ? (
          <div className="ed-hint ed-pad">nothing selected</div>
        ) : (
          <>
            <ContextHeader
              ctx={contextOf(selection, props.prefabs, archetype)}
              actions={
                selection.kind === 'entity' &&
                countOverrides(selection.entity) > 0 && (
                  <InstanceOverrideActions {...props} entityName={selection.entity.name} />
                )
              }
            />
            <SelectionBody {...props} selection={selection} />
          </>
        )}
      </section>
    </RefTargetsContext.Provider>
  )
}
