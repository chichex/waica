/**
 * The benchmark sweep: every scenario id with the workload kind it runs and
 * its size. Static and animated sizes are sprite counts; churn and
 * bullet-hell sizes are spawns per Simulation Step. One baseline file per id.
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
] as const
export type ScenarioName = (typeof SCENARIOS)[number]

export type ScenarioKind = 'static-sprites' | 'spawn-churn' | 'animated-sprites' | 'bullet-hell'

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
