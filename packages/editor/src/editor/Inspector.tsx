import { useRef, useState } from 'react'
import { resolveSceneCamera, type PrefabJson, type SceneCameraJson, type SceneComponentJson, type SceneEntityJson, type SceneJson, type StateJson } from '@waica/engine'
import { ACTIVE_ARCHETYPE } from '../project/archetype'
import { countOverrides, prefabOwns, resolveComponents } from '../scene/ops'
import { appearanceKind, behaviourTypes, CHASSIS, splitComponents } from '../project/chassis'
import type { MachineProps } from '../project/states'
import { entityIcon, prefabIcon } from './icons'
import { StateMachineCard, type StateTarget } from './StateMachinePanel'
import { IMAGE_RE, type ArtItem } from './use-project-art'
import type { ClipDef, ParamSpec } from '@waica/engine'

/** What the inspector is editing, mirroring the explorer view. */
export type InspectorSelection =
  | { kind: 'scene'; name: string; scene: SceneJson }
  | { kind: 'entity'; entity: SceneEntityJson; sceneName: string }
  | { kind: 'multi'; entities: SceneEntityJson[]; sceneName: string }
  | { kind: 'camera'; camera: SceneCameraJson | undefined; entityNames: string[] }
  | { kind: 'prefab'; ref: string; prefab: PrefabJson }
  | { kind: 'ui'; name: string }
  | { kind: 'script'; name: string }
  | { kind: 'art'; label: string; dims: [number, number] | null }
  | { kind: 'controls' }
  | { kind: 'stats' }
  | { kind: 'game' }
  | null

/** Whose AnimatedSprite the animation editor should open on. */
export type AnimTarget = { kind: 'prefab'; ref: string } | { kind: 'entity'; name: string }

function clipsOf(comp: SceneComponentJson): Record<string, ClipDef> {
  return (comp.props?.clips as Record<string, ClipDef> | undefined) ?? {}
}

/**
 * Clips the character's states expect but its sprite is missing, as an
 * inline warning. Each StateMachine state plays the clip of its own name
 * (or its `clip` override) on enter.
 */
function characterClipsWarning(
  appearance: SceneComponentJson,
  components: SceneComponentJson[],
): string | undefined {
  const machine = components.find((c) => c.type === 'StateMachine')
  const states = (machine?.props?.states ?? {}) as Record<string, StateJson | undefined>
  const clips = new Set(Object.keys(clipsOf(appearance)))
  const missing = Object.entries(states)
    .filter(([name]) => name !== '*')
    .map(([name, state]) => state?.clip ?? name)
    .filter((clip) => !clips.has(clip))
  return missing.length ? `missing clips: ${[...new Set(missing)].join(', ')}` : undefined
}

interface Props {
  selection: InspectorSelection
  prefabs: Record<string, PrefabJson>
  /** The project's image library, for the appearance picker. */
  art: ArtItem[]
  urlFor(uri: string): string
  onImportArt(files: File[]): Promise<void>
  onRename(from: string, to: string): void
  onMove(name: string, position: [number, number]): void
  onProp(entity: string, componentType: string, key: string, value: unknown): void
  /** Clears one instance override so the prop falls back to the prefab's value. */
  onResetProp(entity: string, componentType: string, key: string): void
  /** Writes one override into the prefab (all instances) and clears it here. */
  onApplyProp(entity: string, componentType: string, key: string): void
  /** Clears every override on this instance. */
  onResetAllProps(entity: string): void
  /** Writes every override into the prefab and clears them here. */
  onApplyAllProps(entity: string): void
  onAddComponent(entity: string, type: string): void
  onRemoveComponent(entity: string, type: string): void
  onSetEntityCollision(entity: string, type: 'Hitbox' | 'Solid' | null): void
  /** Points an entity's appearance at a texture (instance override on prefabs). */
  onSetTexture(entity: string, componentType: string, uri: string): void
  onDelete(name: string): void
  onOpenPrefab(ref: string): void
  onPrefabProp(ref: string, componentType: string, key: string, value: unknown): void
  onPrefabAddComponent(ref: string, type: string): void
  onPrefabRemoveComponent(ref: string, type: string): void
  onPrefabToggleAnimated(ref: string): void
  onPrefabSetTexture(ref: string, uri: string): void
  /** Image -> shape swap: drops the texture and any clips. */
  onPrefabSetShape(ref: string): void
  onPrefabSetCollision(ref: string, enabled: boolean): void
  onEditAnimation(target: AnimTarget): void
  /** Sets one prop of the open scene's camera block (undefined deletes it). */
  onCameraProp(key: string, value: unknown): void
  /** Basenames in src/states/ — the state code files the editor can see. */
  stateFiles: string[]
  /** StateMachine props patch on an entity's own component (inline entities). */
  onMachinePatch(entity: string, patch: Partial<MachineProps>): void
  /** StateMachine props patch on a prefab — reaches every instance. */
  onPrefabMachinePatch(ref: string, patch: Partial<MachineProps>): void
  /** Opens the state editor modal. */
  onEditState(target: StateTarget): void
}

function componentKeys(comp: SceneComponentJson): string[] {
  const Class = ACTIVE_ARCHETYPE.registry.components[comp.type]
  const declared = Object.keys(Class?.params ?? {})
  return [...new Set([...Object.keys(comp.props ?? {}), ...declared])]
}

/** Friendly component name for headers and pickers ("Motor", not "PlatformerMotor"). */
function componentLabel(type: string): string {
  return ACTIVE_ARCHETYPE.registry.components[type]?.displayName ?? type
}

