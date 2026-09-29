import type { ComponentClass } from './component.js'

export type InvalidUpdateConstraintReason =
  | 'unknown-target'
  | 'passive-declarer'
  | 'passive-target'
  | 'self-edge'
  | 'unregistered-component'

export interface DuplicateComponentUpdateIssue {
  readonly code: 'duplicate-component'
  readonly componentNames: readonly string[]
  readonly componentName: string
  readonly count: number
  readonly cause: string
}

export interface InvalidComponentUpdateConstraintIssue {
  readonly code: 'invalid-update-constraint'
  readonly componentNames: readonly string[]
  readonly declarer: string
  readonly target?: string
  readonly reason: InvalidUpdateConstraintReason
  readonly cause: string
}

export interface ComponentUpdateCycleIssue {
  readonly code: 'component-update-cycle'
  readonly componentNames: readonly string[]
  readonly cause: string
}

export type ComponentUpdateScheduleIssue =
  | DuplicateComponentUpdateIssue
  | InvalidComponentUpdateConstraintIssue
  | ComponentUpdateCycleIssue

export interface ValidComponentUpdateSchedule {
  readonly ok: true
  readonly order: readonly string[]
  readonly issues: readonly []
}

export interface InvalidComponentUpdateSchedule {
  readonly ok: false
  readonly issues: readonly ComponentUpdateScheduleIssue[]
}

export type ComponentUpdateScheduleResult =
  | ValidComponentUpdateSchedule
  | InvalidComponentUpdateSchedule

export type ComponentUpdateRegistry = Readonly<
  Record<string, ComponentClass | undefined>
>

function codeUnitCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}

function registeredClass(
  registry: ComponentUpdateRegistry,
  componentName: string,
): ComponentClass | undefined {
  return Object.hasOwn(registry, componentName) ? registry[componentName] : undefined
}

/** Whether instances of `Class` run each frame (its prototype defines onUpdate). */
export function implementsOnUpdate(Class: ComponentClass | undefined): boolean {
  if (!Class) return false
  const prototype: unknown = Reflect.get(Class, 'prototype')
  return typeof prototype === 'object' && prototype !== null && typeof Reflect.get(prototype, 'onUpdate') === 'function'
}

/** Reads a Tarjan bookkeeping entry that the traversal has already recorded. */
function recorded(map: ReadonlyMap<string, number>, node: string, what: string): number {
  const value = map.get(node)
  if (value === undefined) throw new Error(`Component update cycle search has no ${what} for "${node}"`)
  return value
}

/** The first member of a strongly connected group, which always has at least two members. */
function firstMember(group: readonly string[]): string {
  const [first] = group
  if (first === undefined) throw new Error('Component update cycle group is empty')
  return first
}

function updateCycles(
  nodes: readonly string[],
  outgoing: ReadonlyMap<string, ReadonlySet<string>>,
): string[][] {
  let nextIndex = 0
  const indices = new Map<string, number>()
  const lowLinks = new Map<string, number>()
  const stack: string[] = []
  const onStack = new Set<string>()
  const cycles: string[][] = []

  const visit = (node: string): void => {
    const index = nextIndex++
    indices.set(node, index)
    lowLinks.set(node, index)
    stack.push(node)
    onStack.add(node)

    for (const dependent of [...(outgoing.get(node) ?? [])].sort(codeUnitCompare)) {
      if (!indices.has(dependent)) {
        visit(dependent)
        lowLinks.set(node, Math.min(recorded(lowLinks, node, 'low link'), recorded(lowLinks, dependent, 'low link')))
      } else if (onStack.has(dependent)) {
        lowLinks.set(node, Math.min(recorded(lowLinks, node, 'low link'), recorded(indices, dependent, 'index')))
      }
    }

    if (lowLinks.get(node) !== indices.get(node)) return
    const group: string[] = []
    let member = stack.pop()
    while (member !== undefined) {
      onStack.delete(member)
      group.push(member)
      if (member === node) break
      member = stack.pop()
    }
    if (group.length > 1) cycles.push(group.sort(codeUnitCompare))
  }

  for (const node of nodes) {
    if (!indices.has(node)) visit(node)
  }
  return cycles.sort((left, right) => codeUnitCompare(firstMember(left), firstMember(right)))
}

/** The onUpdate components of one entity and the updateAfter edges between them. */
interface UpdateGraph {
  readonly nodes: readonly string[]
  /** Target → the components that update after it. */
  readonly outgoing: Map<string, Set<string>>
  readonly indegree: Map<string, number>
}

/** What one entity's component names resolve against. */
interface ScheduleScope {
  readonly present: ReadonlySet<string>
  readonly registry: ComponentUpdateRegistry
}

function duplicateComponentIssues(
  componentNames: readonly string[],
): ComponentUpdateScheduleIssue[] {
  const issues: ComponentUpdateScheduleIssue[] = []
  const counts = new Map<string, number>()
  for (const name of componentNames) counts.set(name, (counts.get(name) ?? 0) + 1)
  for (const [componentName, count] of [...counts].sort(([left], [right]) =>
    codeUnitCompare(left, right),
  )) {
    if (count < 2) continue
    issues.push({
      code: 'duplicate-component',
      componentName,
      componentNames: [componentName],
      count,
      cause: `Component "${componentName}" appears ${count} times on the same entity; component identity must be unique.`,
    })
  }
  return issues
}

