import { HEALTH_UI } from '@waica/behaviors'

/**
 * The HUD (issue #181 CA-27): the player's hearts (HeartsHud fills them), a
 * controls hint until the first action (ControlsHint hides it), the goal's
 * "You win" (GoalChest shows it), and the stock health bar and damage numbers
 * the skeletons carry.
 */
export const THIRD_PERSON_UI: Record<string, string> = {
  'player-health': `<style>
  .player-health {
    position: absolute;
    top: 12px;
    left: 12px;
    font: 600 26px system-ui, sans-serif;
    text-shadow: 0 1px 3px #000a;
    user-select: none;
  }
  .heart { color: #ef476f; }
  .heart.half { opacity: 0.6; }
  .heart.empty { color: #555c; }
</style>
<div class="player-health" role="status"><span class="hearts"></span></div>
`,
  'controls-hint': `<style>
  .controls-hint {
    position: absolute;
    left: 50%;
    bottom: 16px;
    transform: translateX(-50%);
    padding: 8px 14px;
    border-radius: 8px;
    background: #000a;
    color: #f1f1f1;
    font: 500 14px system-ui, sans-serif;
    white-space: nowrap;
    user-select: none;
  }
</style>
<div class="controls-hint">WASD move · Space jump · click or J attack · Shift run · C roll · mouse or Q/E orbit · wheel zoom</div>
`,
  'you-win': `<style>
  .you-win {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    font: 800 64px system-ui, sans-serif;
    color: #ffd166;
    text-shadow: 0 3px 8px #000c;
    user-select: none;
  }
</style>
<div class="you-win" role="status">You win</div>
`,
  ...HEALTH_UI,
}
