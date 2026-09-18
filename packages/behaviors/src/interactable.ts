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
/** The speech bubble anchored to the NPC, used instead of npc-line when defined (issue #72). */
const NPC_BUBBLE_PIECE = 'npc-bubble'
/** The "Press E" prompt anchored to the nearest NPC in range, when defined (issue #72). */
const INTERACT_PROMPT_PIECE = 'interact-prompt'

/**
 * The UI fragments every archetype using Interactable must register:
 * npc-line is the screen-space fallback; npc-bubble and interact-prompt are
 * Anchored Pieces (ADR 0018), each drawn above its zero-size anchor box.
 */
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
  [NPC_BUBBLE_PIECE]: `<style>
  .npc-bubble {
    position: absolute;
    left: 0;
    bottom: 0;
    transform: translate(-50%, -10px);
    width: max-content;
    max-width: 260px;
    padding: 8px 14px;
    border-radius: 10px;
    background: #1a1a2ee6;
    border: 1px solid #ffffff2e;
    font: 500 16px/1.35 system-ui, sans-serif;
    color: #f5f5f5;
    text-align: center;
    white-space: normal;
    overflow-wrap: break-word;
    text-shadow: 0 1px 2px #000a;
    pointer-events: none;
    user-select: none;
  }
  .npc-bubble::after {
    content: '';
    position: absolute;
    left: 50%;
    top: 100%;
    transform: translateX(-50%);
    border: 8px solid transparent;
    border-top-color: #1a1a2ee6;
  }
</style>
<div class="npc-bubble">{{line}}</div>
`,
  [INTERACT_PROMPT_PIECE]: `<style>
  .interact-prompt {
    position: absolute;
    left: 0;
    bottom: 0;
    transform: translate(-50%, -6px);
    width: max-content;
    padding: 3px 8px;
    border-radius: 8px;
    background: #1a1a2ecc;
    border: 1px solid #ffffff2e;
    font: 500 13px/1.4 system-ui, sans-serif;
    color: #f5f5f5;
    white-space: nowrap;
    text-shadow: 0 1px 2px #000a;
    pointer-events: none;
    user-select: none;
  }
  .interact-prompt kbd {
    display: inline-block;
    min-width: 1.4em;
    margin-left: 2px;
    padding: 0 5px;
    border-radius: 4px;
    background: #f5f5f5;
    box-shadow: 0 2px 0 #9a9ab0;
    font: 700 13px/1.4 system-ui, sans-serif;
    color: #1a1a2e;
    text-align: center;
    text-shadow: none;
  }
</style>
<div class="interact-prompt">Press <kbd>{{key}}</kbd></div>
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
  const nearestEntity = game.query.nearest(entity.position.x, entity.position.y, {
    with: [Interactable] as const,
    exclude: entity,
    where: (candidate, { distance }) => distance <= candidate.get(Interactable).radius,
  })
  if (!nearestEntity) {
    game.ui.hide(INTERACTABLE_UI_PIECE)
    return
  }
  const nearest = nearestEntity.get(Interactable)
  if (game.input.justPressed('interact') && !game.input.consumed('interact')) {
    // The press is spent: an input:interact edge needs a NEW press.
    game.input.consume('interact')
    game.stats.set('npcLine', nearest.line)
    // Scene-scoped: the scan that hides this prompt dies with the scene, so
    // without a scope the prompt would survive a swap into a map where
    // nothing knows to hide it — stale line and all (grill decision 8).
    game.ui.show(INTERACTABLE_UI_PIECE, { scope: 'scene' })
    fireInteract(nearestEntity, entity)
  }
}
