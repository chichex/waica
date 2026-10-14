import { Component } from '@waica/engine'
import { Health } from '@waica/behaviors'

/** Health points per heart (issue #181 inference 19: a Health of 6 is three hearts). */
const POINTS_PER_HEART = 2

/** One heart's markup: full, half or empty by the points it holds. */
function heart(points: number): string {
  const kind = points >= POINTS_PER_HEART ? 'full' : points > 0 ? 'half' : 'empty'
  return `<span class="heart ${kind}">♥</span>`
}

/**
 * Drives the player-health screen-space piece from the Health beside it
 * (issue #181 CA-27): one heart per two points of `max`, full, half or empty
 * by `current`, rewritten whenever either changes. The piece must be shown
 * (the scene's `ui` list does); it holds a `.hearts` element.
 */
export class HeartsHud extends Component {
  static override componentName = 'HeartsHud'
  static override displayName = 'Hearts HUD'
  static override params = {
    piece: { label: 'Hearts piece', ref: 'ui' as const },
  }
  static override transient = ['shown']

  /** The screen-space piece whose `.hearts` element shows the hearts. */
  piece = 'player-health'
  private shown = ''

  override onUpdate(): void {
    const health = this.entity.get(Health)
    const target = this.piece ? this.game.ui.element(this.piece)?.querySelector('.hearts') : null
    if (!health || !target) return
    const key = `${health.current}/${health.max}`
    if (key === this.shown) return
    this.shown = key
    const hearts = Math.ceil(health.max / POINTS_PER_HEART)
    target.innerHTML = Array.from({ length: hearts }, (_, index) => heart(health.current - index * POINTS_PER_HEART)).join('')
    target.setAttribute('aria-label', `Health ${health.current} of ${health.max}`)
  }
}
