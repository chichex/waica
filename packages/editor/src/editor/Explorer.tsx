import { useState, type MouseEvent } from 'react'
import { ArtPanel } from './ArtPanel'
import { ContextMenu, type MenuEntry, type MenuState } from './ContextMenu'
import type { ExplorerProps, RenameTarget } from './explorer-props'
import { ComponentsPanel, ProjectFilesPanel, UiPiecesPanel } from './ExplorerPanels'
import { PrefabPanels } from './PrefabPanels'
import { ScenesPanel } from './ScenesPanel'

// The contract and helpers the editor imports from here, where they have
// always lived; the panels define them in their own modules.
export type { ExplorerView } from './explorer-props'
export { refBase } from './PrefabPanels'

/**
 * The editor's left column: the project's scenes (the open one as a tree),
 * prefabs, UI pieces, components, art and project files. It owns what the
 * panels share — the context menu and the one inline rename at a time —
 * and leaves every edit to the Editor through its callbacks.
 */
export function Explorer(props: ExplorerProps) {
  const [menu, setMenu] = useState<MenuState | null>(null)
  const [editing, setEditing] = useState<RenameTarget | null>(null)
  const renaming = { editing, setEditing }

  const openMenu = (e: MouseEvent, entries: MenuEntry[]): void => {
    e.preventDefault()
    e.stopPropagation()
    setMenu({ x: e.clientX, y: e.clientY, entries })
  }

  return (
    <>
      <ScenesPanel {...props} openMenu={openMenu} renaming={renaming} />
      <PrefabPanels {...props} openMenu={openMenu} renaming={renaming} />
      <UiPiecesPanel {...props} openMenu={openMenu} />
      <ComponentsPanel {...props} openMenu={openMenu} />
      <ArtPanel {...props} openMenu={openMenu} />
      <ProjectFilesPanel {...props} />
      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
    </>
  )
}
