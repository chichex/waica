import { Component, type Entity, type StateContext } from '@waica/engine'

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

export const INTERACTABLE_UI_PIECE = 'npc-line'

/** The UI fragment every archetype using Interactable must register. */
export const INTERACTABLE_UI: Readonly<Record<string, string>> = {
  [INTERACTABLE_UI_PIECE]: `<style>
  .npc-line {
    position: absolute;
    left: 50%;
    bottom: 24px;
    transform: translateX(-50%);
    max-width: 70%;
    padding: 10px 18px;
    border-radius: 8px;
    background: #1a1a2ecc;
    border: 1px solid #ffffff2e;
    font: 500 18px system-ui, sans-serif;
    color: #f5f5f5;
    text-shadow: 0 1px 2px #000a;
    user-select: none;
  }
</style>
<div class="npc-line">{{npcLine}}</div>
`,
}

/**
 * Runs onInteract on every component of `target` — the winner of the
 * nearest-Interactable scan. The two paths that win it (the interact key,
 * via interactUpdate, and a click-to-move NPC order arrival) both call this,
 * so a sibling component (e.g. SceneTransition with trigger:'interact')
 * fires the same way from either input scheme.
 */
export function fireInteract(target: Entity, initiator: Entity): void {
  for (const component of [...target.components]) component.onInteract?.(initiator)
}

/**
 * The player role's interact lookup, run by its '*' hook in every state:
 * pressing interact near an Interactable publishes its line through the
 * npcLine stat and shows the npc-line UI piece; walking out of every
 * radius hides it again. Nearest one wins when several are in range.
 */
export function interactUpdate({ entity, game }: StateContext): void {
  let nearest: Interactable | null = null
  let nearestEntity: Entity | null = null
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
      nearestEntity = other
      nearestDistance = distance
    }
  }
  if (!nearest || !nearestEntity) {
    game.ui.hide(INTERACTABLE_UI_PIECE)
    return
  }
  if (game.input.justPressed('interact') && !game.input.consumed('interact')) {
    // The press is spent: an input:interact edge needs a NEW press.
    game.input.consume('interact')
    game.stats.set('npcLine', nearest.line)
    game.ui.show(INTERACTABLE_UI_PIECE)
    fireInteract(nearestEntity, entity)
  }
}
