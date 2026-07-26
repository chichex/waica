import type { ProjectFS, TreeNode } from './project-fs'

/**
 * UI pieces on disk: src/ui/<name>.html — self-contained HTML fragments
 * (markup + <style> + {{stat}} bindings). Pure presentation: behaviour
 * always comes from code (game.ui).
 */

const SUFFIX = '.html'

function findDir(nodes: TreeNode[] | undefined, name: string): TreeNode | undefined {
  return nodes?.find((n) => n.kind === 'dir' && n.name === name)
}

/** File path for a UI piece name, e.g. 'coin-counter' -> 'src/ui/coin-counter.html'. */
export function uiPath(name: string): string {
  return `src/ui/${name}${SUFFIX}`
}

/**
 * The project's UI pieces, keyed by name ('coin-counter') — its own files and
 * nothing else, exactly like prefabs. The archetype's pieces are a starting
 * point that `projectFiles` writes to disk when a project is created, never a
 * hidden layer underneath: a piece the Explorer doesn't list does not exist,
 * and one you delete stays deleted.
 */
export async function loadUiLib(fs: ProjectFS): Promise<Record<string, string>> {
  const pieces: Record<string, string> = {}
  const src = findDir(await fs.tree(), 'src')
  const files = findDir(src?.children, 'ui')?.children ?? []
  for (const file of files) {
    if (file.kind !== 'file' || !file.name.endsWith(SUFFIX)) continue
    const text = await fs.readText(file.path)
    if (text == null) continue
    pieces[file.name.slice(0, -SUFFIX.length)] = text
  }
  return pieces
}

export async function saveUi(fs: ProjectFS, name: string, html: string): Promise<void> {
  await fs.writeText(uiPath(name), html)
}

/** Starter content for a brand-new piece. */
export const NEW_UI_HTML = `<style>
  .my-ui {
    position: absolute;
    top: 12px;
    left: 12px;
    font: 600 20px system-ui, sans-serif;
    color: #fff;
  }
</style>
<div class="my-ui">✨ {{points}}</div>
`
