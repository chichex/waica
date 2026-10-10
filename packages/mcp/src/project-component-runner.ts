import { existsSync, realpathSync } from 'node:fs'
import * as nodeModule from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const PROTOCOL_VERSION = 1
const { createRequire } = nodeModule
const hostRequire = createRequire(import.meta.url)
// This file runs as a standalone forked child (see runnerFromModule in the
// loader) and cannot import siblings, so it mirrors known-archetypes.ts by
// hand: one entry per KNOWN_ARCHETYPES row, plus engine and behaviors.
const FALLBACK_PACKAGES = new Set([
  '@waica/engine',
  '@waica/behaviors',
  '@waica/archetype-platformer',
  '@waica/archetype-topdown',
  '@waica/archetype-isometric',
])
// The engine draws with three's WebGPU build and writes its shaders in TSL (ADR 0025),
// and loads glTF with two of three's addons (ADR 0027): mirrors THREE_SPECIFIERS in project-component-fallbacks.ts.
const FALLBACK_SPECIFIERS = new Set([
  ...FALLBACK_PACKAGES,
  'three',
  'three/webgpu',
  'three/tsl',
  'three/addons/loaders/GLTFLoader.js',
  'three/addons/utils/SkeletonUtils.js',
])
const REF_KINDS = new Set(['prefab', 'clip', 'action', 'stat', 'sound', 'ui'])
// Mirrors COMPONENT_SPACES in the engine's component.ts (this child imports no sibling).
const SPACES = new Set(['2d', '3d', 'both'])
const RELATIVE_EXTENSIONS = ['.ts', '.tsx', '.js']

interface RunnerRequest {
  kind: 'load-project-entry'
  version: number
  token: string
  projectPath: string
  entryFile: string
  relativeFile: string
  fallbackEntries: Record<string, string>
}

interface ComponentParamRow {
  name: string
  ref: 'prefab' | 'clip' | 'action' | 'stat' | 'sound' | 'ui'
  hasOptions: boolean
  default?: string
}

interface ComponentRow {
  name: string
  file: string
  params: ComponentParamRow[]
  hasOnUpdate: boolean
  hasUpdateAfter: boolean
  updateAfter: string[]
  /** The class's `static space` marker, checked here so a wrong one names its component; null when it declares none. */
  space: string | null
}

interface SuccessMessage {
  kind: 'project-entry-result'
  version: number
  token: string
  ok: true
  components: ComponentRow[]
}

interface FailureMessage {
  kind: 'project-entry-result'
  version: number
  token: string
  ok: false
  code: 'component-load-failed' | 'component-load-unsupported'
  message: string
}

type TerminalMessage = SuccessMessage | FailureMessage

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

function installedPackage(projectPath: string, name: string): boolean {
  for (let current = projectPath; ; current = path.dirname(current)) {
    if (existsSync(path.join(current, 'node_modules', ...name.split('/'), 'package.json'))) {
      return true
    }
    const parent = path.dirname(current)
    if (parent === current) return false
  }
}

function relativeCandidates(unresolvedPath: string): string[] {
  const candidates = [
    ...RELATIVE_EXTENSIONS.map((extension) => `${unresolvedPath}${extension}`),
    ...RELATIVE_EXTENSIONS.map((extension) => path.join(unresolvedPath, `index${extension}`)),
  ]
  if (unresolvedPath.endsWith('.js')) {
    const withoutJs = unresolvedPath.slice(0, -'.js'.length)
    candidates.unshift(`${withoutJs}.ts`, `${withoutJs}.tsx`)
  }
  return candidates
}

function resolveRelativeCandidate(unresolvedPath: string): string | undefined {
  return relativeCandidates(unresolvedPath).find((candidate) => existsSync(candidate))
}

