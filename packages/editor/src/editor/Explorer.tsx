import { useRef, useState } from 'react'
import type { PrefabJson, SceneEntityJson, SceneJson } from '@waica/engine'
import { ACTIVE_ARCHETYPE } from '../project/archetype'
import type { ProjectFS } from '../fs/project-fs'
import { behaviourTypes } from '../project/chassis'
import { resolveComponents } from '../scene/ops'
import { ContextMenu, type MenuEntry, type MenuState } from './ContextMenu'
import type { ArtItem } from './use-project-art'

/** What the center pane (and the inspector) is looking at. */
export type ExplorerView =
  | { kind: 'scene'; path: string }
  | { kind: 'prefab'; ref: string }
  | { kind: 'ui'; name: string }
  | { kind: 'script'; name: string }
  | { kind: 'art'; label: string; url: string }
  | { kind: 'controls' }
  | { kind: 'stats' }

const PREFAB_GROUPS: Array<{ title: string; type: PrefabJson['type']; createLabel: string }> = [
  { title: 'Characters', type: 'character', createLabel: 'New character' },
  { title: 'Objects', type: 'object', createLabel: 'New object' },
  { title: 'Tiles', type: 'tile', createLabel: 'New tile' },
]

const PREFAB_ICONS = new Map(ACTIVE_ARCHETYPE.palette.map((t) => [t.label, t.icon]))

/** Core chassis components (Sprite, Solid…) are not scripts: only behaviours list here. */
const BUILTIN_COMPONENTS = behaviourTypes(Object.keys(ACTIVE_ARCHETYPE.registry.components))

/** No project-authored components yet: this stays empty until that feature ships. */
const CUSTOM_COMPONENTS: string[] = []

export function refBase(ref: string): string {
  return ref.slice(ref.indexOf('/') + 1)
}

function sceneLabel(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1)
  return name.endsWith('.scene.json') ? name.slice(0, -'.scene.json'.length) : name
}

function entityIcon(entity: SceneEntityJson, prefabs: Record<string, PrefabJson>): string {
  const types = new Set(resolveComponents(entity, prefabs).map((c) => c.type))
  for (const [type, icon] of Object.entries(ACTIVE_ARCHETYPE.entityIcons)) {
    if (types.has(type)) return icon
  }
  if (types.has('Solid')) return '▬'
  return '▢'
}

