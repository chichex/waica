import type { PrefabJson } from '@waica/engine'
import { useArchetype } from '../project/archetype'
import type { MenuEntry } from './ContextMenu'
import type { ExplorerProps, OpenMenu, Renaming } from './explorer-props'
import { prefabIcon } from './icons'
import { RenameInput } from './RenameInput'

const PREFAB_GROUPS: Array<{ title: string; type: PrefabJson['type']; createLabel: string }> = [
  { title: 'Characters', type: 'character', createLabel: 'New character' },
  { title: 'Objects', type: 'object', createLabel: 'New object' },
  { title: 'Tiles', type: 'tile', createLabel: 'New tile' },
]

/** A prefab ref's name without its folder: 'characters/hero' → 'hero'. */
export function refBase(ref: string): string {
  return ref.slice(ref.indexOf('/') + 1)
}

/** The Explorer props the prefab panels read and call. */
export type PrefabPanelsProps = Pick<
  ExplorerProps,
  | 'prefabLib'
  | 'scene'
  | 'view'
  | 'onOpenPrefab'
  | 'onCreatePrefab'
  | 'onRenamePrefab'
  | 'onAddPrefabToScene'
  | 'onDuplicatePrefab'
  | 'onDeletePrefab'
> & { openMenu: OpenMenu; renaming: Renaming }

interface PrefabGroup {
  type: PrefabJson['type']
  createLabel: string
}

/** One panel per prefab type — Characters, Objects, Tiles — listing that type's prefabs by name. */
export function PrefabPanels(props: PrefabPanelsProps) {
  return (
    <>
      {PREFAB_GROUPS.map((group) => (
        <section
          className="ed-panel"
          key={group.type}
          onContextMenu={(e) =>
            props.openMenu(e, [
              { label: group.createLabel, icon: '＋', onClick: () => props.onCreatePrefab(group.type) },
            ])
          }
        >
          <header className="ed-panel-head">
            <span>{group.title}</span>
            <button
              className="ed-mini"
              title={group.createLabel}
              onClick={() => props.onCreatePrefab(group.type)}
            >
              ＋
            </button>
          </header>
          <div className="ed-x-list">
            {Object.entries(props.prefabLib)
              .filter(([, prefab]) => prefab.type === group.type)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([ref]) => (
                <PrefabRow key={ref} prefabRef={ref} group={group} panel={props} />
              ))}
          </div>
        </section>
      ))}
    </>
  )
}

/** Menu of one prefab: open, rename, add to the open scene, duplicate, create a sibling, delete. */
function prefabMenu(ref: string, group: PrefabGroup, panel: PrefabPanelsProps): MenuEntry[] {
  return [
    { label: 'Open', icon: '▣', onClick: () => panel.onOpenPrefab(ref) },
    { label: 'Rename', icon: '✏️', onClick: () => panel.renaming.setEditing({ kind: 'prefab', name: ref }) },
    { label: 'Add to scene', icon: '＋', disabled: !panel.scene, onClick: () => panel.onAddPrefabToScene(ref) },
    { label: 'Duplicate', icon: '⧉', onClick: () => panel.onDuplicatePrefab(ref) },
    'sep',
    { label: group.createLabel, icon: '＋', onClick: () => panel.onCreatePrefab(group.type) },
    'sep',
    { label: 'Delete', icon: '🗑', danger: true, onClick: () => panel.onDeletePrefab(ref) },
  ]
}

/** One prefab: open it, drag it into the scene, rename it inline, or act from its menu. */
function PrefabRow({
  prefabRef: ref,
  group,
  panel,
}: {
  prefabRef: string
  group: PrefabGroup
  panel: PrefabPanelsProps
}) {
  const archetype = useArchetype()
  const base = refBase(ref)
  const { renaming } = panel
  if (renaming.editing?.kind === 'prefab' && renaming.editing.name === ref) {
    return (
      <div className="ed-x-item is-editing">
        <span className="ed-x-ico">{prefabIcon(base, archetype)}</span>
        <RenameInput
          value={base}
          onCommit={(next) => {
            renaming.setEditing(null)
            panel.onRenamePrefab(ref, next)
          }}
          onCancel={() => renaming.setEditing(null)}
        />
      </div>
    )
  }
  return (
    <button
      className={`ed-x-item ${panel.view?.kind === 'prefab' && panel.view.ref === ref ? 'is-selected' : ''}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('waica/prefab', ref)
        e.dataTransfer.effectAllowed = 'copy'
      }}
      onClick={() => panel.onOpenPrefab(ref)}
      onDoubleClick={() => renaming.setEditing({ kind: 'prefab', name: ref })}
      onContextMenu={(e) => panel.openMenu(e, prefabMenu(ref, group, panel))}
    >
      <span className="ed-x-ico">{prefabIcon(base, archetype)}</span>
      {base}
    </button>
  )
}