function installProjectResolution(
  projectPath: string,
  fallbackEntries: Readonly<Record<string, string>>,
): void {
  if (typeof nodeModule.registerHooks !== 'function') {
    throw new Error('node:module registerHooks is unavailable')
  }
  const projectRequire = createRequire(path.join(projectPath, 'package.json'))
  // Resolve before registering the hook. Calling createRequire.resolve from
  // inside a synchronous resolve hook recursively invokes that same hook.
  // Failures stay attached to their package and surface only when an entry
  // actually imports it, matching the previous per-package bridge behavior.
  const packageEntries = new Map<string, string | Error>()
  for (const specifier of FALLBACK_PACKAGES) {
    try {
      packageEntries.set(
        specifier,
        installedPackage(projectPath, specifier)
          ? projectRequire.resolve(specifier)
          : (fallbackEntries[specifier] ?? hostRequire.resolve(specifier)),
      )
    } catch (error) {
      packageEntries.set(specifier, error instanceof Error ? error : new Error(String(error)))
    }
  }

  const fallbackRoots = [...FALLBACK_PACKAGES]
    .map((specifier) => fallbackEntries[specifier])
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => realpathSync(path.dirname(entry)))
  const fromFallback = (parentURL: string | undefined): boolean => {
    if (!parentURL?.startsWith('file:')) return false
    const parent = realpathSync(fileURLToPath(parentURL))
    return fallbackRoots.some(
      (root) => parent === root || parent.startsWith(`${root}${path.sep}`),
    )
  }

  nodeModule.registerHooks({
    resolve(specifier, context, nextResolve) {
      const dependencyEntry = fallbackEntries[specifier]
      if (dependencyEntry && fromFallback(context.parentURL)) {
        return { url: pathToFileURL(dependencyEntry).href, shortCircuit: true }
      }
      const packageEntry = packageEntries.get(specifier)
      if (packageEntry instanceof Error) throw packageEntry
      if (packageEntry) {
        return { url: pathToFileURL(packageEntry).href, shortCircuit: true }
      }

      if (specifier.startsWith('.') && context.parentURL) {
        const unresolved = new URL(specifier, context.parentURL)
        try {
          return nextResolve(specifier, context)
        } catch (error) {
          const fallback = resolveRelativeCandidate(fileURLToPath(unresolved))
          if (!fallback) throw error
          return { url: pathToFileURL(fallback).href, shortCircuit: true }
        }
      }

      return nextResolve(specifier, context)
    },
  })
}

function errorChain(error: unknown): Error[] {
  const errors: Error[] = []
  let current = error
  const seen = new Set<unknown>()
  while (current instanceof Error && !seen.has(current)) {
    errors.push(current)
    seen.add(current)
    current = current.cause
  }
  return errors
}

/**
 * Whether Node's own loader refused the module (a file type or TypeScript
 * syntax strip-only mode cannot run), decided by the documented error code
 * anywhere in the cause chain — never by message wording, which a project
 * error can imitate and Node may reword.
 */
function unsupportedByNode(error: unknown): boolean {
  return errorChain(error).some((candidate) => {
    const code = (candidate as NodeJS.ErrnoException).code
    return code === 'ERR_UNKNOWN_FILE_EXTENSION' || code === 'ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX'
  })
}

function causeText(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  const code = (error as NodeJS.ErrnoException).code
  return `${code ? `${code}: ` : ''}${error.message}`
}