export function Explorer({
  fs,
  scenePaths,
  openScenePath,
  scene,
  view,
  selected,
  prefabLib,
  uiLib,
  art,
  onImportArt,
  onRefreshArt,
  onOpenScene,
  onSelectEntity,
  onAddEntity,
  onCreateScene,
  onOpenPrefab,
  onOpenScript,
  onOpenArt,
  onOpenControls,
  onOpenStats,
  onDuplicateScene,
  onDeleteScene,
  onDuplicateEntity,
  onDeleteEntity,
  onCreatePrefab,
  onDuplicatePrefab,
  onDeletePrefab,
  onAddPrefabToScene,
  onOpenUi,
  onCreateUi,
  onDuplicateUi,
  onDeleteUi,
  onToggleUiInScene,
  onArtDeleted,
}: {
  fs: ProjectFS
  scenePaths: string[]
  openScenePath: string | null
  /** The open scene's contents (for the expanded entity subtree). */
  scene: SceneJson | null
  view: ExplorerView | null
  selected: string | null
  prefabLib: Record<string, PrefabJson>
  uiLib: Record<string, string>
  art: ArtItem[]
  onImportArt(files: File[]): Promise<void>
  onRefreshArt(): void
  onOpenScene(path: string): void
  onSelectEntity(name: string): void
  onAddEntity(): void
  onCreateScene(): void
  onOpenPrefab(ref: string): void
  onOpenScript(name: string): void
  onOpenArt(item: ArtItem): void
  onOpenControls(): void
  onOpenStats(): void
  onDuplicateScene(path: string): void
  onDeleteScene(path: string): void
  onDuplicateEntity(name: string): void
  onDeleteEntity(name: string): void
  onCreatePrefab(type: PrefabJson['type']): void
  onDuplicatePrefab(ref: string): void
  onDeletePrefab(ref: string): void
  onAddPrefabToScene(ref: string): void
  onOpenUi(name: string): void
  onCreateUi(): void
  onDuplicateUi(name: string): void
  onDeleteUi(name: string): void
  /** Adds/removes the piece from the open scene's "ui" start list. */
  onToggleUiInScene(name: string): void
  onArtDeleted(label: string): void
}) {
  const [dropping, setDropping] = useState(false)
  const [menu, setMenu] = useState<MenuState | null>(null)
  const filePicker = useRef<HTMLInputElement>(null)

  const openMenu = (e: React.MouseEvent, entries: MenuEntry[]): void => {
    e.preventDefault()
    e.stopPropagation()
    setMenu({ x: e.clientX, y: e.clientY, entries })
  }

  const pickImages = (): void => filePicker.current?.click()

  const deleteArt = async (item: ArtItem): Promise<void> => {
    if (!item.path) return
    if (!window.confirm(`Delete ${item.label}? This cannot be undone.`)) return
    await fs.deleteFile(item.path)
    onArtDeleted(item.label)
    onRefreshArt()
  }

  return (
    <>
      <section
        className="ed-panel"
        onContextMenu={(e) =>
          openMenu(e, [
            { label: 'New scene', icon: '＋', onClick: onCreateScene },
            { label: 'New entity', icon: '＋', disabled: !scene, onClick: onAddEntity },
          ])
        }
      >
        <header className="ed-panel-head">
          <span>Scenes</span>
          <button className="ed-mini" title="New scene" onClick={onCreateScene}>
            ＋
          </button>
        </header>
        <div className="ed-x-list">
          {scenePaths.map((path) => {
            const open = path === openScenePath
            return (
              <div key={path}>
                <div className="ed-x-row">
                  <button
                    className="ed-x-item"
                    onClick={() => onOpenScene(path)}
                    onContextMenu={(e) =>
                      openMenu(e, [
                        { label: 'Open', icon: '🎬', onClick: () => onOpenScene(path) },
                        { label: 'Duplicate', icon: '⧉', onClick: () => onDuplicateScene(path) },
                        'sep',
                        {
                          label: 'Delete',
                          icon: '🗑',
                          danger: true,
                          disabled: scenePaths.length <= 1,
                          onClick: () => onDeleteScene(path),
                        },
                      ])
                    }
                  >
                    <span className="ed-x-caret">{open ? '▾' : '▸'}</span>
                    <span className="ed-x-ico">🎬</span>
                    {sceneLabel(path)}
                  </button>
                  {open && (
                    <button className="ed-mini" title="New entity" onClick={onAddEntity}>
                      ＋
                    </button>
                  )}
                </div>
                {open && scene && (
                  <div className="ed-x-subtree">
                    {scene.entities.map((entity) => (
                      <button
                        key={entity.name}
                        className={`ed-x-item ${
                          view?.kind === 'scene' && selected === entity.name ? 'is-selected' : ''
                        }`}
                        onClick={() => onSelectEntity(entity.name)}
                        onContextMenu={(e) => {
                          onSelectEntity(entity.name)
                          openMenu(e, [
                            {
                              label: 'Duplicate',
                              icon: '⧉',
                              onClick: () => onDuplicateEntity(entity.name),
                            },
                            'sep',
                            {
                              label: 'Delete',
                              icon: '🗑',
                              danger: true,
                              onClick: () => onDeleteEntity(entity.name),
                            },
                          ])
                        }}
                      >
                        <span className="ed-x-ico">{entityIcon(entity, prefabLib)}</span>
                        {entity.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </section>

      {PREFAB_GROUPS.map(({ title, type, createLabel }) => (
        <section
          className="ed-panel"
          key={type}
          onContextMenu={(e) =>
            openMenu(e, [{ label: createLabel, icon: '＋', onClick: () => onCreatePrefab(type) }])
          }
        >
          <header className="ed-panel-head">
            <span>{title}</span>
            <button className="ed-mini" title={createLabel} onClick={() => onCreatePrefab(type)}>
              ＋
            </button>
          </header>
          <div className="ed-x-list">
            {Object.entries(prefabLib)
              .filter(([, prefab]) => prefab.type === type)
              .map(([ref]) => {
                const base = refBase(ref)
                return (
                  <button
                    key={ref}
                    className={`ed-x-item ${
                      view?.kind === 'prefab' && view.ref === ref ? 'is-selected' : ''
                    }`}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('waica/prefab', ref)
                      e.dataTransfer.effectAllowed = 'copy'
                    }}
                    onClick={() => onOpenPrefab(ref)}
                    onContextMenu={(e) => {
                      const builtin = ref in ACTIVE_ARCHETYPE.prefabs
                      openMenu(e, [
                        { label: 'Open', icon: '▣', onClick: () => onOpenPrefab(ref) },
                        {
                          label: 'Add to scene',
                          icon: '＋',
                          disabled: !scene,
                          onClick: () => onAddPrefabToScene(ref),
                        },
                        { label: 'Duplicate', icon: '⧉', onClick: () => onDuplicatePrefab(ref) },
                        'sep',
                        { label: createLabel, icon: '＋', onClick: () => onCreatePrefab(type) },
                        'sep',
                        {
                          label: 'Delete',
                          icon: '🗑',
                          danger: true,
                          disabled: builtin,
                          title: builtin ? 'Built-in prefabs cannot be deleted' : undefined,
                          onClick: () => onDeletePrefab(ref),
                        },
                      ])
                    }}
                  >
                    <span className="ed-x-ico">{PREFAB_ICONS.get(base) ?? '▣'}</span>
                    {base}
                  </button>
                )
              })}
          </div>
        </section>
      ))}

      <section
        className="ed-panel"
        onContextMenu={(e) =>
          openMenu(e, [{ label: 'New UI piece', icon: '＋', onClick: onCreateUi }])
        }
      >
        <header className="ed-panel-head">
          <span>UI</span>
          <button className="ed-mini" title="New UI piece" onClick={onCreateUi}>
            ＋
          </button>
        </header>
        <div className="ed-x-list">
          {Object.keys(uiLib)
            .sort()
            .map((name) => {
              const inScene = scene?.ui?.includes(name) ?? false
              const builtin = name in (ACTIVE_ARCHETYPE.registry.ui ?? {})
              return (
                <button
                  key={name}
                  className={`ed-x-item ${view?.kind === 'ui' && view.name === name ? 'is-selected' : ''}`}
                  title={inScene ? 'starts visible in the open scene' : undefined}
                  onClick={() => onOpenUi(name)}
                  onContextMenu={(e) =>
                    openMenu(e, [
                      { label: 'Open', icon: '🧩', onClick: () => onOpenUi(name) },
                      {
                        label: inScene ? 'Remove from scene' : 'Add to scene',
                        icon: inScene ? '−' : '＋',
                        disabled: !scene,
                        onClick: () => onToggleUiInScene(name),
                      },
                      { label: 'Duplicate', icon: '⧉', onClick: () => onDuplicateUi(name) },
                      'sep',
                      { label: 'New UI piece', icon: '＋', onClick: onCreateUi },
                      'sep',
                      {
                        label: 'Delete',
                        icon: '🗑',
                        danger: true,
                        disabled: builtin,
                        title: builtin ? 'Built-in UI pieces cannot be deleted' : undefined,
                        onClick: () => onDeleteUi(name),
                      },
                    ])
                  }
                >
                  <span className="ed-x-ico">🧩</span>
                  {name}
                  {inScene && <span className="ed-x-flag">●</span>}
                </button>
              )
            })}
        </div>
      </section>

      <section
        className="ed-panel"
        onContextMenu={(e) =>
          openMenu(e, [
            { label: 'New component (coming soon)', icon: '＋', disabled: true, onClick: () => {} },
          ])
        }
      >
        <header className="ed-panel-head">
          <span>Components</span>
          <button className="ed-mini" title="Custom components are coming soon" disabled>
            ＋
          </button>
        </header>
        <div className="ed-x-group-head">Built-in</div>
        <div className="ed-x-list">
          {BUILTIN_COMPONENTS.map((name) => (
            <button
              key={name}
              className={`ed-x-item ${
                view?.kind === 'script' && view.name === name ? 'is-selected' : ''
              }`}
              onClick={() => onOpenScript(name)}
              onContextMenu={(e) =>
                openMenu(e, [{ label: 'View code', icon: '📜', onClick: () => onOpenScript(name) }])
              }
            >
              <span className="ed-x-ico">📜</span>
              {name}
            </button>
          ))}
        </div>
        <div className="ed-x-group-head">Custom</div>
        <div className="ed-x-list">
          {CUSTOM_COMPONENTS.length === 0 ? (
            <div className="ed-x-empty">No custom components yet</div>
          ) : (
            CUSTOM_COMPONENTS.map((name) => (
              <button
                key={name}
                className={`ed-x-item ${
                  view?.kind === 'script' && view.name === name ? 'is-selected' : ''
                }`}
                onClick={() => onOpenScript(name)}
              >
                <span className="ed-x-ico">📜</span>
                {name}
              </button>
            ))
          )}
        </div>
      </section>

      <section
        className={`ed-panel ${dropping ? 'is-dropping' : ''}`}
        onContextMenu={(e) =>
          openMenu(e, [{ label: 'Import images…', icon: '🖼️', onClick: pickImages }])
        }
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes('Files')) return
          e.preventDefault()
          e.dataTransfer.dropEffect = 'copy'
          setDropping(true)
        }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false)
        }}
        onDrop={(e) => {
          if (!e.dataTransfer.types.includes('Files')) return
          e.preventDefault()
          setDropping(false)
          void onImportArt([...e.dataTransfer.files])
        }}
      >
        <header className="ed-panel-head">
          <span>Art</span>
          <button className="ed-mini" title="Import images" onClick={pickImages}>
            ＋
          </button>
        </header>
        <input
          ref={filePicker}
          type="file"
          accept=".png,.jpg,.jpeg"
          multiple
          hidden
          onChange={(e) => {
            void onImportArt([...(e.currentTarget.files ?? [])])
            e.currentTarget.value = ''
          }}
        />
        <div className="ed-x-list">
          {art.map((item) => (
            <button
              key={item.label}
              className={`ed-x-item ${
                view?.kind === 'art' && view.label === item.label ? 'is-selected' : ''
              }`}
              onClick={() => onOpenArt(item)}
              onContextMenu={(e) =>
                openMenu(e, [
                  { label: 'Open', icon: '🖼️', onClick: () => onOpenArt(item) },
                  { label: 'Import images…', icon: '＋', onClick: pickImages },
                  'sep',
                  {
                    label: 'Delete',
                    icon: '🗑',
                    danger: true,
                    disabled: !item.path,
                    title: item.path ? undefined : 'Built-in art cannot be deleted',
                    onClick: () => void deleteArt(item),
                  },
                ])
              }
            >
              <span className="ed-x-ico">🖼️</span>
              {item.label}
            </button>
          ))}
          <div className="ed-x-empty">Drop images here or press ＋</div>
        </div>
      </section>

      <section className="ed-panel">
        <header className="ed-panel-head">
          <span>Project</span>
        </header>
        <div className="ed-x-list">
          <button
            className={`ed-x-item ${view?.kind === 'controls' ? 'is-selected' : ''}`}
            onClick={onOpenControls}
          >
            <span className="ed-x-ico">🎮</span>
            controls
          </button>
          <button
            className={`ed-x-item ${view?.kind === 'stats' ? 'is-selected' : ''}`}
            onClick={onOpenStats}
          >
            <span className="ed-x-ico">📊</span>
            stats
          </button>
        </div>
      </section>

      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
    </>
  )
}
