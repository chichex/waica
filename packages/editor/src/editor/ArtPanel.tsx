import { useMemo, useRef, useState, type DragEvent, type RefObject } from 'react'
import { reportRejection } from '../report-rejection'
import { filterArt } from './ArtPicker'
import type { MenuEntry } from './ContextMenu'
import type { ExplorerProps, OpenMenu } from './explorer-props'
import {
  buildArtTree,
  collectDroppedFiles,
  type ArtFolder,
  type ArtItem,
  type DroppedFile,
} from './use-project-art'

/** The Explorer props the Art panel reads and calls. */
export type ArtPanelProps = Pick<
  ExplorerProps,
  | 'fs'
  | 'art'
  | 'view'
  | 'mode'
  | 'previewingPath'
  | 'importProgress'
  | 'onImportArt'
  | 'onRefreshArt'
  | 'onArtDeleted'
  | 'onOpenArt'
  | 'onPreviewSound'
  | 'onStopPreview'
> & { openMenu: OpenMenu }

/** What an art row can do besides what the panel's props already offer. */
interface ArtRowActions {
  panel: ArtPanelProps
  /** Opens the system file chooser to import art. */
  pickArt: () => void
  deleteArt: (item: ArtItem) => void
}

/**
 * The Art panel: the project's images and sounds as a folder tree with
 * search, imported by drop (folders included) or the file chooser.
 */
export function ArtPanel(panel: ArtPanelProps) {
  const { art, openMenu } = panel
  const drop = useArtDrop(panel.onImportArt)
  const filePicker = useRef<HTMLInputElement>(null)
  const pickArt = (): void => filePicker.current?.click()
  const actions: ArtRowActions = {
    panel,
    pickArt,
    deleteArt: (item) => reportRejection(deleteArt(item, panel), 'delete art'),
  }

  return (
    <section
      className={`ed-panel ${drop.dropping ? 'is-dropping' : ''}`}
      onContextMenu={(e) => openMenu(e, [{ label: 'Import art…', icon: '🖼️', onClick: pickArt }])}
      onDragOver={drop.onDragOver}
      onDragLeave={drop.onDragLeave}
      onDrop={drop.onDrop}
    >
      <header className="ed-panel-head">
        <span>Art</span>
        <button className="ed-mini" title="Import art" onClick={pickArt}>
          ＋
        </button>
      </header>
      <ArtFileInput inputRef={filePicker} onImportArt={panel.onImportArt} />
      {(drop.scanning || panel.importProgress) && (
        <div className="ed-x-progress">
          {panel.importProgress
            ? `Importing ${panel.importProgress.done}/${panel.importProgress.total}…`
            : 'Scanning dropped folders…'}
        </div>
      )}
      <SearchableArtTree art={art} actions={actions} />
    </section>
  )
}

/** The hidden system file chooser behind "Import art…": images and sounds, several at once. */
function ArtFileInput({
  inputRef,
  onImportArt,
}: {
  inputRef: RefObject<HTMLInputElement | null>
  onImportArt: (files: DroppedFile[]) => Promise<void>
}) {
  return (
    <input
      ref={inputRef}
      type="file"
      accept=".png,.jpg,.jpeg,.ogg"
      multiple
      hidden
      onChange={(e) => {
        const files: DroppedFile[] = [...(e.currentTarget.files ?? [])].map((file) => ({
          file,
          relativePath: file.name,
        }))
        reportRejection(onImportArt(files), 'import art')
        e.currentTarget.value = ''
      }}
    />
  )
}

/**
 * Deletes an art file after confirming. Deleting the file currently
 * previewing (review finding 1) removes its row entirely on the next scan,
 * so keying the toggle by path has nothing left to match against — the
 * preview must be stopped here explicitly, or it plays on with no control
 * left to reach it.
 */