/** The string-valued fields of a fresh instance; nothing when it cannot be constructed. */
function stringDefaults(Class: unknown): Record<string, string> {
  if (typeof Class !== 'function') return {}
  try {
    const instance: unknown = Reflect.construct(Class, [])
    return Object.fromEntries(
      Object.entries(record(instance)).filter((entry): entry is [string, string] =>
        typeof entry[1] === 'string',
      ),
    )
  } catch {
    return {}
  }
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function paramRows(Class: object): ComponentParamRow[] {
  const defaults = stringDefaults(Class)
  const params: ComponentParamRow[] = []
  for (const [name, rawSpec] of Object.entries(record(Reflect.get(Class, 'params')))) {
    const spec = record(rawSpec)
    if (typeof spec.ref !== 'string' || !REF_KINDS.has(spec.ref)) continue
    params.push({
      name,
      ref: spec.ref as ComponentParamRow['ref'],
      hasOptions: spec.options !== undefined,
      ...(Object.hasOwn(defaults, name) ? { default: defaults[name] } : {}),
    })
  }
  return params
}

/** The row for one module export, or null when it is not a named component class. */
function componentRow(value: unknown, relativeFile: string): ComponentRow | null {
  if (typeof value !== 'function' || !Object.hasOwn(value, 'componentName')) return null
  const name: unknown = Reflect.get(value, 'componentName')
  if (typeof name !== 'string' || !name) return null
  const updateAfter: unknown = Reflect.get(value, 'updateAfter')
  const hasUpdateAfter = updateAfter !== undefined
  if (hasUpdateAfter && !isStringList(updateAfter)) {
    throw new Error(`Component "${name}" updateAfter must be an array of strings.`)
  }
  const space: unknown = Reflect.get(value, 'space') ?? null
  if (space !== null && (typeof space !== 'string' || !SPACES.has(space))) {
    throw new Error(`Component "${name}" space must be '2d', '3d' or 'both'; got ${JSON.stringify(space)}.`)
  }
  return {
    name,
    file: relativeFile,
    params: paramRows(value),
    hasOnUpdate: typeof record(Reflect.get(value, 'prototype')).onUpdate === 'function',
    hasUpdateAfter,
    updateAfter: isStringList(updateAfter) ? [...updateAfter] : [],
    space,
  }
}

function componentRows(
  loaded: Record<string, unknown>,
  relativeFile: string,
): ComponentRow[] {
  return Object.values(loaded).flatMap((value) => {
    const row = componentRow(value, relativeFile)
    return row ? [row] : []
  })
}

function validRequest(value: unknown): value is RunnerRequest {
  const candidate = record(value)
  const fallbacks = record(candidate.fallbackEntries)
  return (
    candidate.kind === 'load-project-entry' &&
    candidate.version === PROTOCOL_VERSION &&
    typeof candidate.token === 'string' &&
    candidate.token.length > 0 &&
    typeof candidate.projectPath === 'string' &&
    path.isAbsolute(candidate.projectPath) &&
    typeof candidate.entryFile === 'string' &&
    path.isAbsolute(candidate.entryFile) &&
    typeof candidate.relativeFile === 'string' &&
    candidate.relativeFile.length > 0 &&
    !!candidate.fallbackEntries &&
    typeof candidate.fallbackEntries === 'object' &&
    !Array.isArray(candidate.fallbackEntries) &&
    Object.entries(fallbacks).every(
      ([specifier, entry]) =>
        FALLBACK_SPECIFIERS.has(specifier) &&
        typeof entry === 'string' &&
        path.isAbsolute(entry),
    )
  )
}

function sendTerminal(message: TerminalMessage): void {
  if (!process.send) process.exit(1)
  process.send(message, (error) => process.exit(error ? 1 : 0))
}

async function execute(request: RunnerRequest): Promise<void> {
  try {
    installProjectResolution(request.projectPath, request.fallbackEntries)
    const loaded = (await import(pathToFileURL(request.entryFile).href)) as Record<string, unknown>
    sendTerminal({
      kind: 'project-entry-result',
      version: PROTOCOL_VERSION,
      token: request.token,
      ok: true,
      components: componentRows(loaded, request.relativeFile),
    })
  } catch (error) {
    sendTerminal({
      kind: 'project-entry-result',
      version: PROTOCOL_VERSION,
      token: request.token,
      ok: false,
      code: unsupportedByNode(error) ? 'component-load-unsupported' : 'component-load-failed',
      message: causeText(error),
    })
  }
}

if (!process.send) {
  throw new Error('Project component runner requires an IPC channel.')
}

process.send({ kind: 'project-entry-ready', version: PROTOCOL_VERSION })
process.once('message', (message) => {
  if (!validRequest(message)) process.exit(1)
  // execute() reports every project failure over IPC; reaching this catch
  // means the IPC channel itself failed, so the parent sees a crashed child.
  execute(message).catch((error: unknown) => {
    process.stderr.write(`waica project runner: ${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
})
