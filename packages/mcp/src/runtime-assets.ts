import { setTimeout as sleep } from 'node:timers/promises'

/**
 * Assets Ready over a Run Session (ADR 0019). When the engine reports the
 * 'assets' Runtime Bridge capability, its metadata carries
 * `assets: { pending, loaded, failed }` from `game.assets.status`, and the
 * session waits for `pending === 0` at readiness, after a `scene`
 * operation and before a screenshot — by polling `metadata()` on the
 * readiness cadence, never through a new bridge operation, and never
 * advancing `frame`. An engine without the capability is left exactly as
 * before: no wait, no field.
 */

export interface RuntimeAssetStatus {
  pending: number
  loaded: number
  failed: number
}

/** Polling cadence shared with the readiness probe (runtime-browser.ts imports it), so both waits feel the same. */
export const ASSETS_POLL_INTERVAL_MS = 25

export type AssetsWait =
  | { ok: true; metadata: Record<string, unknown> }
  | { ok: false; assets: RuntimeAssetStatus | undefined }

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

/** The `assets` block of a bridge metadata, or undefined when the engine never sent one. */
export function runtimeAssetStatus(value: unknown): RuntimeAssetStatus | undefined {
  if (!value || typeof value !== 'object') return undefined
  const { pending, loaded, failed } = value as Record<string, unknown>
  if (!isCount(pending) || !isCount(loaded) || !isCount(failed)) return undefined
  return { pending, loaded, failed }
}

/** Waits `milliseconds`, or rejects with the signal's reason as soon as it aborts. */
export async function abortableDelay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  try {
    await sleep(milliseconds, undefined, signal ? { signal } : undefined)
  } catch (error) {
    // timers/promises rejects with its own AbortError; callers get the reason.
    signal?.throwIfAborted()
    throw error
  }
}

/**
 * Reads `metadata()` until its `assets.pending` is 0 — or until the engine
 * reports no `assets` at all — within `timeoutMs`. Always reads at least
 * once. On timeout it hands back the last numbers seen, for diagnostics. An
 * aborted `signal` rejects with its reason at the next read or poll.
 */
export async function waitForAssetsReady(
  read: () => Promise<Record<string, unknown>>,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<AssetsWait> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    signal?.throwIfAborted()
    const metadata = await read()
    signal?.throwIfAborted()
    const assets = runtimeAssetStatus(metadata.assets)
    if (!assets || assets.pending === 0) return { ok: true, metadata }
    if (Date.now() >= deadline) return { ok: false, assets }
    await abortableDelay(ASSETS_POLL_INTERVAL_MS, signal)
  }
}