async function deleteArt(item: ArtItem, panel: ArtPanelProps): Promise<void> {
  if (!window.confirm(`Delete ${item.label}? This cannot be undone.`)) return
  if (panel.previewingPath === item.path) panel.onStopPreview()
  await panel.fs.deleteFile(item.path)
  panel.onArtDeleted(item.path)
  panel.onRefreshArt()
}

/** Files dragged in from the OS (folders included) imported as art, with a scanning state while folders are walked. */
function useArtDrop(onImportArt: (files: DroppedFile[]) => Promise<void>) {
  const [dropping, setDropping] = useState(false)
  /** True while a drop's folders are being walked, before importArt's own per-file progress starts. */
  const [scanning, setScanning] = useState(false)
  return {
    dropping,
    scanning,
    onDragOver: (e: DragEvent): void => {
      if (!e.dataTransfer.types.includes('Files')) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      setDropping(true)
    },
    onDragLeave: (e: DragEvent): void => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false)
    },
    onDrop: (e: DragEvent): void => {
      if (!e.dataTransfer.types.includes('Files')) return
      e.preventDefault()
      setDropping(false)
      const dataTransfer = e.dataTransfer
      setScanning(true)
      reportRejection(
        collectDroppedFiles(dataTransfer)
          .then((files) => onImportArt(files))
          .finally(() => setScanning(false)),
        'import dropped art',
      )
    },
  }
}

