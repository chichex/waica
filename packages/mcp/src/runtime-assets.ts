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

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
}

/**
 * Reads `metadata()` until its `assets.pending` is 0 — or until the engine
 * reports no `assets` at all — within `timeoutMs`. Always reads at least
 * once. On timeout it hands back the last numbers seen, for diagnostics.
 */
export async function waitForAssetsReady(
  read: () => Promise<Record<string, unknown>>,
  timeoutMs: number,
): Promise<AssetsWait> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const metadata = await read()
    const assets = runtimeAssetStatus(metadata.assets)
    if (!assets || assets.pending === 0) return { ok: true, metadata }
    if (Date.now() >= deadline) return { ok: false, assets }
    await delay(ASSETS_POLL_INTERVAL_MS)
  }
}
