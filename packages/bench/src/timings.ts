import type { GcPauses, ScenarioTimings } from './results.ts'

/** Frame count, median and nearest-rank p95 of per-frame wall times. */
export function summarizeFrames(frameMs: readonly number[]): Omit<ScenarioTimings, 'gcPauses'> {
  if (frameMs.length === 0) return { frames: 0, medianMs: 0, p95Ms: 0 }
  const sorted = [...frameMs].sort((a, b) => a - b)
  const middle = sorted.length / 2
  const median = Number.isInteger(middle)
    ? ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    : (sorted[Math.floor(middle)] ?? 0)
  const p95 = sorted[Math.ceil(sorted.length * 0.95) - 1] ?? 0
  return { frames: sorted.length, medianMs: median, p95Ms: p95 }
}

const GC_EVENTS = new Set(['MinorGC', 'MajorGC'])

/** performance.mark names the page sets around the measured step loop. */
export const LOOP_START_MARK = 'waica-bench:loop-start'
export const LOOP_END_MARK = 'waica-bench:loop-end'

export interface TraceWindow {
  start: string
  end: string
}

interface TraceEvent {
  name?: unknown
  ph?: unknown
  ts?: unknown
  dur?: unknown
}

function isTraceEvent(value: unknown): value is TraceEvent {
  return typeof value === 'object' && value !== null
}

function traceEvents(traceJson: string): TraceEvent[] | null {
  try {
    const parsed: unknown = JSON.parse(traceJson)
    if (typeof parsed !== 'object' || parsed === null) return null
    const events = (parsed as { traceEvents?: unknown }).traceEvents
    return Array.isArray(events) ? events.filter(isTraceEvent) : null
  } catch {
    return null
  }
}

function markTime(events: readonly TraceEvent[], name: string): number | null {
  const mark = events.find((event) => event.name === name && typeof event.ts === 'number')
  return typeof mark?.ts === 'number' ? mark.ts : null
}

/** The [start, end] trace timestamps of `window`, or null when a mark is missing. */
function windowBounds(events: readonly TraceEvent[], window: TraceWindow): [number, number] | null {
  const start = markTime(events, window.start)
  const end = markTime(events, window.end)
  return start === null || end === null ? null : [start, end]
}

function isGcPause(event: TraceEvent): event is TraceEvent & { dur: number } {
  return event.ph === 'X' && typeof event.name === 'string' && GC_EVENTS.has(event.name) && typeof event.dur === 'number'
}

/**
 * Count and total duration of the complete GC events in a Chrome trace —
 * only those starting inside `window` when given. Null if the trace is
 * unreadable or the window's marks are missing.
 */
export function gcPausesFromTrace(traceJson: string, window?: TraceWindow): GcPauses | null {
  const events = traceEvents(traceJson)
  if (!events) return null
  const bounds = window ? windowBounds(events, window) : null
  if (window && !bounds) return null
  const inWindow = (ts: unknown): boolean =>
    !bounds || (typeof ts === 'number' && ts >= bounds[0] && ts <= bounds[1])
  const pauses = events.filter(isGcPause).filter((event) => inWindow(event.ts))
  const totalUs = pauses.reduce((sum, event) => sum + event.dur, 0)
  return { count: pauses.length, totalMs: Math.round(totalUs) / 1000 }
}
