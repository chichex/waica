/**
 * The stock Anchored Pieces (issue #72, ADR 0018) a Health can name
 * through its damageNumber and healthBar params. Registering them only
 * makes them available: nothing shows until a Health names one. Each draws
 * itself above its zero-size anchor box, centred on it.
 *
 * damage-number reads the hit's `{{amount}}` and rises and fades over the
 * 0.8 s the instance lives. health-bar has no text at all: it is driven by
 * the `--current` / `--max` custom properties its instance publishes, and
 * is one world unit wide (`--waica-unit`) at any zoom.
 */
export const HEALTH_UI: Readonly<Record<string, string>> = {
  'damage-number': `<style>
  .damage-number {
    position: absolute;
    left: 0;
    bottom: 0;
    transform: translate(-50%, 0);
    width: max-content;
    font: 800 20px/1 system-ui, sans-serif;
    color: #ff5d73;
    white-space: nowrap;
    text-shadow: 0 2px 0 #000, 0 0 4px #000c;
    pointer-events: none;
    user-select: none;
    animation: damage-number-rise 0.8s ease-out forwards;
  }
  @keyframes damage-number-rise {
    from {
      transform: translate(-50%, 0) scale(1.25);
      opacity: 1;
    }
    60% {
      opacity: 1;
    }
    to {
      transform: translate(-50%, calc(-0.8 * var(--waica-unit, 40px))) scale(1);
      opacity: 0;
    }
  }
</style>
<div class="damage-number">-{{amount}}</div>
`,
  'health-bar': `<style>
  .health-bar {
    position: absolute;
    left: 0;
    bottom: 0;
    transform: translate(-50%, 0);
    box-sizing: border-box;
    width: var(--waica-unit, 40px);
    height: 7px;
    padding: 1px;
    border-radius: 4px;
    background: #1a1a2ecc;
    border: 1px solid #ffffff2e;
    pointer-events: none;
    user-select: none;
  }
  .health-bar-fill {
    width: calc(var(--current) / var(--max) * 100%);
    height: 100%;
    border-radius: 2px;
    background: #ef476f;
    transition: width 0.15s ease-out;
  }
</style>
<div class="health-bar"><div class="health-bar-fill"></div></div>
`,
}
