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

interface TraceEvent {
  name?: unknown
  ph?: unknown
  dur?: unknown
}

function traceEvents(traceJson: string): TraceEvent[] | null {
  try {
    const parsed: unknown = JSON.parse(traceJson)
    if (typeof parsed !== 'object' || parsed === null) return null
    const events = (parsed as { traceEvents?: unknown }).traceEvents
    return Array.isArray(events) ? (events as TraceEvent[]) : null
  } catch {
    return null
  }
}

/** Count and total duration of the complete GC events in a Chrome trace; null if unreadable. */
export function gcPausesFromTrace(traceJson: string): GcPauses | null {
  const events = traceEvents(traceJson)
  if (!events) return null
  let count = 0
  let totalUs = 0
  for (const event of events) {
    if (event.ph !== 'X' || typeof event.name !== 'string' || !GC_EVENTS.has(event.name)) continue
    if (typeof event.dur !== 'number') continue
    count++
    totalUs += event.dur
  }
  return { count, totalMs: Math.round(totalUs) / 1000 }
}
