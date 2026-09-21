import type { AudioChannelState, LiveSoundInfo } from './audio/types.js'
import type { Component, ComponentClass } from './component.js'
import type { Entity } from './entity.js'
import type { Game } from './game.js'
import type { RuntimeMetadata } from './runtime-bridge.js'
import type { StatValue } from './stats.js'
import { anchoredPiecesOf } from './ui.js'

export type ProjectionMarkerKind = 'cycle' | 'unsupported' | 'error' | 'truncated'

export interface ProjectionMarker {
  $waica: ProjectionMarkerKind | 'date' | 'bigint' | 'map' | 'set'
  [key: string]: unknown
}

export type ProjectedValue =
  | null
  | boolean
  | number
  | string
  | ProjectionMarker
  | ProjectedValue[]
  | { [key: string]: ProjectedValue }

export interface ProjectionIssue {
  path: string
  marker: ProjectionMarkerKind
  omitted?: number
}

export interface RuntimeSnapshotFilters {
  entity_ids?: string[]
  entity_names?: string[]
  component_types?: string[]
}

export interface RuntimeTransformSnapshot {
  position: { x: number; y: number; z: number }
  rotation: { x: number; y: number; z: number; order: string }
  scale: { x: number; y: number; z: number }
}

export interface RuntimeComponentSnapshot {
  type: string
  index: number
  state: ProjectedValue
}

export interface RuntimeEntitySnapshot {
  id: string
  name: string
  transform: RuntimeTransformSnapshot
  components: RuntimeComponentSnapshot[]
}

/**
 * The mixer's state (CA-15): `master` and every channel's volume/mute,
 * sorted by name, plus `playing` — `game.audio.liveSounds()` verbatim,
 * already sorted (by uri then channel). Despite the name, `playing` is not
 * "every currently-audible sound": per `liveSounds()`'s own docstring it
 * also carries a loop retained before the autoplay unlock, a sound still
 * loading, and even one about to fail to load (gone a tick later). Emitted
 * unconditionally, like every other snapshot section —
 * `[DEVIATION 2026-09-08]` in the spec: no section of RuntimeSnapshot is
 * filterable today, so audio does not invent the first one.
 */
export interface RuntimeSnapshotAudio {
  master: number
  channels: Record<string, AudioChannelState>
  playing: LiveSoundInfo[]
}

/**
 * `game.time`'s pending work (CA-10), beside `audio`: `pending` counts
 * active timers plus active tweens across both scopes; `nextInSteps` is the
 * smallest positive integer n such that `step { frames: n }` makes an
 * active timer run or an active tween complete, or null when `pending` is
 * 0. Emitted unconditionally, like `audio` — never filtered, and never
 * repeats `now` (metadata already carries `simulationTime`). That promise
 * holds only while the Game is simulating: `runFrame` runs zero steps with
 * `simulate === false` (`game.ts`), so on a Game that is paused AND not
 * simulating, `nextInSteps` is still reported but stepping never consumes
 * it — a Run Session starts with `simulate === true`, so this only matters
 * if project code flips it.
 */
export interface RuntimeSnapshotTime {
  pending: number
  nextInSteps: number | null
}

/**
 * `game.ui` (issue #72 CA-9), beside `audio` and `time`: `shown` lists the
 * screen pieces whose visibility flag is on, sorted by name; `anchored`
 * lists the live Anchored Pieces in creation order. For each, `entity` is
 * its anchor entity's name (kept for a lingering instance whose entity is
 * gone); `x`/`y` are the whole CSS px of its last placement inside the game
 * viewport — for one attached since the last render frame, where the next
 * frame will place it; `clipped` is true when its anchor point lies outside
 * the game viewport; `values` holds only its own values, after every `set`,
 * bounded like component state (CA-5): sorted by name, a string over 4 KiB
 * becomes a truncated marker, and past 100 values the record does too.
 * Emitted unconditionally, like `audio` and `time` — never filtered.
 */
export interface RuntimeSnapshotUi {
  shown: string[]
  anchored: Array<{
    piece: string
    entity: string
    x: number
    y: number
    clipped: boolean
    values: Record<string, StatValue | ProjectionMarker> | ProjectionMarker
  }>
}

