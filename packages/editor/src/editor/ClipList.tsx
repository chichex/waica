import { missingClips, type AnimationContract, type ClipDef } from '@waica/engine'
import { NumberField } from './NumberField'
import type { AnimationDraft } from './use-animation-draft'

interface ClipListProps {
  /** The draft's clip edits and selection. */
  editor: AnimationDraft
  /** Total frames across the sheets: chips at or past it are dropped on save. */
  frameCount: number
}

/** The Clips section: one editable row per clip, + clip, and the initial clip picker. */
export function ClipList({ editor, frameCount }: ClipListProps) {
  const { draft } = editor
  return (
    <>
      <header className="ed-sec-head">Clips</header>
      {Object.entries(draft.clips).map(([name, c]) => (
        <ClipRow
          key={name}
          name={name}
          clip={c}
          active={editor.selectedClip === name}
          frameCount={frameCount}
          editor={editor}
        />
      ))}
      <button className="ed-mini" onClick={editor.addClip}>
        + clip
      </button>
      <label className="ed-row">
        <span>initial clip</span>
        <select
          value={draft.initialClip ?? ''}
          onChange={(e) => editor.patch({ initialClip: e.target.value || undefined })}
        >
          <option value="">(auto)</option>
          {Object.keys(draft.clips).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
    </>
  )
}

interface ClipRowProps {
  name: string
  clip: ClipDef
  active: boolean
  frameCount: number
  editor: AnimationDraft
}

/** One clip: name (renamed on blur), fps, loop, delete, and its frames as removable chips. */
function ClipRow({ name, clip, active, frameCount, editor }: ClipRowProps) {
  return (
    // Moving into any of a clip's fields (keyboard or pointer) selects it.
    <div className={`ed-clip ${active ? 'is-active' : ''}`} onFocus={() => editor.setSelectedClip(name)}>
      <div className="ed-clip-row">
        <input
          className="ed-clip-name"
          type="text"
          defaultValue={name}
          onBlur={(e) => editor.renameClip(name, e.target.value.trim())}
        />
        <label>
          fps
          <NumberField
            min={1}
            value={clip.fps}
            onChange={(t) => editor.patchClip(name, { fps: Math.max(1, Number(t) || 1) })}
          />
        </label>
        <label>
          loop
          <input
            type="checkbox"
            checked={clip.loop ?? true}
            onChange={(e) => editor.patchClip(name, { loop: e.target.checked })}
          />
        </label>
        <button
          className="ed-mini"
          title="Delete clip"
          onClick={(e) => {
            e.stopPropagation()
            editor.deleteClip(name)
          }}
        >
          ✕
        </button>
      </div>
      <ClipFrameChips
        frames={clip.frames}
        frameCount={frameCount}
        onRemove={(i) => editor.removeFrameAt(name, i)}
      />
    </div>
  )
}

/** A clip's frames in play order, each chip removing that position; out-of-range frames are flagged. */
function ClipFrameChips({
  frames,
  frameCount,
  onRemove,
}: {
  frames: number[]
  frameCount: number
  onRemove: (index: number) => void
}) {
  return (
    <div className="ed-clip-frames">
      {frames.length === 0 && <span className="ed-hint">click sheet cells to add frames</span>}
      {frames.map((f, i) => (
        <button
          key={`${i}.${f}`}
          className={`ed-frame-chip ${f >= frameCount ? 'is-invalid' : ''}`}
          title={f >= frameCount ? 'outside the sheets — dropped on save' : 'remove frame'}
          onClick={(e) => {
            e.stopPropagation()
            onRemove(i)
          }}
        >
          {f}
        </button>
      ))}
    </div>
  )
}

/** The archetype's required clips, checked off against the draft's. */
export function RequiredClips({
  contract,
  clips,
}: {
  contract: AnimationContract
  clips: Record<string, ClipDef>
}) {
  return (
    <div className="ed-contract-list">
      <header className="ed-sec-head">Required clips</header>
      {contract.required.map((name) => {
        const ok = name in clips
        return (
          <div key={name} className="ed-row">
            <span>{name}</span>
            <span className={ok ? 'ed-clip-ok' : 'ed-clip-missing'}>{ok ? '✓' : '✗ missing'}</span>
          </div>
        )
      })}
      {missingClips(contract, Object.keys(clips)).length > 0 && (
        <div className="ed-hint">a state without its clip keeps the previous animation at runtime</div>
      )}
    </div>
  )
}
