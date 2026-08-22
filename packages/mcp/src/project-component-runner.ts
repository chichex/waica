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
const FALLBACK_SPECIFIERS = new Set([...FALLBACK_PACKAGES, 'three'])
const REF_KINDS = new Set(['prefab', 'clip', 'action', 'stat'])
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
  ref: 'prefab' | 'clip' | 'action' | 'stat'
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
      packageEntries.set(
        specifier,
        error instanceof Error ? error : new Error(String(error)),
      )
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

function unsupportedByNode(error: unknown): boolean {
  for (const candidate of errorChain(error)) {
    const code = (candidate as NodeJS.ErrnoException).code
    if (
      code === 'ERR_UNKNOWN_FILE_EXTENSION' ||
      code === 'ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX'
    ) {
      return true
    }
    if (
      /not supported in strip-only mode|unsupported TypeScript syntax|unknown file extension/i.test(
        candidate.message,
      )
    ) {
      return true
    }
  }
  return false
}

function causeText(error: unknown): string {
  if (!(error instanceof Error)) return String(error)
  const code = (error as NodeJS.ErrnoException).code
  return `${code ? `${code}: ` : ''}${error.message}`
}

function stringDefaults(Class: new () => object): Record<string, string> {
  try {
    return Object.fromEntries(
      Object.entries(new Class()).filter((entry): entry is [string, string] =>
        typeof entry[1] === 'string',
      ),
    )
  } catch {
    return {}
  }
}

function componentRows(
  loaded: Record<string, unknown>,
  relativeFile: string,
): ComponentRow[] {
  const rows: ComponentRow[] = []
  for (const value of Object.values(loaded)) {
    if (typeof value !== 'function' || !Object.hasOwn(value, 'componentName')) continue
    const Class = value as unknown as {
      new (): object
      componentName?: unknown
      params?: unknown
      updateAfter?: unknown
      prototype?: Record<string, unknown>
    }
    if (typeof Class.componentName !== 'string' || !Class.componentName) continue

    const defaults = stringDefaults(Class)
    const params: ComponentParamRow[] = []
    for (const [name, rawSpec] of Object.entries(record(Class.params))) {
      const spec = record(rawSpec)
      if (typeof spec.ref !== 'string' || !REF_KINDS.has(spec.ref)) continue
      params.push({
        name,
        ref: spec.ref as ComponentParamRow['ref'],
        hasOptions: spec.options !== undefined,
        ...(Object.hasOwn(defaults, name) ? { default: defaults[name] } : {}),
      })
    }

    const hasUpdateAfter = Class.updateAfter !== undefined
    if (
      hasUpdateAfter &&
      (!Array.isArray(Class.updateAfter) ||
        Class.updateAfter.some((target) => typeof target !== 'string'))
    ) {
      throw new Error(
        `Component "${Class.componentName}" updateAfter must be an array of strings.`,
      )
    }
    rows.push({
      name: Class.componentName,
      file: relativeFile,
      params,
      hasOnUpdate: typeof Class.prototype?.onUpdate === 'function',
      hasUpdateAfter,
      updateAfter: hasUpdateAfter ? [...(Class.updateAfter as string[])] : [],
    })
  }
  return rows
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
    const loaded = (await import(pathToFileURL(request.entryFile).href)) as Record<
      string,
      unknown
    >
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
      code: unsupportedByNode(error)
        ? 'component-load-unsupported'
        : 'component-load-failed',
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
  void execute(message)
})
