import { useEffect, useState } from 'react'
import type { PrefabJson, SceneEntityJson, SceneJson } from '@waica/engine'
import { ACTIVE_ARCHETYPE } from '../project/archetype'
import { RealFS, type ProjectFS, type TreeNode } from '../fs/project-fs'
import { resolveComponents } from '../scene/ops'

/** What the center pane (and the inspector) is looking at. */
export type ExplorerView =
  | { kind: 'scene'; path: string }
  | { kind: 'prefab'; ref: string }
  | { kind: 'script'; name: string }
  | { kind: 'art'; label: string; url: string }

export interface ArtItem {
  label: string
  url: string
}

const PREFAB_GROUPS: Array<{ title: string; type: PrefabJson['type'] }> = [
  { title: 'Characters', type: 'character' },
  { title: 'Objects', type: 'object' },
  { title: 'Tiles', type: 'tile' },
  { title: 'UI', type: 'ui' },
]

const PREFAB_ICONS = new Map(ACTIVE_ARCHETYPE.palette.map((t) => [t.label, t.icon]))

/** Registry components that declare inspector params are the editable "scripts". */
const SCRIPTS = Object.entries(ACTIVE_ARCHETYPE.registry.components)
  .filter(([, Class]) => Class.params && Object.keys(Class.params).length > 0)
  .map(([name]) => name)

const resolveAsset = ACTIVE_ARCHETYPE.registry.resolveAsset ?? ((uri: string) => uri)
const BUILTIN_ART: ArtItem[] = [
  { label: 'waica-dog.png', url: resolveAsset('waica:dog') },
  { label: 'waica-coin.png', url: resolveAsset('waica:coin') },
  { label: 'waica-slime.png', url: resolveAsset('waica:slime') },
]

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

/** Blob URL for a binary project file (File System Access API only). */
async function fileUrl(root: FileSystemDirectoryHandle, path: string): Promise<string | null> {
  const parts = path.split('/')
  const name = parts.pop()
  if (!name) return null
  let dir = root
  try {
    for (const part of parts) dir = await dir.getDirectoryHandle(part)
    const file = await (await dir.getFileHandle(name)).getFile()
    return URL.createObjectURL(file)
  } catch {
    return null
  }
}

export function Explorer({
  fs,
  scenePaths,
  openScenePath,
  scene,
  view,
  selected,
  prefabLib,
  onOpenScene,
  onSelectEntity,
  onAddEntity,
  onCreateScene,
  onOpenPrefab,
  onOpenScript,
  onOpenArt,
}: {
  fs: ProjectFS
  scenePaths: string[]
  openScenePath: string | null
  /** The open scene's contents (for the expanded entity subtree). */
  scene: SceneJson | null
  view: ExplorerView | null
  selected: string | null
  prefabLib: Record<string, PrefabJson>
  onOpenScene(path: string): void
  onSelectEntity(name: string): void
  onAddEntity(): void
  onCreateScene(): void
  onOpenPrefab(ref: string): void
  onOpenScript(name: string): void
  onOpenArt(item: ArtItem): void
}) {
  const [art, setArt] = useState<ArtItem[]>(BUILTIN_ART)

  useEffect(() => {
    let cancelled = false
    const created: string[] = []
    const load = async (): Promise<ArtItem[]> => {
      if (!(fs instanceof RealFS)) return []
      const tree = await fs.tree()
      const findDir = (nodes: TreeNode[] | undefined, name: string): TreeNode | undefined =>
        nodes?.find((n) => n.kind === 'dir' && n.name === name)
      const roots = [findDir(findDir(tree, 'src')?.children, 'art'), findDir(tree, 'public')]
      const files: TreeNode[] = []
      const walk = (nodes?: TreeNode[]): void => {
        for (const node of nodes ?? []) {
          if (node.kind === 'dir') walk(node.children)
          else if (/\.(png|jpe?g)$/i.test(node.name)) files.push(node)
        }
      }
      for (const root of roots) walk(root?.children)
      const items: ArtItem[] = []
      for (const file of files) {
        const url = await fileUrl(fs.handle, file.path)
        if (!url) continue
        created.push(url)
        items.push({ label: file.name, url })
      }
      return items
    }
    void load().then((items) => {
      if (!cancelled) setArt([...BUILTIN_ART, ...items])
    })
    return () => {
      cancelled = true
      for (const url of created) URL.revokeObjectURL(url)
    }
  }, [fs])

  return (
    <>
      <section className="ed-panel">
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
                  <button className="ed-x-item" onClick={() => onOpenScene(path)}>
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

      {PREFAB_GROUPS.map(({ title, type }) => (
        <section className="ed-panel" key={type}>
          <header className="ed-panel-head">
            <span>{title}</span>
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
                  >
                    <span className="ed-x-ico">{PREFAB_ICONS.get(base) ?? '▣'}</span>
                    {base}
                  </button>
                )
              })}
          </div>
        </section>
      ))}

      <section className="ed-panel">
        <header className="ed-panel-head">
          <span>Scripts</span>
        </header>
        <div className="ed-x-list">
          {SCRIPTS.map((name) => (
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
          ))}
        </div>
      </section>

      <section className="ed-panel">
        <header className="ed-panel-head">
          <span>Art</span>
        </header>
        <div className="ed-x-list">
          {art.map((item) => (
            <button
              key={item.label}
              className={`ed-x-item ${
                view?.kind === 'art' && view.label === item.label ? 'is-selected' : ''
              }`}
              onClick={() => onOpenArt(item)}
            >
              <span className="ed-x-ico">🖼️</span>
              {item.label}
            </button>
          ))}
        </div>
      </section>
    </>
  )
}
