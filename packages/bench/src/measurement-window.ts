import { LOOP_END_MARK, LOOP_START_MARK } from './timings.ts'

interface FrameWindow {
  warmupFrames: number
  steps: number
  /** Render only; never advance Game Time or the deterministic input sequence. */
  render(): void
  step(): number
  sync(): Promise<void>
  observe(): void
}

/** Warm shaders/targets outside the timing marks, then measure GPU-finished steps. */
export async function measureWindow(window: FrameWindow): Promise<{ frameMs: number[]; drawCalls: number }> {
  for (let index = 0; index < window.warmupFrames; index++) {
    window.render()
    await window.sync()
  }
  const frameMs: number[] = []
  let drawCalls = 0
  performance.mark(LOOP_START_MARK)
  for (let index = 0; index < window.steps; index++) {
    const started = performance.now()
    drawCalls = window.step()
    await window.sync()
    frameMs.push(performance.now() - started)
    window.observe()
  }
  performance.mark(LOOP_END_MARK)
  return { frameMs, drawCalls }
}

/** Native RAF resets frame counters; hold that reset during controlled rendering. */
export function holdRendererCounters(renderer: { readonly info: object }): () => void {
  const info = renderer.info
  if (!('autoReset' in info) || typeof info.autoReset !== 'boolean') {
    throw new Error('bench: renderer.info.autoReset is unavailable')
  }
  const original = info.autoReset
  info.autoReset = false
  return () => { info.autoReset = original }
}
