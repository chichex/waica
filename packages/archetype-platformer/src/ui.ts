/**
 * The archetype's default UI pieces: self-contained HTML fragments
 * (markup + <style>, {{stat}} bindings) keyed by piece name. Projects
 * override them with src/ui/<name>.html files; scenes list the pieces
 * they start with in their "ui" field.
 *
 * TS template literals (not .html files) because this package builds
 * with plain tsc — no bundler to inline raw imports.
 */
export const PLATFORMER_UI: Record<string, string> = {
  'coin-counter': `<style>
  .coin-counter {
    position: absolute;
    top: 12px;
    left: 12px;
    font: 600 20px system-ui, sans-serif;
    color: #ffd166;
    text-shadow: 0 1px 3px #000a;
    user-select: none;
  }
</style>
<div class="coin-counter">🪙 {{points}}</div>
`,
}
