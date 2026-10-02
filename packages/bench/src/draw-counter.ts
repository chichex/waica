/**
 * The WebGL calls that issue a draw. three r186 draws through these under
 * WebGL2 (instanced ones for InstancedMesh); the multi-draw extension used
 * by BatchedMesh is not wrapped because no engine renderable uses it.
 */
export const DRAW_ENTRY_POINTS = [
  'drawArrays',
  'drawElements',
  'drawArraysInstanced',
  'drawElementsInstanced',
] as const

export interface DrawCounter {
  /** Draw calls since install or the last reset(). */
  readonly calls: number
  reset(): void
  uninstall(): void
}

type Patchable = object

/**
 * Wraps the draw entry points of each prototype (in the page:
 * `WebGLRenderingContext.prototype` and `WebGL2RenderingContext.prototype`)
 * so every draw is counted, without any engine API.
 */
export function installDrawCounter(prototypes: readonly Patchable[]): DrawCounter {
  let calls = 0
  const restores: (() => void)[] = []
  for (const proto of prototypes) {
    const target = proto as Record<string, unknown>
    for (const name of DRAW_ENTRY_POINTS) {
      const original = target[name]
      if (typeof original !== 'function') continue
      target[name] = function countedDraw(this: unknown, ...args: unknown[]): unknown {
        calls++
        return (original as (...a: unknown[]) => unknown).apply(this, args)
      }
      restores.push(() => {
        target[name] = original
      })
    }
  }
  return {
    get calls() {
      return calls
    },
    reset() {
      calls = 0
    },
    uninstall() {
      for (const restore of restores) restore()
      restores.length = 0
    },
  }
}
