/**
 * The parent side of the project-entry runner protocol: the handshake, the
 * terminal payload and the component rows it carries, each checked for exact
 * shape before the loader trusts it.
 */

export const PROJECT_COMPONENT_PROTOCOL_VERSION = 1

const REF_KINDS = new Set(['prefab', 'clip', 'action', 'stat', 'sound', 'ui'])
const SPACES = new Set(['2d', '3d', 'both'])

export type ComponentLoadFailureCode =
  | 'component-load-failed'
  | 'component-load-unsupported'

export interface ComponentLoadFailure {
  code: ComponentLoadFailureCode
  file: string
  message: string
}

export interface ComponentParamRow {
  name: string
  ref: 'prefab' | 'clip' | 'action' | 'stat' | 'sound' | 'ui'
  hasOptions: boolean
  default?: string
}

export interface ComponentRow {
  name: string
  file: string
  params: ComponentParamRow[]
  hasOnUpdate: boolean
  hasUpdateAfter: boolean
  updateAfter: string[]
  /** The class's `static space` marker; null when it declares none. */
  space: '2d' | '3d' | 'both' | null
}

interface SuccessTerminal {
  ok: true
  components: ComponentRow[]
}

interface FailureTerminal {
  ok: false
  code: ComponentLoadFailureCode
  message: string
}

export type ParsedTerminal = SuccessTerminal | FailureTerminal

export type EntryOutcome =
  | { components: ComponentRow[] }
  | { failure: ComponentLoadFailure }

export function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function exactKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const allowed = new Set([...required, ...optional])
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => allowed.has(key))
  )
}

export function validReady(value: unknown): boolean {
  const candidate = record(value)
  return (
    candidate !== undefined &&
    exactKeys(candidate, ['kind', 'version']) &&
    candidate.kind === 'project-entry-ready' &&
    candidate.version === PROJECT_COMPONENT_PROTOCOL_VERSION
  )
}

function parseParam(value: unknown): ComponentParamRow | undefined {
  const candidate = record(value)
  if (
    !candidate ||
    !exactKeys(candidate, ['name', 'ref', 'hasOptions'], ['default']) ||
    typeof candidate.name !== 'string' ||
    candidate.name.length === 0 ||
    typeof candidate.ref !== 'string' ||
    !REF_KINDS.has(candidate.ref) ||
    typeof candidate.hasOptions !== 'boolean' ||
    (Object.hasOwn(candidate, 'default') && typeof candidate.default !== 'string')
  ) {
    return undefined
  }
  return {
    name: candidate.name,
    ref: candidate.ref as ComponentParamRow['ref'],
    hasOptions: candidate.hasOptions,
    ...(Object.hasOwn(candidate, 'default')
      ? { default: candidate.default as string }
      : {}),
  }
}

function parseComponent(value: unknown, expectedFile: string): ComponentRow | undefined {
  const candidate = record(value)
  if (
    !candidate ||
    !exactKeys(candidate, [
      'name',
      'file',
      'params',
      'hasOnUpdate',
      'hasUpdateAfter',
      'updateAfter',
      'space',
    ]) ||
    typeof candidate.name !== 'string' ||
    candidate.name.length === 0 ||
    candidate.file !== expectedFile ||
    !Array.isArray(candidate.params) ||
    typeof candidate.hasOnUpdate !== 'boolean' ||
    typeof candidate.hasUpdateAfter !== 'boolean' ||
    !Array.isArray(candidate.updateAfter) ||
    candidate.updateAfter.some((target) => typeof target !== 'string') ||
    (!candidate.hasUpdateAfter && candidate.updateAfter.length > 0) ||
    (candidate.space !== null && !SPACES.has(candidate.space as string))
  ) {
    return undefined
  }
  const params = candidate.params.map(parseParam)
  if (params.some((param) => param === undefined)) return undefined
  return {
    name: candidate.name,
    file: expectedFile,
    params: params as ComponentParamRow[],
    hasOnUpdate: candidate.hasOnUpdate,
    hasUpdateAfter: candidate.hasUpdateAfter,
    updateAfter: [...(candidate.updateAfter as string[])],
    space: candidate.space as ComponentRow['space'],
  }
}

export function parseTerminal(
  value: unknown,
  token: string,
  expectedFile: string,
): ParsedTerminal | undefined {
  const candidate = record(value)
  if (
    !candidate ||
    candidate.kind !== 'project-entry-result' ||
    candidate.version !== PROJECT_COMPONENT_PROTOCOL_VERSION ||
    candidate.token !== token ||
    typeof candidate.ok !== 'boolean'
  ) {
    return undefined
  }
  if (candidate.ok) {
    if (!exactKeys(candidate, ['kind', 'version', 'token', 'ok', 'components'])) {
      return undefined
    }
    if (!Array.isArray(candidate.components)) return undefined
    const components = candidate.components.map((row) => parseComponent(row, expectedFile))
    if (components.some((row) => row === undefined)) return undefined
    return { ok: true, components: components as ComponentRow[] }
  }
  if (
    !exactKeys(candidate, ['kind', 'version', 'token', 'ok', 'code', 'message']) ||
    (candidate.code !== 'component-load-failed' &&
      candidate.code !== 'component-load-unsupported') ||
    typeof candidate.message !== 'string'
  ) {
    return undefined
  }
  return {
    ok: false,
    code: candidate.code,
    message: candidate.message,
  }
}

