import { INTERACTABLE_UI } from '@waica/behaviors'

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
  ...INTERACTABLE_UI,
}
