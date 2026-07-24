import { useState } from 'react'
import { artDisplayPath, type ArtItem } from './use-project-art'

/** Case-insensitive art filter over label and project path. */
export function filterArt(art: ArtItem[], query: string): ArtItem[] {
  const q = query.trim().toLowerCase()
  if (!q) return art
  return art.filter(
    (item) => item.label.toLowerCase().includes(q) || item.path.toLowerCase().includes(q),
  )
}

/** The folder an art item lives in, '' for root files. */
export function artDirOf(item: ArtItem): string {
  return artDisplayPath(item).split('/').slice(0, -1).join('/')
}

/** Buckets art by folder — root files first, then folders A→Z, items A→Z inside. */
export function groupArtByFolder(art: ArtItem[]): Array<{ folder: string; items: ArtItem[] }> {
  const groups = new Map<string, ArtItem[]>()
  for (const item of art) {
    const folder = artDirOf(item)
    const list = groups.get(folder)
    if (list) list.push(item)
    else groups.set(folder, [item])
  }
  return [...groups.entries()]
    .sort(([a], [b]) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)))
    .map(([folder, items]) => ({
      folder,
      items: [...items].sort((a, b) => a.label.localeCompare(b.label)),
    }))
}

/**
 * Searchable thumbnail grid grouped by folder — the shared body of every art
 * picker (animation sheet picker, appearance picker). The host renders its own
 * surrounding chrome: hint text, import/cancel buttons, drop handling.
 */
export function ArtSearchGrid({
  art,
  onPick,
}: {
  art: ArtItem[]
  onPick(uri: string): void
}) {
  const [query, setQuery] = useState('')
  const filtered = filterArt(art, query)
  const groups = groupArtByFolder(filtered)
  return (
    <>
      {art.length > 0 && (
        <input
          className="ed-art-search"
          type="search"
          placeholder="Search art…"
          value={query}
          autoFocus
          onChange={(e) => setQuery(e.target.value)}
        />
      )}
      {groups.map(({ folder, items }) => (
        <div key={folder || '(root)'} className="ed-art-group">
          {folder && <header className="ed-art-group-head">📁 {folder}</header>}
          <div className="ed-anim-thumbs">
            {items.map((item) => (
              <button
                key={item.uri}
                className="ed-anim-thumb"
                title={artDisplayPath(item)}
                onClick={() => onPick(item.uri)}
              >
                <img src={item.url} alt={item.label} />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
      {art.length > 0 && filtered.length === 0 && (
        <div className="ed-hint">no art matches “{query.trim()}”</div>
      )}
    </>
  )
}
