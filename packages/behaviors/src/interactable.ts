import { Component, type StateContext } from '@waica/engine'

/**
 * Something the player can talk to or examine: a dialogue line and the
 * radius it can be triggered from. The component is pure data — the
 * player role's always-hook does the lookup (see interactUpdate), so an
 * NPC stays code-free: Interactable + the npc role is a whole villager.
 */
export class Interactable extends Component {
  static override componentName = 'Interactable'
  static override params = {
    line: { label: 'Line' },
    radius: { label: 'Radius', min: 0.5, max: 10, step: 0.25 },
  }

  /** What pressing interact within the radius says. */
  line = 'Hello, traveler!'
  radius = 1.5
}

/**
 * The player role's interact lookup, run by its '*' hook in every state:
 * pressing interact near an Interactable publishes its line through the
 * npcLine stat and shows the npc-line UI piece; walking out of every
 * radius hides it again. Nearest one wins when several are in range.
 */
export function interactUpdate({ entity, game }: StateContext): void {
  let nearest: Interactable | null = null
  let nearestDistance = Infinity
  for (const other of game.entities) {
    if (other === entity) continue
    const interactable = other.get(Interactable)
    if (!interactable) continue
    const distance = Math.hypot(
      other.position.x - entity.position.x,
      other.position.y - entity.position.y,
    )
    if (distance <= interactable.radius && distance < nearestDistance) {
      nearest = interactable
      nearestDistance = distance
    }
  }
  if (!nearest) {
    game.ui.hide('npc-line')
    return
  }
  if (game.input.justPressed('interact') && !game.input.consumed('interact')) {
    // The press is spent: an input:interact edge needs a NEW press.
    game.input.consume('interact')
    game.stats.set('npcLine', nearest.line)
    game.ui.show('npc-line')
  }
}
