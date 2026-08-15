/**
 * The archetype's default UI pieces: self-contained HTML fragments
 * (markup + <style>, {{stat}} bindings) keyed by piece name. Projects
 * override them with src/ui/<name>.html files; scenes list the pieces
 * they start with in their "ui" field.
 *
 * TS template literals (not .html files) because this package builds
 * with plain tsc — no bundler to inline raw imports.
 */
export const TOPDOWN_UI: Record<string, string> = {
  'potion-counter': `<style>
  .potion-counter {
    position: absolute;
    top: 12px;
    left: 12px;
    font: 600 20px system-ui, sans-serif;
    color: #ff6b6b;
    text-shadow: 0 1px 3px #000a;
    user-select: none;
  }
</style>
<div class="potion-counter">🧪 {{points}}</div>
`,
  'npc-line': `<style>
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