export interface RuntimeSnapshot extends RuntimeMetadata {
  stats: Record<string, StatValue>
  /** The live scene's name (its catalog key), or null with no scene loaded. */
  scene: string | null
  entities: RuntimeEntitySnapshot[]
  projectionIssues: ProjectionIssue[]
  audio: RuntimeSnapshotAudio
  time: RuntimeSnapshotTime
  ui: RuntimeSnapshotUi
}

export const RUNTIME_PROJECTION_LIMITS = {
  depth: 5,
  entries: 100,
  stringBytes: 4 * 1024,
  componentBytes: 64 * 1024,
  snapshotBytes: 1024 * 1024,
} as const

interface ProjectionContext {
  readonly issues: ProjectionIssue[]
  readonly seen: Map<object, string>
}

function marker(
  context: ProjectionContext,
  path: string,
  kind: ProjectionMarkerKind,
  detail: Record<string, unknown> = {},
): ProjectionMarker {
  context.issues.push({ path, marker: kind })
  return { $waica: kind, ...detail }
}

function isPlainRecord(value: object): value is Record<string, unknown> {
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

const textEncoder = new TextEncoder()

function utf8Bytes(value: string): number {
  return textEncoder.encode(value).byteLength
}

function stringPreview(value: string, byteLimit: number): string {
  let low = 0
  let high = value.length
  while (low < high) {
    const middle = Math.ceil((low + high) / 2)
    if (utf8Bytes(value.slice(0, middle)) <= byteLimit) low = middle
    else high = middle - 1
  }
  const preview = value.slice(0, low)
  const last = preview.charCodeAt(preview.length - 1)
  return last >= 0xd800 && last <= 0xdbff ? preview.slice(0, -1) : preview
}

function projectValue(
  value: unknown,
  path: string,
  context: ProjectionContext,
  depth = 0,
): ProjectedValue {
  if (depth > RUNTIME_PROJECTION_LIMITS.depth) {
    return marker(context, path, 'truncated', {
      reason: 'depth',
      maxDepth: RUNTIME_PROJECTION_LIMITS.depth,
    })
  }
  if (value === null || typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const bytes = utf8Bytes(value)
    if (bytes <= RUNTIME_PROJECTION_LIMITS.stringBytes) return value
    return marker(context, path, 'truncated', {
      reason: 'string',
      preview: stringPreview(value, RUNTIME_PROJECTION_LIMITS.stringBytes),
      originalLength: value.length,
      originalBytes: bytes,
    })
  }
  if (typeof value === 'bigint') return { $waica: 'bigint', value: value.toString() }
  if (typeof value === 'number') {
    return Number.isFinite(value)
      ? value
      : marker(context, path, 'unsupported', { type: 'non-finite-number' })
  }
  if (typeof value !== 'object') {
    return marker(context, path, 'unsupported', { type: typeof value })
  }
  const previousPath = context.seen.get(value)
  if (previousPath) return marker(context, path, 'cycle', { path: previousPath })
  context.seen.set(value, path)
  if (value instanceof Date) {
    return Number.isFinite(value.getTime())
      ? { $waica: 'date', value: value.toISOString() }
      : marker(context, path, 'error', { message: 'Invalid Date' })
  }
  if (Array.isArray(value)) {
    const entries = value.slice(0, RUNTIME_PROJECTION_LIMITS.entries)
      .map((entry, index) => projectValue(entry, `${path}[${index}]`, context, depth + 1))
    const omitted = value.length - entries.length
    if (omitted > 0) {
      entries.push(marker(context, path, 'truncated', { reason: 'entries', omitted }))
    }
    return entries
  }
  if (value instanceof Map) {
    const sourceEntries = [...value.entries()]
    const entries = sourceEntries.slice(0, RUNTIME_PROJECTION_LIMITS.entries)
      .map(([key, entry], index) => [
        projectValue(key, `${path}.entries[${index}].key`, context, depth + 1),
        projectValue(entry, `${path}.entries[${index}].value`, context, depth + 1),
      ])
    const omitted = sourceEntries.length - entries.length
    return {
      $waica: 'map',
      entries,
      ...(omitted > 0
        ? { truncated: marker(context, path, 'truncated', { reason: 'entries', omitted }) }
        : {}),
    }
  }
  if (value instanceof Set) {
    const sourceValues = [...value]
    const values = sourceValues.slice(0, RUNTIME_PROJECTION_LIMITS.entries)
      .map((entry, index) => projectValue(entry, `${path}.values[${index}]`, context, depth + 1))
    const omitted = sourceValues.length - values.length
    return {
      $waica: 'set',
      values,
      ...(omitted > 0
        ? { truncated: marker(context, path, 'truncated', { reason: 'entries', omitted }) }
        : {}),
    }
  }
  if (isPlainRecord(value)) {
    const keys = Object.keys(value).sort()
    const projected = Object.fromEntries(
      keys.slice(0, RUNTIME_PROJECTION_LIMITS.entries)
        .map((key) => [
          key,
          projectValue(value[key], `${path}.${key}`, context, depth + 1),
        ]),
    )
    const omitted = keys.length - Object.keys(projected).length
    if (omitted === 0) return projected
    return marker(context, path, 'truncated', {
      reason: 'entries',
      omitted,
      value: projected,
    })
  }
  return marker(context, path, 'unsupported', {
    type: value.constructor?.name ?? 'object',
  })
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function componentState(
  component: Component,
  path: string,
  context: ProjectionContext,
): ProjectedValue {
  if (typeof component.inspectState === 'function') {
    try {
      return projectValue(component.inspectState(), path, context)
    } catch (error) {
      return marker(context, path, 'error', { message: errorMessage(error) })
    }
  }

  const keys = new Set(Object.keys(component))
  for (
    let prototype = Object.getPrototypeOf(component) as object | null;
    prototype && prototype !== Object.prototype;
    prototype = Object.getPrototypeOf(prototype) as object | null
  ) {
    for (const [key, descriptor] of Object.entries(Object.getOwnPropertyDescriptors(prototype))) {
      if (typeof descriptor.set === 'function') keys.add(key)
    }
  }

  const state: Record<string, ProjectedValue> = {}
  for (const key of [...keys].sort()) {
    if (key === 'entity' || key === 'game' || key.startsWith('_')) continue
    const valuePath = `${path}.${key}`
    try {
      const value = (component as unknown as Record<string, unknown>)[key]
      if (typeof value === 'function') continue
      state[key] = projectValue(value, valuePath, context, 1)
    } catch (error) {
      state[key] = marker(context, valuePath, 'error', { message: errorMessage(error) })
    }
  }
  return state
}

function boundedComponentState(
  component: Component,
  path: string,
  context: ProjectionContext,
): ProjectedValue {
  const state = componentState(component, path, context)
  const originalBytes = utf8Bytes(JSON.stringify(state))
  if (originalBytes <= RUNTIME_PROJECTION_LIMITS.componentBytes) return state
  return marker(context, path, 'truncated', {
    reason: 'component-size',
    limit: RUNTIME_PROJECTION_LIMITS.componentBytes,
    originalBytes,
    path,
  })
}

function fitsSnapshot(snapshot: RuntimeSnapshot): boolean {
  return utf8Bytes(JSON.stringify(snapshot)) <= RUNTIME_PROJECTION_LIMITS.snapshotBytes
}

/** The index of the `ui.anchored` instance an issue path points into, or null. */
function anchoredIndex(path: string): number | null {
  const match = /^ui\.anchored\[(\d+)\]/.exec(path)
  return match ? Number(match[1]) : null
}

/**
 * The global cap's second stage, once every entity is gone: drops
 * `ui.anchored` instances from the end, with their projection issues,
 * until the snapshot fits, recording how many went.
 */
function capAnchored(snapshot: RuntimeSnapshot): RuntimeSnapshot {
  let capped = snapshot
  const retained = [...snapshot.ui.anchored]
  while (retained.length > 0) {
    retained.pop()
    const omitted = snapshot.ui.anchored.length - retained.length
    const projectionIssues = snapshot.projectionIssues
      .filter((issue) => {
        const index = anchoredIndex(issue.path)
        return index === null || index < retained.length
      })
      .concat({ path: `ui.anchored[${retained.length}]`, marker: 'truncated', omitted })
    capped = { ...snapshot, ui: { ...snapshot.ui, anchored: retained }, projectionIssues }
    if (fitsSnapshot(capped)) return capped
  }
  return capped
}

export class RuntimeInspector {
  private readonly ids = new WeakMap<Entity, string>()
  private nextId = 1

  constructor(private readonly game: Game) {}

  snapshot(metadata: RuntimeMetadata, filters: RuntimeSnapshotFilters = {}): RuntimeSnapshot {
    const projectionIssues: ProjectionIssue[] = []
    const idFilter = filters.entity_ids ? new Set(filters.entity_ids) : null
    const nameFilter = filters.entity_names ? new Set(filters.entity_names) : null
    const componentFilter = filters.component_types ? new Set(filters.component_types) : null
    const live = this.game.entities.map((entity) => ({ entity, id: this.idFor(entity) }))
    const entities = live.flatMap(({ entity, id }) => {
      if (idFilter && !idFilter.has(id)) return []
      if (nameFilter && !nameFilter.has(entity.name)) return []
      const components = entity.components.flatMap((component, index) => {
        const Class = component.constructor as unknown as ComponentClass
        if (componentFilter && !componentFilter.has(Class.componentName)) return []
        const context: ProjectionContext = { issues: projectionIssues, seen: new Map() }
        return [{
          type: Class.componentName,
          index,
          state: boundedComponentState(
            component,
            `entities[${id}].components[${index}].state`,
            context,
          ),
        }]
      })
      if (componentFilter && components.length === 0) return []
      return [{
        id,
        name: entity.name,
        transform: {
          position: {
            x: entity.position.x,
            y: entity.position.y,
            z: entity.position.z,
          },
          rotation: {
            x: entity.node.rotation.x,
            y: entity.node.rotation.y,
            z: entity.node.rotation.z,
            order: entity.node.rotation.order,
          },
          scale: {
            x: entity.scale.x,
            y: entity.scale.y,
            z: entity.scale.z,
          },
        },
        components,
      }]
    })
    return this.capSnapshot({
      ...metadata,
      stats: Object.fromEntries(
        [...this.game.stats.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
      ),
      scene: this.game.sceneName,
      entities,
      projectionIssues,
      audio: this.audioSnapshot(),
      time: this.timeSnapshot(),
      ui: this.uiSnapshot(projectionIssues),
    })
  }

  private audioSnapshot(): RuntimeSnapshotAudio {
    const channels: Record<string, AudioChannelState> = {}
    for (const name of this.game.audio.channels().sort()) {
      channels[name] = this.game.audio.channelState(name)
    }
    return {
      master: this.game.audio.master,
      channels,
      playing: this.game.audio.liveSounds(),
    }
  }

  private timeSnapshot(): RuntimeSnapshotTime {
    return {
      pending: this.game.time.pending,
      nextInSteps: this.game.time.nextInSteps,
    }
  }

  private uiSnapshot(issues: ProjectionIssue[]): RuntimeSnapshotUi {
    const ui = this.game.ui
    return {
      shown: ui.names().filter((name) => ui.isVisible(name)).sort(),
      anchored: anchoredPiecesOf(ui).snapshot().map((instance, index) => ({
        ...instance,
        // A record of StatValues projects to one of these, never to anything else.
        values: projectValue(
          instance.values,
          `ui.anchored[${index}].values`,
          { issues, seen: new Map() },
        ) as RuntimeSnapshotUi['anchored'][number]['values'],
      })),
    }
  }

  private capSnapshot(snapshot: RuntimeSnapshot): RuntimeSnapshot {
    if (fitsSnapshot(snapshot)) return snapshot
    let capped = snapshot
    const retained = [...snapshot.entities]
    const removedIds = new Set<string>()
    while (retained.length > 0) {
      const removed = retained.pop()
      if (removed) removedIds.add(removed.id)
      const omitted = snapshot.entities.length - retained.length
      const projectionIssues = snapshot.projectionIssues
        .filter((issue) =>
          [...removedIds].every((id) => !issue.path.startsWith(`entities[${id}]`)),
        )
        .concat({ path: `entities[${retained.length}]`, marker: 'truncated', omitted })
      capped = { ...snapshot, entities: retained, projectionIssues }
      if (fitsSnapshot(capped)) return capped
    }
    return capAnchored(capped)
  }

  private idFor(entity: Entity): string {
    const existing = this.ids.get(entity)
    if (existing) return existing
    const id = `entity-${this.nextId}`
    this.nextId += 1
    this.ids.set(entity, id)
    return id
  }
}
