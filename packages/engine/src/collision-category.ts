const COLLISION_LAYER_PATTERN = /^[a-z][a-z0-9-]*$/

/** Package-internal runtime syntax check for one Collision Layer. */
export function validCollisionLayer(value: unknown): value is string {
  return typeof value === 'string' && COLLISION_LAYER_PATTERN.test(value)
}

/** Package-internal exact directional interest check. */
export function collisionMaskTargets(mask: unknown, targetLayer: unknown): boolean {
  if (!validCollisionLayer(targetLayer) || !Array.isArray(mask)) return false
  return mask.some(
    (entry) => typeof entry === 'string' && (entry === '*' || entry === targetLayer),
  )
}