// Unset params show the class defaults (what the game actually runs), so
// their value AND type match reality — e.g. a boolean renders as a checkbox.
function componentDefaults(comp: SceneComponentJson): Record<string, unknown> {
  const Class = ACTIVE_ARCHETYPE.registry.components[comp.type]
  return (Class ? new Class() : {}) as unknown as Record<string, unknown>
}

/** Behaviours present that implement onCollide — they need a hitbox to fire. */
function touchBehaviourNames(comps: SceneComponentJson[]): string[] {
  return comps
    .map((c) => c.type)
    .filter((t) => {
      const Class = ACTIVE_ARCHETYPE.registry.components[t] as
        | { prototype: Record<string, unknown> }
        | undefined
      return typeof Class?.prototype.onCollide === 'function'
    })
}

/** Where a change lands, shown as a colored banner at the top of the inspector. */
interface InspectorContext {
  icon: string
  name: string
  badge: string
  scope?: string
  tone: 'scene' | 'prefab' | 'ui' | 'neutral'
}

function contextOf(
  selection: NonNullable<InspectorSelection>,
  prefabs: Record<string, PrefabJson>,
): InspectorContext {
  switch (selection.kind) {
    case 'scene':
      return {
        icon: '🎬',
        name: selection.name,
        badge: 'scene',
        scope: 'the world the game loads — click an entity to edit it',
        tone: 'scene',
      }
    case 'entity': {
      const e = selection.entity
      return {
        icon: entityIcon(e, prefabs),
        name: e.name,
        badge: e.prefab ? 'instance' : 'entity',
        scope: e.prefab
          ? `changes affect only this instance in "${selection.sceneName}" — the prefab stays untouched`
          : `one-off entity — lives only in "${selection.sceneName}"`,
        tone: 'scene',
      }
    }
    case 'multi':
      return {
        icon: '▣',
        name: `${selection.entities.length} entities`,
        badge: 'selection',
        scope: `selected in "${selection.sceneName}" — drag, duplicate or delete them together`,
        tone: 'scene',
      }
    case 'camera':
      return {
        icon: '🎥',
        name: 'Camera',
        badge: 'scene camera',
        scope: 'built-in — this frame is what the player sees when the game runs',
        tone: 'scene',
      }
    case 'prefab':
      return {
        icon: prefabIcon(selection.ref.slice(selection.ref.indexOf('/') + 1)),
        name: selection.ref.slice(selection.ref.indexOf('/') + 1),
        badge: `${selection.prefab.type} prefab`,
        scope: 'shared blueprint — changes here reach every instance in every scene',
        tone: 'prefab',
      }
    case 'ui':
      return {
        icon: '🧩',
        name: selection.name,
        badge: 'ui piece',
        scope: 'HTML drawn over the game while it plays',
        tone: 'ui',
      }
    case 'script':
      return {
        icon: '📜',
        name: selection.name,
        badge: 'built-in script',
        scope: 'read-only — its params appear wherever the script is used',
        tone: 'neutral',
      }
    case 'art':
      return { icon: '🖼️', name: selection.label, badge: 'image', tone: 'neutral' }
    case 'controls':
      return {
        icon: '🎮',
        name: 'controls',
        badge: 'project',
        scope: 'which keys fire each action — applies to every scene',
        tone: 'neutral',
      }
    case 'stats':
      return {
        icon: '📊',
        name: 'stats',
        badge: 'project',
        scope: 'what the game keeps track of while playing — shared by every scene',
        tone: 'neutral',
      }
    case 'game':
      return {
        icon: '🕹️',
        name: 'game',
        badge: 'project',
        scope: 'global settings of the shipped game',
        tone: 'neutral',
      }
  }
}

function ContextHeader({ ctx, actions }: { ctx: InspectorContext; actions?: React.ReactNode }) {
  return (
    <div className={`ed-ins-ctx is-${ctx.tone}`}>
      <div className="ed-ins-ctx-title">
        <span className="ed-x-ico">{ctx.icon}</span>
        <span className="ed-ins-ctx-name">{ctx.name}</span>
        <span className="ed-ins-ctx-badge">{ctx.badge}</span>
      </div>
      {ctx.scope && <div className="ed-ins-ctx-scope">{ctx.scope}</div>}
      {actions && <div className="ed-ins-ctx-actions">{actions}</div>}
    </div>
  )
}

