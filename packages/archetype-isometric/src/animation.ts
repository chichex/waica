import type { DirectionalAnimation } from '@waica/engine'

/** Five authored facings plus three horizontal mirror fallbacks. */
export const ISOMETRIC_ANIMATION: DirectionalAnimation = {
  directions: ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'],
  fallbacks: {
    w: { dir: 'e', flip: true },
    nw: { dir: 'ne', flip: true },
    sw: { dir: 'se', flip: true },
  },
  contract: { required: ['idle'], fallbacks: { walk: 'idle' } },
}
