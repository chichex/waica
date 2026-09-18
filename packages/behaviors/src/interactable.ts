import {
  Component,
  type AnchoredPieceHandle,
  type Entity,
  type Game,
  type StateContext,
} from '@waica/engine'
import { anchorHeight } from './anchor-height.js'

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

/** An Anchored Piece Interactable put on an NPC, and that NPC. */
interface NpcPiece {
  npc: Entity
  handle: AnchoredPieceHandle
}

/** What Interactable has anchored for one player (issue #72). */
interface PlayerPieces {
  /** The one open speech bubble (CA-11). */
  bubble: NpcPiece | null
  /** The one interact prompt (CA-12). */
  prompt: NpcPiece | null
}

/**
 * Keyed by the player entity, so the interact key and a ClickToMove arrival
 * share one bubble, and nothing outlives the player or its Game.
 */
const piecesByPlayer = new WeakMap<Entity, PlayerPieces>()

function piecesOf(player: Entity): PlayerPieces {
  let pieces = piecesByPlayer.get(player)
  if (!pieces) {
    pieces = { bubble: null, prompt: null }
    piecesByPlayer.set(player, pieces)
  }
  return pieces
}

function closeBubble(pieces: PlayerPieces): void {
  pieces.bubble?.handle.remove()
  pieces.bubble = null
}

function closePrompt(pieces: PlayerPieces): void {
  pieces.prompt?.handle.remove()
  pieces.prompt = null
}

/** A key code as the prompt shows it: 'KeyE' → 'E', 'Digit1' → '1', 'Space' and 'ArrowUp' as they are. */
function keyLabel(code: string): string {
  return code.replace(/^(?:Key|Digit)/, '')
}

/**
 * Keeps the interact prompt (CA-12) on `nearest`, the nearest Interactable
 * in range: exactly one interact-prompt with values { key }, the first key
 * bound to interact — when the project defines the piece and binds the
 * action, and never while a bubble is open. Otherwise none, and nothing
 * logged: the piece's presence is checked before any attach.
 */
function syncPrompt(game: Game, pieces: PlayerPieces, nearest: Entity): void {
  const code = game.ui.names().includes(INTERACT_PROMPT_PIECE)
    ? game.input.bindingsFor('interact')[0]
    : undefined
  if (code === undefined || pieces.bubble?.handle.alive) {
    closePrompt(pieces)
    return
  }
  if (pieces.prompt?.handle.alive && pieces.prompt.npc === nearest) return
  closePrompt(pieces)
  pieces.prompt = {
    npc: nearest,
    handle: game.ui.attach(INTERACT_PROMPT_PIECE, nearest, {
      offset: [0, anchorHeight(nearest)],
      values: { key: keyLabel(code) },
    }),
  }
}

/**
 * `player` interacts with `target`, the NPC its Interactable belongs to.
 * The one interaction both paths run — the interact key (interactUpdate)
 * and a ClickToMove arrival (grill S8): publishes the line through the
 * npcLine stat; shows it in an npc-bubble anchored to the NPC when the
 * project defines that piece, replacing any bubble already open and
 * taking the prompt's place (CA-11, CA-12), else in the npc-line screen
 * piece as before; then fires onInteract.
 */
export function interactWith(game: Game, player: Entity, target: Entity, interactable: Interactable): void {
  game.stats.set('npcLine', interactable.line)
  if (game.ui.names().includes(NPC_BUBBLE_PIECE)) {
    const pieces = piecesOf(player)
    closeBubble(pieces)
    pieces.bubble = {
      npc: target,
      handle: game.ui.attach(NPC_BUBBLE_PIECE, target, {
        offset: [0, anchorHeight(target)],
        values: { line: interactable.line },
      }),
    }
    // The bubble answers the prompt: it goes while the bubble is open (CA-12).
    closePrompt(pieces)
  } else {
    // Scene-scoped: the scan that hides npc-line dies with the scene, so
    // without a scope the line would survive a swap into a map where
    // nothing knows to hide it — stale text and all (grill decision 8).
    game.ui.show(INTERACTABLE_UI_PIECE, { scope: 'scene' })
  }
  fireInteract(target, player)
}

/**
 * The player role's interact lookup, run by its '*' hook in every state:
 * pressing interact near an Interactable interacts with it (interactWith),
 * and the nearest one in range carries the interact prompt. The bubble
 * belongs to the nearest Interactable in range too: it closes when another
 * one becomes the nearest, and walking out of every radius closes it,
 * removes the prompt and hides npc-line. Nearest one wins when several are
 * in range.
 */
export function interactUpdate({ entity, game }: StateContext): void {
  const nearestEntity = game.query.nearest(entity.position.x, entity.position.y, {
    with: [Interactable] as const,
    exclude: entity,
    where: (candidate, { distance }) => distance <= candidate.get(Interactable).radius,
  })
  const pieces = piecesOf(entity)
  if (!nearestEntity) {
    game.ui.hide(INTERACTABLE_UI_PIECE)
    closeBubble(pieces)
    closePrompt(pieces)
    return
  }
  if (pieces.bubble && pieces.bubble.npc !== nearestEntity) closeBubble(pieces)
  if (game.input.justPressed('interact') && !game.input.consumed('interact')) {
    // The press is spent: an input:interact edge needs a NEW press.
    game.input.consume('interact')
    interactWith(game, entity, nearestEntity, nearestEntity.get(Interactable))
  }
  syncPrompt(game, pieces, nearestEntity)
}
