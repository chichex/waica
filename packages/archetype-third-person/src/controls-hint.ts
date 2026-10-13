import { Component } from '@waica/engine'

/**
 * Hides the controls hint (issue #181 CA-27) on the first fresh press of any
 * bound Action: the scene's `ui` list shows it on start, and once the player
 * acts it gets out of the way for good.
 */
export class ControlsHint extends Component {
  static override componentName = 'ControlsHint'
  static override displayName = 'Controls hint'
  static override params = {
    piece: { label: 'Hint piece', ref: 'ui' as const },
  }

  /** The screen-space piece to hide. */
  piece = 'controls-hint'

  override onUpdate(): void {
    const { ui, input } = this.game
    if (!this.piece || !ui.isVisible(this.piece)) return
    if (input.availableActions().some((action) => input.justPressed(action))) ui.hide(this.piece)
  }
}