function passiveDeclarerIssues({ present, registry }: ScheduleScope): ComponentUpdateScheduleIssue[] {
  const issues: ComponentUpdateScheduleIssue[] = []
  for (const declarer of [...present].sort(codeUnitCompare)) {
    const Class = registeredClass(registry, declarer)
    if (Class?.updateAfter !== undefined && !implementsOnUpdate(Class)) {
      issues.push({
        code: 'invalid-update-constraint',
        reason: 'passive-declarer',
        declarer,
        componentNames: [declarer],
        cause: `Passive component "${declarer}" declares updateAfter but does not implement onUpdate.`,
      })
    }
  }
  return issues
}

/** Adds every valid updateAfter edge to the graph and returns the constraints that are not. */
function linkUpdateConstraints(graph: UpdateGraph, scope: ScheduleScope): ComponentUpdateScheduleIssue[] {
  const issues: ComponentUpdateScheduleIssue[] = []
  for (const declarer of graph.nodes) {
    const Class = registeredClass(scope.registry, declarer)
    for (const target of new Set(Class?.updateAfter ?? [])) {
      const verdict = constraintVerdict({ declarer, target }, graph, scope)
      if (verdict === 'ignore') continue
      if (verdict !== 'link') {
        issues.push(verdict)
        continue
      }
      const readers = graph.outgoing.get(target)
      if (!readers || readers.has(declarer)) continue
      readers.add(declarer)
      graph.indegree.set(declarer, (graph.indegree.get(declarer) ?? 0) + 1)
    }
  }
  return issues
}

/**
 * Whether `declarer` may update after `target`: an edge to link, a
 * registered-but-absent target to ignore, or the invalid-constraint issue.
 */
function constraintVerdict(
  { declarer, target }: { declarer: string; target: string },
  graph: UpdateGraph,
  { present, registry }: ScheduleScope,
): ComponentUpdateScheduleIssue | 'link' | 'ignore' {
  if (!present.has(target)) {
    if (registeredClass(registry, target)) return 'ignore'
    return {
      code: 'invalid-update-constraint',
      reason: 'unknown-target',
      declarer,
      target,
      componentNames: [declarer, target],
      cause: `Component "${declarer}" declares updateAfter target "${target}", which is neither present nor registered.`,
    }
  }
  if (target === declarer) {
    return {
      code: 'invalid-update-constraint',
      reason: 'self-edge',
      declarer,
      target,
      componentNames: [declarer],
      cause: `Component "${declarer}" cannot declare itself in updateAfter.`,
    }
  }
  if (graph.outgoing.has(target)) return 'link'
  return {
    code: 'invalid-update-constraint',
    reason: 'passive-target',
    declarer,
    target,
    componentNames: [declarer, target],
    cause: `Component "${declarer}" declares updateAfter target "${target}", but "${target}" does not implement onUpdate.`,
  }
}

/** Kahn's order over the graph, always taking the code-unit-smallest ready component first. */
function updateOrder({ nodes, outgoing, indegree }: UpdateGraph): string[] {
  const ready = nodes.filter((name) => indegree.get(name) === 0)
  const order: string[] = []
  ready.sort(codeUnitCompare)
  let next = ready.shift()
  while (next !== undefined) {
    order.push(next)
    for (const dependent of [...(outgoing.get(next) ?? [])].sort(codeUnitCompare)) {
      const remaining = (indegree.get(dependent) ?? 0) - 1
      indegree.set(dependent, remaining)
      if (remaining === 0) ready.push(dependent)
    }
    ready.sort(codeUnitCompare)
    next = ready.shift()
  }
  return order
}

/**
 * Resolves one entity's deterministic component update schedule without
 * constructing components or mutating either input.
 */
export function resolveComponentUpdateSchedule(
  componentNames: readonly string[],
  registry: ComponentUpdateRegistry,
): ComponentUpdateScheduleResult {
  const present = new Set(componentNames)
  const scope: ScheduleScope = { present, registry }
  const nodes = [...present]
    .filter((name) => implementsOnUpdate(registeredClass(registry, name)))
    .sort(codeUnitCompare)
  const graph: UpdateGraph = {
    nodes,
    outgoing: new Map(nodes.map((name) => [name, new Set<string>()])),
    indegree: new Map(nodes.map((name) => [name, 0])),
  }
  const issues = [
    ...duplicateComponentIssues(componentNames),
    ...passiveDeclarerIssues(scope),
    ...linkUpdateConstraints(graph, scope),
  ]
  for (const cycle of updateCycles(nodes, graph.outgoing)) {
    issues.push({
      code: 'component-update-cycle',
      componentNames: cycle,
      cause: `Component update cycle among ${cycle.map((name) => `"${name}"`).join(', ')}.`,
    })
  }
  if (issues.length > 0) return { ok: false, issues }
  return { ok: true, order: updateOrder(graph), issues: [] }
}