function PropRow({
  label,
  value,
  spec,
  overridden = false,
  onChange,
  onReset,
  onApply,
}: {
  /** The raw prop key; shown as-is unless the spec declares a friendly label. */
  label: string
  value: unknown
  /** Inspector metadata declared by the component class (label, range). */
  spec?: ParamSpec
  /** Instance override on top of the prefab value: marked with a dot. */
  overridden?: boolean
  onChange(value: unknown): void
  /** Clears the override (shown only while overridden). */
  onReset?(): void
  /** Pushes the override into the prefab (shown only while overridden). */
  onApply?(): void
}) {
  // Rows are <label>s: stop clicks on these buttons from activating the input.
  const press = (fn: () => void) => (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    fn()
  }
  const name = (
    <span>
      {spec?.label ?? label}
      {overridden && <i className="ed-dot" title="overridden on this instance" />}
      {overridden && onReset && (
        <button className="ed-reset" title="Reset to the prefab's value" onClick={press(onReset)}>
          ↺
        </button>
      )}
      {overridden && onApply && (
        <button
          className="ed-reset ed-apply"
          title="Apply to the prefab — every instance gets this value"
          onClick={press(onApply)}
        >
          ⤒
        </button>
      )}
    </span>
  )
  if (typeof value === 'boolean') {
    return (
      <label className="ed-row">
        {name}
        <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} />
      </label>
    )
  }
  if (typeof value === 'number' && label === 'color') {
    const hex = `#${Math.max(0, value).toString(16).padStart(6, '0')}`
    return (
      <label className="ed-row">
        {name}
        <input
          type="color"
          value={hex}
          onChange={(e) => onChange(parseInt(e.target.value.slice(1), 16))}
        />
      </label>
    )
  }
  if (typeof value === 'number' && spec?.min !== undefined && spec?.max !== undefined) {
    return (
      <label className="ed-row ed-row-slider">
        {name}
        <input
          type="range"
          min={spec.min}
          max={spec.max}
          step={spec.step ?? 0.1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <input
          type="number"
          step={spec.step ?? 0.1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </label>
    )
  }
  if (typeof value === 'number') {
    return (
      <label className="ed-row">
        {name}
        <input
          type="number"
          step={0.1}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
      </label>
    )
  }
  if (typeof value === 'string') {
    return (
      <label className="ed-row">
        {name}
        <input type="text" value={value} onChange={(e) => onChange(e.target.value)} />
      </label>
    )
  }
  return (
    <div className="ed-row">
      {name}
      <code className="ed-obj">{'{…}'}</code>
    </div>
  )
}

function RoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="ed-row">
      <span>{label}</span>
      <span className="ed-ro">{value}</span>
    </div>
  )
}

function ComponentRows({
  id,
  comp,
  keys,
  overridden,
  onProp,
  onReset,
  onApply,
}: {
  /** Key prefix so React inputs reset when the owner changes. */
  id: string
  comp: SceneComponentJson
  keys: string[]
  overridden?: Set<string>
  onProp(key: string, value: unknown): void
  onReset?(key: string): void
  onApply?(key: string): void
}) {
  const defaults = componentDefaults(comp)
  const specs = ACTIVE_ARCHETYPE.registry.components[comp.type]?.params ?? {}
  return (
    <>
      {keys.map((key) => (
        <PropRow
          key={`${id}.${comp.type}.${key}`}
          label={key}
          spec={specs[key]}
          value={(comp.props ?? {})[key] ?? defaults[key] ?? 0}
          overridden={overridden?.has(key)}
          onChange={(value) => onProp(key, value)}
          onReset={onReset && (() => onReset(key))}
          onApply={onApply && (() => onApply(key))}
        />
      ))}
    </>
  )
}

function ComponentCard({
  id,
  comp,
  overridden,
  onProp,
  onRemove,
  onReset,
  onApply,
}: {
  id: string
  comp: SceneComponentJson
  overridden?: Set<string>
  onProp(key: string, value: unknown): void
  /** Absent = locked (prefab-owned behaviours, the ui chassis widget). */
  onRemove?(): void
  onReset?(key: string): void
  onApply?(key: string): void
}) {
  const keys = componentKeys(comp)
  return (
    <div className="ed-comp">
      <header
        className="ed-comp-head"
        title={onRemove ? undefined : 'defined by the prefab — edit the prefab to change it'}
      >
        <span>{componentLabel(comp.type)}</span>
        {onRemove && (
          <button className="ed-mini" title="Remove component" onClick={onRemove}>
            ✕
          </button>
        )}
      </header>
      {keys.length === 0 && <div className="ed-hint">no parameters</div>}
      <ComponentRows
        id={id}
        comp={comp}
        keys={keys}
        overridden={overridden}
        onProp={onProp}
        onReset={onReset}
        onApply={onApply}
      />
    </div>
  )
}

/** Raw AnimatedSprite props managed by the animation editor, not shown as rows. */
const ANIMATION_KEYS = new Set(['clips', 'cols', 'rows', 'initialClip', 'current'])

