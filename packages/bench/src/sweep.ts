/**
 * The benchmark sweep: every scenario id with the workload kind it runs and
 * its size. Static and animated sizes are sprite counts; churn and
 * bullet-hell sizes are spawns per Simulation Step; lights-occlusion sizes
 * are Light counts; falling-boxes sizes are dynamic box counts;
 * skinned-characters sizes are animated rig counts; shadows sizes count all
 * casters, including the animated rig. One baseline per backend and id.
 */
export const SCENARIOS = [
  'static-sprites-1000',
  'static-sprites-5000',
  'static-sprites-20000',
  'spawn-churn-10',
  'spawn-churn-50',
  'spawn-churn-200',
  'animated-sprites-500',
  'animated-sprites-2000',
  'bullet-hell-10',
  'bullet-hell-20',
  'bullet-hell-40',
  'lights-occlusion-8',
  'lights-occlusion-32',
  'falling-boxes-200',
  'falling-boxes-1000',
  'skinned-characters-50',
  'skinned-characters-200',
  'shadows-sun-off-50',
  'shadows-sun-off-200',
  'shadows-sun-on-50',
  'shadows-sun-on-200',
  'shadows-point-off-50',
  'shadows-point-off-200',
  'shadows-point-on-50',
  'shadows-point-on-200',
  'shadows-four-point-off-50',
  'shadows-four-point-off-200',
  'shadows-four-point-on-50',
  'shadows-four-point-on-200',
] as const
export type ScenarioName = (typeof SCENARIOS)[number]

export type ScenarioKind =
  | 'static-sprites'
  | 'spawn-churn'
  | 'animated-sprites'
  | 'bullet-hell'
  | 'lights-occlusion'
  | 'falling-boxes'
  | 'skinned-characters'
  | 'shadows-sun-off'
  | 'shadows-sun-on'
  | 'shadows-point-off'
  | 'shadows-point-on'
  | 'shadows-four-point-off'
  | 'shadows-four-point-on'

export interface SweepEntry {
  kind: ScenarioKind
  n: number
}

export const SWEEP: Record<ScenarioName, SweepEntry> = {
  'static-sprites-1000': { kind: 'static-sprites', n: 1000 },
  'static-sprites-5000': { kind: 'static-sprites', n: 5000 },
  'static-sprites-20000': { kind: 'static-sprites', n: 20000 },
  'spawn-churn-10': { kind: 'spawn-churn', n: 10 },
  'spawn-churn-50': { kind: 'spawn-churn', n: 50 },
  'spawn-churn-200': { kind: 'spawn-churn', n: 200 },
  'animated-sprites-500': { kind: 'animated-sprites', n: 500 },
  'animated-sprites-2000': { kind: 'animated-sprites', n: 2000 },
  'bullet-hell-10': { kind: 'bullet-hell', n: 10 },
  'bullet-hell-20': { kind: 'bullet-hell', n: 20 },
  'bullet-hell-40': { kind: 'bullet-hell', n: 40 },
  'lights-occlusion-8': { kind: 'lights-occlusion', n: 8 },
  'lights-occlusion-32': { kind: 'lights-occlusion', n: 32 },
  'falling-boxes-200': { kind: 'falling-boxes', n: 200 },
  'falling-boxes-1000': { kind: 'falling-boxes', n: 1000 },
  'skinned-characters-50': { kind: 'skinned-characters', n: 50 },
  'skinned-characters-200': { kind: 'skinned-characters', n: 200 },
  'shadows-sun-off-50': { kind: 'shadows-sun-off', n: 50 },
  'shadows-sun-off-200': { kind: 'shadows-sun-off', n: 200 },
  'shadows-sun-on-50': { kind: 'shadows-sun-on', n: 50 },
  'shadows-sun-on-200': { kind: 'shadows-sun-on', n: 200 },
  'shadows-point-off-50': { kind: 'shadows-point-off', n: 50 },
  'shadows-point-off-200': { kind: 'shadows-point-off', n: 200 },
  'shadows-point-on-50': { kind: 'shadows-point-on', n: 50 },
  'shadows-point-on-200': { kind: 'shadows-point-on', n: 200 },
  'shadows-four-point-off-50': { kind: 'shadows-four-point-off', n: 50 },
  'shadows-four-point-off-200': { kind: 'shadows-four-point-off', n: 200 },
  'shadows-four-point-on-50': { kind: 'shadows-four-point-on', n: 50 },
  'shadows-four-point-on-200': { kind: 'shadows-four-point-on', n: 200 },
}

/** The view the grid fills: the default 10-unit-high camera, 16:9, with a margin. */
const GRID_WIDTH = 16
const GRID_HEIGHT = 9

/** Columns and rows of a row-major grid holding `count` cells in the view's aspect. */
export function gridShape(count: number): { cols: number; rows: number } {
  const cols = Math.ceil(Math.sqrt((count * GRID_WIDTH) / GRID_HEIGHT))
  return { cols, rows: Math.ceil(count / cols) }
}

/** Sprite size for a grid of `count`: 80% of the smaller cell side, so neighbours never overlap. */
export function cellSize(count: number): number {
  const { cols, rows } = gridShape(count)
  return 0.8 * Math.min(GRID_WIDTH / cols, GRID_HEIGHT / rows)
}
