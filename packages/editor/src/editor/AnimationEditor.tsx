import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { ClipPlayer, missingClips, type AnimationContract, type ClipDef } from '@waica/engine'
import { frameCount, sanitizeAnimated, uniqueClipName, type AnimatedProps } from '../project/clips'
import { IMAGE_RE, type ArtItem } from './use-project-art'

export interface AnimationEditorProps {
  /** Shown in the header: the prefab ref or entity name being edited. */
  title: string
  initial: AnimatedProps
  /** Required-clips checklist (characters only). */
  contract?: AnimationContract
  art: ArtItem[]
  urlFor(uri: string): string
  onImportArt(files: File[]): Promise<void>
  onSave(next: AnimatedProps): void
  onCancel(): void
}

/**
 * Modal spritesheet/clip editor: pick or drop a sheet, set the grid, build
 * named clips by clicking cells, and preview them live. Pure DOM/CSS — the
 * preview replays the engine's own ClipPlayer over background-position.
 */
export function AnimationEditor({
  title,
  initial,
  contract,
  art,
  urlFor,
  onImportArt,
  onSave,
  onCancel,
}: AnimationEditorProps) {
  const [draft, setDraft] = useState<AnimatedProps>(() => structuredClone(initial))
  const [selectedClip, setSelectedClip] = useState<string | null>(
    Object.keys(initial.clips)[0] ?? null,
  )
  const [playing, setPlaying] = useState(true)
  const [previewFrame, setPreviewFrame] = useState(0)
  const [choosingTexture, setChoosingTexture] = useState(false)
  const [droppingSheet, setDroppingSheet] = useState(false)
  const filePicker = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const max = frameCount(draft.cols, draft.rows)
  const clip = selectedClip ? draft.clips[selectedClip] : undefined
  const sheetUrl = draft.texture ? urlFor(draft.texture) : null
  const pixelated = draft.pixelArt !== false

  useEffect(() => {
    if (!playing || !clip || clip.frames.length === 0) return
    const player = new ClipPlayer()
    player.set(clip)
    setPreviewFrame(player.advance(0))
    let raf = 0
    let last = performance.now()
    const tick = (now: number): void => {
      setPreviewFrame(player.advance((now - last) / 1000))
      last = now
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [playing, clip])

  const patch = (p: Partial<AnimatedProps>): void => setDraft((d) => ({ ...d, ...p }))

  const patchClip = (name: string, c: Partial<ClipDef>): void =>
    setDraft((d) => {
      const cur = d.clips[name]
      return cur ? { ...d, clips: { ...d.clips, [name]: { ...cur, ...c } } } : d
    })

  const toggleFrame = (i: number): void => {
    if (!selectedClip) return
    setDraft((d) => {
      const cur = d.clips[selectedClip]
      if (!cur) return d
      const frames = cur.frames.includes(i)
        ? cur.frames.filter((f) => f !== i)
        : [...cur.frames, i]
      return { ...d, clips: { ...d.clips, [selectedClip]: { ...cur, frames } } }
    })
  }

  const removeFrameAt = (name: string, index: number): void =>
    setDraft((d) => {
      const cur = d.clips[name]
      if (!cur) return d
      const frames = cur.frames.filter((_, i) => i !== index)
      return { ...d, clips: { ...d.clips, [name]: { ...cur, frames } } }
    })

  const addClip = (): void => {
    const name = uniqueClipName(draft.clips, 'clip')
    setDraft((d) => ({ ...d, clips: { ...d.clips, [name]: { frames: [], fps: 8 } } }))
    setSelectedClip(name)
  }

  const renameClip = (from: string, to: string): void => {
    if (!to || to === from || draft.clips[to]) return
    setDraft((d) => {
      const clips: Record<string, ClipDef> = {}
      for (const [n, c] of Object.entries(d.clips)) clips[n === from ? to : n] = c
      return { ...d, clips, initialClip: d.initialClip === from ? to : d.initialClip }
    })
    setSelectedClip((s) => (s === from ? to : s))
  }

  const deleteClip = (name: string): void => {
    setDraft((d) => {
      const clips = { ...d.clips }
      delete clips[name]
      return { ...d, clips, initialClip: d.initialClip === name ? undefined : d.initialClip }
    })
    setSelectedClip((s) => (s === name ? null : s))
  }

  const chooseTexture = (uri: string): void => {
    patch({ texture: uri })
    setChoosingTexture(false)
  }

  const importSheet = async (files: File[]): Promise<void> => {
    const image = files.find((f) => IMAGE_RE.test(f.name))
    if (!image) return
    await onImportArt(files)
    // importArt writes to src/art/<name>, so the stored uri is deterministic.
    chooseTexture(`src/art/${image.name}`)
  }

  const col = draft.cols > 0 ? previewFrame % draft.cols : 0
  const row = draft.cols > 0 ? Math.floor(previewFrame / draft.cols) : 0
  const previewStyle: CSSProperties = sheetUrl
    ? {
        backgroundImage: `url(${sheetUrl})`,
        backgroundSize: `${draft.cols * 100}% ${draft.rows * 100}%`,
        backgroundPosition: `${draft.cols > 1 ? (col / (draft.cols - 1)) * 100 : 0}% ${
          draft.rows > 1 ? (row / (draft.rows - 1)) * 100 : 0
        }%`,
        imageRendering: pixelated ? 'pixelated' : undefined,
      }
    : {}

  const showPicker = choosingTexture || !draft.texture

  return (
    <div
      className="ed-modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div className="ed-modal">
        <header className="ed-modal-head">
          <span>Animation — {title}</span>
          <button className="ed-mini" onClick={onCancel}>
            ✕
          </button>
        </header>

        <div className="ed-modal-body">
          <div className="ed-modal-left">
            {showPicker ? (
              <div
                className={`ed-anim-picker ${droppingSheet ? 'is-dropping' : ''}`}
                onDragOver={(e) => {
                  if (!e.dataTransfer.types.includes('Files')) return
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'copy'
                  setDroppingSheet(true)
                }}
                onDragLeave={() => setDroppingSheet(false)}
                onDrop={(e) => {
                  if (!e.dataTransfer.types.includes('Files')) return
                  e.preventDefault()
                  setDroppingSheet(false)
                  void importSheet([...e.dataTransfer.files])
                }}
              >
                <div className="ed-hint">Drop a PNG spritesheet here, or pick one:</div>
                <div className="ed-anim-thumbs">
                  {art.map((item) => (
                    <button
                      key={item.uri}
                      className="ed-anim-thumb"
                      onClick={() => chooseTexture(item.uri)}
                    >
                      <img src={item.url} alt={item.label} />
                      <span>{item.label}</span>
                    </button>
                  ))}
                </div>
                <button className="ed-mini" onClick={() => filePicker.current?.click()}>
                  Import image…
                </button>
                {draft.texture && (
                  <button className="ed-mini" onClick={() => setChoosingTexture(false)}>
                    Keep current sheet
                  </button>
                )}
                <input
                  ref={filePicker}
                  type="file"
                  accept=".png,.jpg,.jpeg"
                  hidden
                  onChange={(e) => {
                    void importSheet([...(e.currentTarget.files ?? [])])
                    e.currentTarget.value = ''
                  }}
                />
              </div>
            ) : (
              <>
                <div className="ed-row ed-anim-gridrow">
                  <span>grid</span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={draft.cols}
                    onChange={(e) =>
                      patch({ cols: Math.max(1, Math.floor(Number(e.target.value) || 1)) })
                    }
                  />
                  <span>×</span>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={draft.rows}
                    onChange={(e) =>
                      patch({ rows: Math.max(1, Math.floor(Number(e.target.value) || 1)) })
                    }
                  />
                  <button className="ed-mini" onClick={() => setChoosingTexture(true)}>
                    change sheet…
                  </button>
                </div>
                <div className="ed-checker ed-sheet-wrap">
                  <div className="ed-sheet">
                    <img
                      src={sheetUrl ?? undefined}
                      alt={draft.texture}
                      style={{ imageRendering: pixelated ? 'pixelated' : undefined }}
                    />
                    <div
                      className="ed-sheet-grid"
                      style={{
                        gridTemplateColumns: `repeat(${draft.cols}, 1fr)`,
                        gridTemplateRows: `repeat(${draft.rows}, 1fr)`,
                      }}
                    >
                      {Array.from({ length: max }, (_, i) => (
                        <button
                          key={i}
                          className={`ed-sheet-cell ${clip?.frames.includes(i) ? 'is-on' : ''}`}
                          title={
                            selectedClip
                              ? `frame ${i} — toggle in "${selectedClip}"`
                              : `frame ${i} — select a clip first`
                          }
                          onClick={() => toggleFrame(i)}
                        >
                          {i}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>

          <div className="ed-modal-right">
            <header className="ed-sec-head">Clips</header>
            {Object.entries(draft.clips).map(([name, c]) => (
              <div
                key={name}
                className={`ed-clip ${selectedClip === name ? 'is-active' : ''}`}
                onClick={() => setSelectedClip(name)}
              >
                <div className="ed-clip-row">
                  <input
                    className="ed-clip-name"
                    type="text"
                    defaultValue={name}
                    onBlur={(e) => renameClip(name, e.target.value.trim())}
                  />
                  <label>
                    fps
                    <input
                      type="number"
                      min={1}
                      value={c.fps}
                      onChange={(e) => patchClip(name, { fps: Math.max(1, Number(e.target.value) || 1) })}
                    />
                  </label>
                  <label>
                    loop
                    <input
                      type="checkbox"
                      checked={c.loop ?? true}
                      onChange={(e) => patchClip(name, { loop: e.target.checked })}
                    />
                  </label>
                  <button
                    className="ed-mini"
                    title="Delete clip"
                    onClick={(e) => {
                      e.stopPropagation()
                      deleteClip(name)
                    }}
                  >
                    ✕
                  </button>
                </div>
                <div className="ed-clip-frames">
                  {c.frames.length === 0 && (
                    <span className="ed-hint">click sheet cells to add frames</span>
                  )}
                  {c.frames.map((f, i) => (
                    <button
                      key={`${i}.${f}`}
                      className={`ed-frame-chip ${f >= max ? 'is-invalid' : ''}`}
                      title={f >= max ? 'outside the sheet — dropped on save' : 'remove frame'}
                      onClick={(e) => {
                        e.stopPropagation()
                        removeFrameAt(name, i)
                      }}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>
            ))}
            <button className="ed-mini" onClick={addClip}>
              + clip
            </button>
            <label className="ed-row">
              <span>initial clip</span>
              <select
                value={draft.initialClip ?? ''}
                onChange={(e) => patch({ initialClip: e.target.value || undefined })}
              >
                <option value="">(auto)</option>
                {Object.keys(draft.clips).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>

            <header className="ed-sec-head">Preview</header>
            <div className="ed-checker ed-anim-preview-wrap">
              <div className="ed-anim-preview" style={previewStyle} />
            </div>
            <button
              className="ed-mini"
              disabled={!clip || clip.frames.length === 0}
              onClick={() => setPlaying((p) => !p)}
            >
              {playing ? '⏸ pause' : '▶ play'}
            </button>

            {contract && (
              <div className="ed-contract-list">
                <header className="ed-sec-head">Required clips</header>
                {contract.required.map((name) => {
                  const ok = name in draft.clips
                  return (
                    <div key={name} className="ed-row">
                      <span>{name}</span>
                      <span className={ok ? 'ed-clip-ok' : 'ed-clip-missing'}>
                        {ok ? '✓' : '✗ missing'}
                      </span>
                    </div>
                  )
                })}
                {missingClips(contract, Object.keys(draft.clips)).length > 0 && (
                  <div className="ed-hint">missing clips fall back to others at runtime</div>
                )}
              </div>
            )}
          </div>
        </div>

        <footer className="ed-modal-foot">
          <button className="ed-mini" onClick={onCancel}>
            Cancel
          </button>
          <button className="ed-primary" onClick={() => onSave(sanitizeAnimated(draft))}>
            Save
          </button>
        </footer>
      </div>
    </div>
  )
}
