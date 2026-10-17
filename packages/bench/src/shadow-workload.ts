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
