import type { DirectionalAnimation } from '@waica/engine'

/**
 * The archetype's directional animation contract: four facings with west
 * mirrored from east art (the stock sheets only draw s/n/e), clips named
 * `<state>-<dir>`, and walk falling back to idle when a sheet lacks it.
 */
export const TOPDOWN_ANIMATION: DirectionalAnimation = {
  directions: ['n', 's', 'e', 'w'],
  fallbacks: { w: { dir: 'e', flip: true } },
  contract: { required: ['idle'], fallbacks: { walk: 'idle' } },
}
