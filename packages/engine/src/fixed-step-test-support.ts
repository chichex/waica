/**
 * Milliseconds per display frame at `hz`, for driving `Game`'s real
 * animation-loop callback in a test. No epsilon pad: frame-rate snapping
 * (`snapElapsedToStep`) is what makes a measured duration this close to a
 * whole number of Simulation Steps count as exactly that many, not a float
 * nudge chosen to dodge the exact boundary — `1000 / 60 / 1000 === 1 / 60`
 * bit-for-bit already, before snapping even applies.
 */
export const frameMs = (hz: number): number => 1000 / hz
