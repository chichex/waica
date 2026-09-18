import type { StatValue } from './stats.js'

const BINDING = /\{\{\s*([\w-]+)\s*\}\}/g

/** How a bound value reads in a piece: booleans as ✓/✕, missing as empty. */
export function renderStat(value: StatValue | undefined): string {
  if (value === undefined) return ''
  if (typeof value === 'boolean') return value ? '✓' : '✕'
  return String(value)
}

/**
 * Splits every {{name}} placeholder in the fragment's text into its own
 * (empty) text node and returns those nodes with the names they bind, in
 * document order — the caller fills and keeps them in sync. Text-only by
 * design: the binding language has no expressions — presentation, never
 * logic. Shared by screen pieces (Game stats) and Anchored Pieces (their
 * own values first, then the Game stats).
 */
export function placeholders(root: HTMLElement): Array<[name: string, text: Text]> {
  const bound: Array<[name: string, text: Text]> = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  const targets: Text[] = []
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    // Braces inside <style>/<script> are CSS/code, not bindings.
    if ((node as Text).parentElement?.closest('style, script')) continue
    if ((node.nodeValue ?? '').includes('{{')) targets.push(node as Text)
  }
  for (const text of targets) {
    const source = text.nodeValue ?? ''
    const parts: Node[] = []
    let last = 0
    for (const match of source.matchAll(BINDING)) {
      const name = match[1]
      if (name === undefined) continue
      if (match.index > last) parts.push(document.createTextNode(source.slice(last, match.index)))
      const placeholder = document.createTextNode('')
      bound.push([name, placeholder])
      parts.push(placeholder)
      last = match.index + match[0].length
    }
    if (parts.length === 0) continue
    if (last < source.length) parts.push(document.createTextNode(source.slice(last)))
    text.replaceWith(...parts)
  }
  return bound
}