/** The art search and the art tree it filters: while searching, only matches show, every folder expanded. */
function SearchableArtTree({ art, actions }: { art: ArtItem[]; actions: ArtRowActions }) {
  const [query, setQuery] = useState('')
  /** Expanded art folder paths; absent = collapsed. */
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const filtering = query.trim() !== ''
  const tree = useMemo(() => buildArtTree(filterArt(art, query)), [art, query])
  const toggle = (path: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }
  return (
    <>
      {art.length > 0 && (
        <input
          className="ed-art-search"
          type="search"
          placeholder="Search art…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      )}
      <div className="ed-x-list">
        <ArtFolderContents
          folder={tree}
          isOpen={(path) => filtering || expanded.has(path)}
          onToggle={toggle}
          actions={actions}
        />
        {filtering && tree.folders.length === 0 && tree.items.length === 0 ? (
          <div className="ed-x-empty">no art matches “{query.trim()}”</div>
        ) : (
          <div className="ed-x-empty">Drop art here or press ＋</div>
        )}
      </div>
    </>
  )
}

interface ArtFolderContentsProps {
  folder: ArtFolder
  isOpen: (path: string) => boolean
  onToggle: (path: string) => void
  actions: ArtRowActions
}

/** A folder's subfolders (each toggling open over its own contents), then its files. */
function ArtFolderContents({ folder, isOpen, onToggle, actions }: ArtFolderContentsProps) {
  return (
    <>
      {folder.folders.map((sub) => {
        const isCollapsed = !isOpen(sub.path)
        return (
          <div key={sub.path}>
            <button className="ed-x-item" onClick={() => onToggle(sub.path)}>
              <span className="ed-x-caret">{isCollapsed ? '▸' : '▾'}</span>
              <span className="ed-x-ico">{isCollapsed ? '📁' : '📂'}</span>
              {sub.name}
            </button>
            {!isCollapsed && (
              <div className="ed-x-indent">
                <ArtFolderContents folder={sub} isOpen={isOpen} onToggle={onToggle} actions={actions} />
              </div>
            )}
          </div>
        )
      })}
      {folder.items.map((item) => (
        <ArtRow key={item.path} item={item} actions={actions} />
      ))}
    </>
  )
}

/** The import and delete entries every art row's menu ends with. */
function artFileEntries(item: ArtItem, actions: ArtRowActions): MenuEntry[] {
  return [
    { label: 'Import art…', icon: '＋', onClick: actions.pickArt },
    'sep',
    { label: 'Delete', icon: '🗑', danger: true, onClick: () => actions.deleteArt(item) },
  ]
}

/** One art file's row, by what it is: a sound previews, a model lists, an image opens. */
function ArtRow({ item, actions }: { item: ArtItem; actions: ArtRowActions }) {
  if (item.kind === 'sound') return <SoundRow item={item} actions={actions} />
  if (item.kind === 'model') return <ModelRow item={item} actions={actions} />
  return <ImageRow item={item} actions={actions} />
}

/**
 * A model (.glb / .gltf, issue #154) has no image stage to open and no
 * 'waica/art' texture payload to drag: Model.src picks it from the
 * inspector, so its row is a label with the file menu.
 */
function ModelRow({ item, actions }: { item: ArtItem; actions: ArtRowActions }) {
  return (
    <div
      className="ed-x-item"
      onContextMenu={(e) => actions.panel.openMenu(e, artFileEntries(item, actions))}
    >
      <span className="ed-x-ico">🧊</span>
      {item.label}
    </div>
  )
}

/** An image: opens on the stage, and drags out as a texture ('waica/art'). */
function ImageRow({ item, actions }: { item: ArtItem; actions: ArtRowActions }) {
  const { panel } = actions
  const selected = panel.view?.kind === 'art' && panel.view.path === item.path
  return (
    <button
      className={`ed-x-item ${selected ? 'is-selected' : ''}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('waica/art', item.uri)
        e.dataTransfer.effectAllowed = 'copy'
      }}
      onClick={() => panel.onOpenArt(item)}
      onContextMenu={(e) =>
        panel.openMenu(e, [
          { label: 'Open', icon: '🖼️', onClick: () => panel.onOpenArt(item) },
          ...artFileEntries(item, actions),
        ])
      }
    >
      <span className="ed-x-ico">🖼️</span>
      {item.label}
    </button>
  )
}

/**
 * A sound row has no image-stage equivalent to open (CA-17/CA-18): its
 * interactive element is the preview control, not a click-to-view row. It
 * also isn't draggable: nothing consumes a sound over the 'waica/art'
 * payload today (ref: 'sound' props render as a picker, not a drop
 * target — see ref-targets.ts), and offering that payload let a sound get
 * dropped onto a sprite's texture (review finding A).
 */
function SoundRow({ item, actions }: { item: ArtItem; actions: ArtRowActions }) {
  const { panel } = actions
  const preview = soundPreview(item, panel)
  return (
    <div
      className="ed-x-item ed-x-sound"
      onContextMenu={(e) =>
        panel.openMenu(e, [
          {
            label: preview.isPlaying ? 'Stop' : 'Preview',
            icon: preview.isPlaying ? '⏹' : '▶',
            disabled: preview.blocked,
            title: preview.blockedTitle,
            onClick: preview.toggle,
          },
          ...artFileEntries(item, actions),
        ])
      }
    >
      <button
        type="button"
        className={`ed-sound-play${preview.isPlaying ? ' is-playing' : ''}`}
        title={preview.blockedTitle ?? (preview.isPlaying ? 'Stop' : 'Preview')}
        disabled={preview.blocked}
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          if (preview.blocked) return
          preview.toggle()
        }}
      >
        {preview.isPlaying ? '⏹' : '▶'}
      </button>
      <span className="ed-x-ico">🔊</span>
      {item.label}
    </div>
  )
}

/**
 * A sound row's preview state. At most one preview plays at a time (review
 * finding B), so the row whose path is the one currently playing gets the
 * stop affordance; every other row (including this one when idle) offers to
 * play. Keyed on path, not url (review finding 1): url is a volatile object
 * URL that useProjectArt revokes and recreates on every re-scan, while path
 * is the stable project path. While the game runs, previews are blocked.
 */
function soundPreview(item: ArtItem, panel: ArtPanelProps) {
  const isPlaying = panel.previewingPath === item.path
  const blocked = panel.mode === 'play'
  return {
    isPlaying,
    blocked,
    blockedTitle: blocked ? 'Stop the game to preview sounds' : undefined,
    toggle: (): void => (isPlaying ? panel.onStopPreview() : panel.onPreviewSound(item)),
  }
}
