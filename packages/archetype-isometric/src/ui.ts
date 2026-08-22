import { INTERACTABLE_UI } from '@waica/behaviors'

export const ISOMETRIC_UI: Record<string, string> = {
  'crate-counter': `<style>
  .crate-counter {
    position: absolute;
    top: 12px;
    left: 12px;
    font: 600 20px system-ui, sans-serif;
    color: #ffd166;
    text-shadow: 0 1px 3px #000a;
    user-select: none;
  }
</style>
<div class="crate-counter">📦 {{points}}</div>
`,
  ...INTERACTABLE_UI,
}