function AppearanceSection({
  id,
  comp,
  overridden,
  clipsWarning,
  art,
  urlFor,
  onImportArt,
  onProp,
  onSetTexture,
  onSetShape,
  onToggleAnimated,
  onEditAnimation,
  onReset,
  onApply,
}: {
  id: string
  comp: SceneComponentJson
  overridden?: Set<string>
  /** State-graph gaps shown inline (characters). */
  clipsWarning?: string
  art: ArtItem[]
  urlFor(uri: string): string
  onImportArt(files: File[]): Promise<void>
  onProp(key: string, value: unknown): void
  onSetTexture(uri: string): void
  /** Present only at the prefab level: image <-> shape is structural. */
  onSetShape?(): void
  /** Present only at the prefab level: animated <-> static is structural. */
  onToggleAnimated?(): void
  /** Opens the animation editor (AnimatedSprite only). */
  onEditAnimation?(): void
  onReset?(key: string): void
  onApply?(key: string): void
}) {
  // "image with nothing dropped yet" isn't a storable state — a texture-less
  // Sprite reads as a shape — so the invite-to-drop phase lives here.
  const [wantsImage, setWantsImage] = useState(false)
  const [picking, setPicking] = useState(false)
  const [dropping, setDropping] = useState(false)
  const filePicker = useRef<HTMLInputElement>(null)

  const animated = comp.type === 'AnimatedSprite'
  const texture = typeof comp.props?.texture === 'string' ? comp.props.texture : ''
  const kind = wantsImage ? 'image' : appearanceKind(comp)
  const showPicker = kind === 'image' && (!texture || picking)
  const keys = componentKeys(comp).filter(
    (k) => !ANIMATION_KEYS.has(k) && k !== 'texture' && (kind === 'shape' || k !== 'color'),
  )

  const choose = (uri: string): void => {
    onSetTexture(uri)
    setPicking(false)
    setWantsImage(false)
  }

  const importImage = async (files: File[]): Promise<void> => {
    const image = files.find((f) => IMAGE_RE.test(f.name))
    if (!image) return
    await onImportArt(files)
    // importArt writes to src/art/<name>, so the stored uri is deterministic.
    choose(`src/art/${image.name}`)
  }

  const acceptsDrag = (e: React.DragEvent): boolean =>
    e.dataTransfer.types.includes('Files') || e.dataTransfer.types.includes('waica/art')
  const dragProps = {
    onDragOver: (e: React.DragEvent) => {
      if (!acceptsDrag(e)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      setDropping(true)
    },
    onDragLeave: () => setDropping(false),
    onDrop: (e: React.DragEvent) => {
      if (!acceptsDrag(e)) return
      e.preventDefault()
      setDropping(false)
      const uri = e.dataTransfer.getData('waica/art')
      if (uri) choose(uri)
      else void importImage([...e.dataTransfer.files])
    },
  }

  return (
    <div className="ed-section">
      <header className="ed-sec-head">Appearance</header>
      {onSetShape && (
        <label className="ed-row">
          <span>type</span>
          <select
            value={kind}
            onChange={(e) => {
              if (e.target.value === 'shape') {
                setWantsImage(false)
                setPicking(false)
                if (appearanceKind(comp) === 'image') onSetShape()
              } else if (kind === 'shape') {
                setWantsImage(true)
              }
            }}
          >
            <option value="shape">shape</option>
            <option value="image">image</option>
          </select>
        </label>
      )}
      {showPicker ? (
        <div className={`ed-anim-picker ${dropping ? 'is-dropping' : ''}`} {...dragProps}>
          <div className="ed-hint">Drag an image here, or pick one:</div>
          <div className="ed-anim-thumbs">
            {art.map((item) => (
              <button key={item.uri} className="ed-anim-thumb" onClick={() => choose(item.uri)}>
                <img src={item.url} alt={item.label} />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
          <button className="ed-mini" onClick={() => filePicker.current?.click()}>
            Import image…
          </button>
          {texture && (
            <button className="ed-mini" onClick={() => setPicking(false)}>
              Keep current image
            </button>
          )}
          <input
            ref={filePicker}
            type="file"
            accept=".png,.jpg,.jpeg"
            hidden
            onChange={(e) => {
              void importImage([...(e.currentTarget.files ?? [])])
              e.currentTarget.value = ''
            }}
          />
        </div>
      ) : (
        <>
          {kind === 'image' && (
            <>
              <div
                className={`ed-appear-preview ${dropping ? 'is-dropping' : ''}`}
                title="Click to change the image — or drop a new one on it"
                onClick={() => setPicking(true)}
                {...dragProps}
              >
                <img src={urlFor(texture)} alt={texture} />
                <span>
                  {art.find((a) => a.uri === texture)?.label ?? texture}
                  {overridden?.has('texture') && (
                    <i className="ed-dot" title="overridden on this instance" />
                  )}
                </span>
              </div>
              {onToggleAnimated && (
                <label className="ed-row">
                  <span>animated</span>
                  <input type="checkbox" checked={animated} onChange={onToggleAnimated} />
                </label>
              )}
            </>
          )}
          <ComponentRows
            id={id}
            comp={comp}
            keys={keys}
            overridden={overridden}
            onProp={onProp}
            onReset={onReset}
            onApply={onApply}
          />
          {animated && (
            <>
              {clipsWarning && <div className="ed-hint ed-warn">{clipsWarning}</div>}
              {onEditAnimation && (
                <button className="ed-wide" onClick={onEditAnimation}>
                  🎞 Edit animation…
                </button>
              )}
            </>
          )}
        </>
      )}
    </div>
  )
}

function CollisionSection({
  id,
  comp,
  label,
  overridden,
  offHint,
  onProp,
  onToggle,
  onReset,
  onApply,
}: {
  id: string
  comp: SceneComponentJson | null
  /** "solid" | "hitbox" — the chassis' collision kind. */
  label: string
  overridden?: Set<string>
  /** Shown when the collision is toggled off. */
  offHint: string
  onProp(key: string, value: unknown): void
  /** Present only where the chassis allows turning collision off (prefab level). */
  onToggle?(enabled: boolean): void
  onReset?(key: string): void
  onApply?(key: string): void
}) {
  return (
    <div className="ed-section">
      <header className="ed-sec-head">Collision</header>
      {onToggle && (
        <label className="ed-row">
          <span>{label}</span>
          <input
            type="checkbox"
            checked={comp != null}
            onChange={(e) => onToggle(e.target.checked)}
          />
        </label>
      )}
      {comp ? (
        <ComponentRows
          id={id}
          comp={comp}
          keys={['width', 'height']}
          overridden={overridden}
          onProp={onProp}
          onReset={onReset}
          onApply={onApply}
        />
      ) : (
        <div className="ed-hint">{offHint}</div>
      )}
    </div>
  )
}

/** Inline entities (no prefab) pick their collision kind directly. */
function InlineCollisionSection({
  id,
  comp,
  onProp,
  onSet,
}: {
  id: string
  comp: SceneComponentJson | null
  onProp(key: string, value: unknown): void
  onSet(type: 'Hitbox' | 'Solid' | null): void
}) {
  return (
    <div className="ed-section">
      <header className="ed-sec-head">Collision</header>
      <label className="ed-row">
        <span>type</span>
        <select
          value={comp?.type ?? 'none'}
          onChange={(e) => {
            const kind = e.target.value
            onSet(kind === 'none' ? null : (kind as 'Hitbox' | 'Solid'))
          }}
        >
          <option value="none">none</option>
          <option value="Hitbox">hitbox</option>
          <option value="Solid">solid</option>
        </select>
      </label>
      {comp && <ComponentRows id={id} comp={comp} keys={['width', 'height']} onProp={onProp} />}
    </div>
  )
}

/** Context the StateMachine card needs beyond the generic behaviour plumbing. */
interface MachineCardContext {
  clips: string[]
  stateFiles: string[]
  onPatch(patch: Partial<MachineProps>): void
  onEditState(state: string): void
}

function BehavioursSection({
  id,
  comps,
  present,
  canRemove,
  machine,
  overriddenFor,
  onProp,
  onRemove,
  onAdd,
  onReset,
  onApply,
}: {
  id: string
  comps: SceneComponentJson[]
  present: Set<string>
  canRemove(comp: SceneComponentJson): boolean
  machine?: MachineCardContext
  overriddenFor?(type: string): Set<string> | undefined
  onProp(type: string, key: string, value: unknown): void
  onRemove(type: string): void
  onAdd(type: string): void
  onReset?(type: string, key: string): void
  onApply?(type: string, key: string): void
}) {
  return (
    <div className="ed-section">
      <header className="ed-sec-head">Behaviours</header>
      {comps.length === 0 && <div className="ed-hint">no behaviours yet</div>}
      {comps.map((comp) =>
        comp.type === 'StateMachine' && machine ? (
          <StateMachineCard
            key={comp.type}
            comp={comp}
            clips={machine.clips}
            stateFiles={machine.stateFiles}
            onPatch={machine.onPatch}
            onEditState={machine.onEditState}
            onRemove={canRemove(comp) ? () => onRemove(comp.type) : undefined}
          />
        ) : (
          <ComponentCard
            key={comp.type}
            id={id}
            comp={comp}
            overridden={overriddenFor?.(comp.type)}
            onProp={(key, value) => onProp(comp.type, key, value)}
            onRemove={canRemove(comp) ? () => onRemove(comp.type) : undefined}
            onReset={onReset && ((key) => onReset(comp.type, key))}
            onApply={onApply && ((key) => onApply(comp.type, key))}
          />
        ),
      )}
      <AddComponentRow present={present} onAdd={onAdd} />
    </div>
  )
}

function AddComponentRow({ present, onAdd }: { present: Set<string>; onAdd(type: string): void }) {
  const [adding, setAdding] = useState('')
  const available = behaviourTypes(Object.keys(ACTIVE_ARCHETYPE.registry.components)).filter(
    (t) => !present.has(t),
  )
  return (
    <div className="ed-add-comp">
      <select value={adding} onChange={(e) => setAdding(e.target.value)}>
        <option value="">+ behaviour…</option>
        {available.map((t) => (
          <option key={t} value={t}>
            {componentLabel(t)}
          </option>
        ))}
      </select>
      <button
        className="ed-mini"
        disabled={!adding}
        onClick={() => {
          onAdd(adding)
          setAdding('')
        }}
      >
        add
      </button>
    </div>
  )
}

function EntityInspector({
  entity,
  prefabs,
  art,
  urlFor,
  onImportArt,
  onRename,
  onMove,
  onProp,
  onResetProp,
  onApplyProp,
  onAddComponent,
  onRemoveComponent,
  onSetEntityCollision,
  onSetTexture,
  onDelete,
  onOpenPrefab,
  onEditAnimation,
  stateFiles,
  onMachinePatch,
  onPrefabMachinePatch,
  onEditState,
}: Omit<
  Props,
  | 'selection'
  | 'onPrefabProp'
  | 'onPrefabAddComponent'
  | 'onPrefabRemoveComponent'
  | 'onPrefabToggleAnimated'
  | 'onPrefabSetTexture'
  | 'onPrefabSetShape'
  | 'onPrefabSetCollision'
> & {
  entity: SceneEntityJson
}) {
  const [x, y] = entity.position ?? [0, 0]
  const components = resolveComponents(entity, prefabs)
  const prefab = entity.prefab ? prefabs[entity.prefab] : undefined
  const rule = prefab ? CHASSIS[prefab.type] : undefined
  const split = splitComponents(components)
  const appearance = split.appearance
  const collision = split.collision
  const overridesOf = (type: string) => new Set(Object.keys(entity.overrides?.[type] ?? {}))
  const overrideCount = countOverrides(entity)
  const resetOf = (type: string) => (key: string) => onResetProp(entity.name, type, key)
  const applyOf = (type: string) => (key: string) => onApplyProp(entity.name, type, key)
  return (
    <div className="ed-pad">
      <label className="ed-row">
        <span>name</span>
        <input
          type="text"
          defaultValue={entity.name}
          key={entity.name}
          onBlur={(e) => {
            const next = e.target.value.trim()
            if (next && next !== entity.name) onRename(entity.name, next)
          }}
        />
      </label>
      <div className="ed-row ed-row-xy">
        <span>position</span>
        <input
          type="number"
          step={0.5}
          value={x}
          onChange={(e) => onMove(entity.name, [Number(e.target.value), y])}
        />
        <input
          type="number"
          step={0.5}
          value={y}
          onChange={(e) => onMove(entity.name, [x, Number(e.target.value)])}
        />
      </div>

      {entity.prefab && (
        <button
          className="ed-prefab-chip"
          title="Open this prefab"
          onClick={() => onOpenPrefab(entity.prefab as string)}
        >
          instance of {entity.prefab}
          {overrideCount > 0 && ` · ${overrideCount} override${overrideCount === 1 ? '' : 's'}`}
        </button>
      )}
      {overrideCount > 0 && (
        <div className="ed-hint">
          ● marks props changed here — ↺ resets to the prefab's value, ⤒ applies yours to the
          prefab
        </div>
      )}

      {appearance && (
        <AppearanceSection
          key={entity.name}
          id={entity.name}
          comp={appearance}
          overridden={overridesOf(appearance.type)}
          clipsWarning={
            prefab?.type === 'character'
              ? characterClipsWarning(appearance, components)
              : undefined
          }
          art={art}
          urlFor={urlFor}
          onImportArt={onImportArt}
          onSetTexture={(uri) => onSetTexture(entity.name, appearance.type, uri)}
          onProp={(key, value) => onProp(entity.name, appearance.type, key, value)}
          onReset={resetOf(appearance.type)}
          onApply={applyOf(appearance.type)}
          onEditAnimation={
            appearance.type === 'AnimatedSprite'
              ? () =>
                  onEditAnimation(
                    entity.prefab && prefabOwns(entity, appearance.type, prefabs)
                      ? { kind: 'prefab', ref: entity.prefab }
                      : { kind: 'entity', name: entity.name },
                  )
              : undefined
          }
        />
      )}

      {prefab
        ? rule?.collision && (
            <CollisionSection
              id={entity.name}
              comp={collision}
              label={rule.collision.type.toLowerCase()}
              overridden={collision ? overridesOf(collision.type) : undefined}
              offHint="no collision — defined by the prefab"
              onProp={(key, value) => collision && onProp(entity.name, collision.type, key, value)}
              onReset={collision ? resetOf(collision.type) : undefined}
              onApply={collision ? applyOf(collision.type) : undefined}
            />
          )
        : (
            <InlineCollisionSection
              id={entity.name}
              comp={collision}
              onProp={(key, value) => collision && onProp(entity.name, collision.type, key, value)}
              onSet={(type) => onSetEntityCollision(entity.name, type)}
            />
          )}

      <BehavioursSection
        id={entity.name}
        comps={[...split.behaviours, ...split.extras]}
        present={new Set(components.map((c) => c.type))}
        canRemove={(c) => !prefabOwns(entity, c.type, prefabs)}
        machine={{
          clips: appearance ? Object.keys(clipsOf(appearance)) : [],
          stateFiles,
          // State structure is shared truth: edits land on the prefab when it
          // owns the machine (like the animation editor), else on the entity.
          onPatch: (patch) =>
            entity.prefab && prefabOwns(entity, 'StateMachine', prefabs)
              ? onPrefabMachinePatch(entity.prefab, patch)
              : onMachinePatch(entity.name, patch),
          onEditState: (state) =>
            onEditState(
              entity.prefab && prefabOwns(entity, 'StateMachine', prefabs)
                ? { kind: 'prefab', ref: entity.prefab, state }
                : { kind: 'entity', name: entity.name, state },
            ),
        }}
        overriddenFor={overridesOf}
        onProp={(type, key, value) => onProp(entity.name, type, key, value)}
        onRemove={(type) => onRemoveComponent(entity.name, type)}
        onAdd={(type) => onAddComponent(entity.name, type)}
        onReset={(type, key) => onResetProp(entity.name, type, key)}
        onApply={(type, key) => onApplyProp(entity.name, type, key)}
      />

      <button className="ed-danger" onClick={() => onDelete(entity.name)}>
        🗑 Delete entity
      </button>
    </div>
  )
}

function PrefabInspector({
  refName,
  prefab,
  art,
  urlFor,
  onImportArt,
  onProp,
  onAdd,
  onRemove,
  onToggleAnimated,
  onSetTexture,
  onSetShape,
  onSetCollision,
  onEditAnimation,
  stateFiles,
  onMachinePatch,
  onEditState,
}: {
  refName: string
  prefab: PrefabJson
  art: ArtItem[]
  urlFor(uri: string): string
  onImportArt(files: File[]): Promise<void>
  onProp(componentType: string, key: string, value: unknown): void
  onAdd(type: string): void
  onRemove(type: string): void
  onToggleAnimated(): void
  onSetTexture(uri: string): void
  onSetShape(): void
  onSetCollision(enabled: boolean): void
  onEditAnimation(): void
  stateFiles: string[]
  onMachinePatch(patch: Partial<MachineProps>): void
  onEditState(state: string): void
}) {
  const rule = CHASSIS[prefab.type]
  const split = splitComponents(prefab.components)
  const appearance = split.appearance
  const touching = touchBehaviourNames(split.behaviours)
  const offHint =
    rule.collision?.type === 'Solid'
      ? 'no collision — this tile is decor'
      : touching.length
        ? `no hitbox — ${touching.join('/')} won't react`
        : 'no hitbox — this object is decorative'
  return (
    <div className="ed-pad">
      {appearance && (
        <AppearanceSection
          key={refName}
          id={refName}
          comp={appearance}
          clipsWarning={
            prefab.type === 'character'
              ? characterClipsWarning(appearance, prefab.components)
              : undefined
          }
          art={art}
          urlFor={urlFor}
          onImportArt={onImportArt}
          onSetTexture={onSetTexture}
          onSetShape={onSetShape}
          onProp={(key, value) => onProp(appearance.type, key, value)}
          onToggleAnimated={onToggleAnimated}
          onEditAnimation={appearance.type === 'AnimatedSprite' ? onEditAnimation : undefined}
        />
      )}
      {rule.collision && (
        <CollisionSection
          id={refName}
          comp={split.collision}
          label={rule.collision.type.toLowerCase()}
          offHint={offHint}
          onProp={(key, value) => rule.collision && onProp(rule.collision.type, key, value)}
          onToggle={rule.collision.optional ? onSetCollision : undefined}
        />
      )}
      <BehavioursSection
        id={refName}
        comps={[...split.behaviours, ...split.extras]}
        present={new Set(prefab.components.map((c) => c.type))}
        canRemove={() => true}
        machine={{
          clips: appearance ? Object.keys(clipsOf(appearance)) : [],
          stateFiles,
          onPatch: onMachinePatch,
          onEditState,
        }}
        onProp={onProp}
        onRemove={onRemove}
        onAdd={onAdd}
      />
    </div>
  )
}

/** Inspector metadata for the camera's tunable numbers (sliders). */
const CAMERA_SPECS: Record<string, ParamSpec> = {
  zoom: { label: 'Zoom (world height)', min: 2, max: 40, step: 0.5 },
  deadzoneWidth: { label: 'Deadzone width', min: 0, max: 10, step: 0.25 },
  deadzoneHeight: { label: 'Deadzone height', min: 0, max: 10, step: 0.25 },
  lookahead: { label: 'Lookahead', min: 0, max: 6, step: 0.25 },
  smoothing: { label: 'Smoothing', min: 1, max: 20, step: 0.5 },
}

/** Fresh limits when the user turns them on: roomy around the origin. */
const DEFAULT_LIMITS = { minX: -20, maxX: 20, minY: -12, maxY: 12 }

function CameraInspector({
  camera,
  entityNames,
  onProp,
}: {
  camera: SceneCameraJson | undefined
  entityNames: string[]
  onProp(key: string, value: unknown): void
}) {
  const cam = resolveSceneCamera(camera)
  const [x, y] = cam.position
  const slider = (key: 'zoom' | 'deadzoneWidth' | 'deadzoneHeight' | 'lookahead' | 'smoothing') => (
    <PropRow
      key={key}
      label={key}
      spec={CAMERA_SPECS[key]}
      value={cam[key]}
      onChange={(value) => onProp(key, value)}
    />
  )
  const limitRow = (key: keyof typeof DEFAULT_LIMITS, label: string) => (
    <label className="ed-row" key={key}>
      <span>{label}</span>
      <input
        type="number"
        step={0.5}
        value={cam.limits?.[key] ?? 0}
        onChange={(e) => onProp('limits', { ...cam.limits, [key]: Number(e.target.value) })}
      />
    </label>
  )
  return (
    <div className="ed-pad">
      {cam.follow ? (
        // Following: the camera rides its target, so a manual position would
        // be a lie — the game overrides it the moment play starts.
        <RoRow label="position" value={`on ${cam.follow}`} />
      ) : (
        <div className="ed-row ed-row-xy">
          <span>position</span>
          <input
            type="number"
            step={0.5}
            value={x}
            onChange={(e) => onProp('position', [Number(e.target.value), y])}
          />
          <input
            type="number"
            step={0.5}
            value={y}
            onChange={(e) => onProp('position', [x, Number(e.target.value)])}
          />
        </div>
      )}
      <div className="ed-section">
        <header className="ed-sec-head">Framing</header>
        {slider('zoom')}
      </div>
      <div className="ed-section">
        <header className="ed-sec-head">Follow</header>
        <label className="ed-row">
          <span>target</span>
          <select
            value={cam.follow}
            onChange={(e) => onProp('follow', e.target.value || undefined)}
          >
            <option value="">none — fixed camera</option>
            {entityNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        {cam.follow ? (
          <>
            {slider('deadzoneWidth')}
            {slider('deadzoneHeight')}
            {slider('lookahead')}
            {slider('smoothing')}
          </>
        ) : (
          <div className="ed-hint">pick a target and the camera will chase it while playing</div>
        )}
      </div>
      <div className="ed-section">
        <header className="ed-sec-head">Limits</header>
        <label className="ed-row">
          <span>limit the view</span>
          <input
            type="checkbox"
            checked={cam.limits != null}
            onChange={(e) => onProp('limits', e.target.checked ? DEFAULT_LIMITS : undefined)}
          />
        </label>
        {cam.limits ? (
          <>
            {limitRow('minX', 'left')}
            {limitRow('maxX', 'right')}
            {limitRow('minY', 'bottom')}
            {limitRow('maxY', 'top')}
            <div className="ed-hint">
              while playing, the camera never shows anything outside these world bounds
            </div>
          </>
        ) : (
          <div className="ed-hint">no limits — the camera can go anywhere</div>
        )}
      </div>
    </div>
  )
}

/** Scene-level summary shown while nothing inside the scene is selected. */
function SceneInspector({ scene }: { scene: SceneJson }) {
  const cam = resolveSceneCamera(scene.camera)
  return (
    <div className="ed-pad">
      <RoRow label="entities" value={String(scene.entities.length)} />
      <RoRow label="ui pieces" value={scene.ui?.length ? scene.ui.join(', ') : 'none'} />
      <RoRow
        label="camera"
        value={cam.follow ? `follows ${cam.follow}` : `fixed at ${cam.position[0]}, ${cam.position[1]}`}
      />
      <div className="ed-hint">
        click an entity in the viewport or the tree to edit it — drag prefabs from the left
        panel to add more
      </div>
    </div>
  )
}

function ScriptInspector({ name }: { name: string }) {
  const Class = ACTIVE_ARCHETYPE.registry.components[name]
  if (!Class) return <div className="ed-hint ed-pad">unknown script</div>
  const defaults = new Class() as unknown as Record<string, unknown>
  const params = Object.entries(Class.params ?? {})
  return (
    <div className="ed-pad">
      <div className="ed-hint">
        params declared in the code — the editor shows them as sliders wherever this script is
        used:
      </div>
      <div className="ed-comp">
        <header className="ed-comp-head">
          <span>params</span>
        </header>
        {params.length === 0 && <div className="ed-hint">no parameters</div>}
        {params.map(([key, spec]) => (
          <div
            className="ed-row"
            key={key}
            title={`min ${spec.min ?? '—'} · max ${spec.max ?? '—'} · step ${spec.step ?? '—'}`}
          >
            <span>{spec.label ?? key}</span>
            <span className="ed-ro">{String(defaults[key] ?? '')}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function Inspector(props: Props) {
  const { selection } = props
  return (
    <section className="ed-panel ed-inspector">
      <header className="ed-panel-head">Inspector</header>
      {selection == null && <div className="ed-hint ed-pad">nothing selected</div>}
      {selection != null && (
        <ContextHeader
          ctx={contextOf(selection, props.prefabs)}
          actions={
            selection.kind === 'entity' &&
            countOverrides(selection.entity) > 0 && (
              <>
                <button
                  title="Clear every override — this instance goes back to the prefab's values"
                  onClick={() => props.onResetAllProps(selection.entity.name)}
                >
                  ↺ Reset all
                </button>
                <button
                  className="is-apply"
                  title="Write every override into the prefab — all instances get these values"
                  onClick={() => props.onApplyAllProps(selection.entity.name)}
                >
                  ⤒ Apply all
                </button>
              </>
            )
          }
        />
      )}
      {selection?.kind === 'scene' && <SceneInspector scene={selection.scene} />}
      {selection?.kind === 'entity' && <EntityInspector {...props} entity={selection.entity} />}
      {selection?.kind === 'multi' && (
        <div className="ed-pad">
          <div className="ed-ins-multi">
            {selection.entities.map((entity) => (
              <div key={entity.name} className="ed-ins-multi-row">
                <span className="ed-x-ico">{entityIcon(entity, props.prefabs)}</span>
                {entity.name}
              </div>
            ))}
          </div>
          <div className="ed-hint">
            drag moves them together · ⌘/Ctrl+D duplicates · Delete removes — or right-click a
            selected row
          </div>
        </div>
      )}
      {selection?.kind === 'camera' && (
        <CameraInspector
          camera={selection.camera}
          entityNames={selection.entityNames}
          onProp={props.onCameraProp}
        />
      )}
      {selection?.kind === 'prefab' && (
        <PrefabInspector
          refName={selection.ref}
          prefab={selection.prefab}
          art={props.art}
          urlFor={props.urlFor}
          onImportArt={props.onImportArt}
          onProp={(type, key, value) => props.onPrefabProp(selection.ref, type, key, value)}
          onAdd={(type) => props.onPrefabAddComponent(selection.ref, type)}
          onRemove={(type) => props.onPrefabRemoveComponent(selection.ref, type)}
          onToggleAnimated={() => props.onPrefabToggleAnimated(selection.ref)}
          onSetTexture={(uri) => props.onPrefabSetTexture(selection.ref, uri)}
          onSetShape={() => props.onPrefabSetShape(selection.ref)}
          onSetCollision={(enabled) => props.onPrefabSetCollision(selection.ref, enabled)}
          onEditAnimation={() => props.onEditAnimation({ kind: 'prefab', ref: selection.ref })}
          stateFiles={props.stateFiles}
          onMachinePatch={(patch) => props.onPrefabMachinePatch(selection.ref, patch)}
          onEditState={(state) => props.onEditState({ kind: 'prefab', ref: selection.ref, state })}
        />
      )}
      {selection?.kind === 'ui' && (
        <div className="ed-pad">
          <div className="ed-hint">
            a UI piece is plain HTML: markup, styles and {'{{stat}}'} bindings — presentation
            only. Scenes list the pieces they start with; code toggles them with
            game.ui.show / hide / toggle.
          </div>
        </div>
      )}
      {selection?.kind === 'script' && <ScriptInspector name={selection.name} />}
      {(selection?.kind === 'controls' ||
        selection?.kind === 'stats' ||
        selection?.kind === 'game') && (
        <div className="ed-hint ed-pad">edited in the center pane</div>
      )}
      {selection?.kind === 'art' && (
        <div className="ed-pad">
          <RoRow
            label="size"
            value={selection.dims ? `${selection.dims[0]} × ${selection.dims[1]} px` : '…'}
          />
        </div>
      )}
    </section>
  )
}
