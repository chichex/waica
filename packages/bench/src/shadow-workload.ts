export const SHADOW_MEASURED_FRAMES = 60
export const SHADOW_WARMUP_FRAMES = 5
export const SHADOW_RESOURCE_SCENARIO = 'shadows-sun-on-50'

/** Authored shadow workload metadata, safe to import from Node or the page. */
export interface ShadowWorkloadInfo {
  composition: 'sun' | 'point' | 'four-point'
  enabled: boolean
  quality: 'off' | 'medium'
  casters: number
  lights: number
  warmupFrames: number
  measuredFrames: number
}

function assertMeasuredFrames(shadow: ShadowWorkloadInfo, frames: number): void {
  if (shadow.measuredFrames !== SHADOW_MEASURED_FRAMES || shadow.measuredFrames !== frames) {
    throw new Error(`bench: invalid result: shadow.measuredFrames must match the ${SHADOW_MEASURED_FRAMES} measured frames`)
  }
}

/** Shared workload policy at the parsed-result and complete-matrix boundaries. */
export function assertShadowWorkload(scenario: string, shadow: ShadowWorkloadInfo | undefined, frames: number): void {
  if (!shadow) {
    if (scenario.startsWith('shadows-')) throw new Error('bench: invalid result: shadow metadata is required for shadow scenarios')
    return
  }
  const expected = `shadows-${shadow.composition}-${shadow.enabled ? 'on' : 'off'}-${shadow.casters}`
  if (scenario !== expected) throw new Error('bench: invalid result: shadow metadata does not match scenario')
  if (shadow.quality !== (shadow.enabled ? 'medium' : 'off')) throw new Error('bench: invalid result: shadow.quality contradicts enabled')
  if (shadow.lights !== (shadow.composition === 'four-point' ? 4 : 1)) throw new Error('bench: invalid result: shadow.lights contradicts composition')
  assertMeasuredFrames(shadow, frames)
}
