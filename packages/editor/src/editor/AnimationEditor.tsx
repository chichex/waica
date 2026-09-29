import { useCallback, useState } from 'react'
import type { AnimationContract } from '@waica/engine'
import { sanitizeAnimated, sheetsOf, totalFrames, type AnimatedProps } from '../project/clips'
import { sheetBases, slicePatch } from './animation-draft'
import { ClipList, RequiredClips } from './ClipList'
import { ClipPreview } from './ClipPreview'
import { ModalBackdrop } from './ModalBackdrop'
import { SheetPane } from './SheetPane'
import { SheetPicker } from './SheetPicker'
import { useAnimationDraft, type AnimationDraft } from './use-animation-draft'
import { useEscapeKey } from './use-escape-key'
import { artDisplayPath, IMAGE_RE, type ArtItem, type DroppedFile } from './use-project-art'

/** Which sheet a picked texture lands on: an existing slot, or a new sheet. */
type PickTarget = number | 'add' | null

export interface AnimationEditorProps {
  /** Shown in the header: the prefab ref or entity name being edited. */
  title: string
  initial: AnimatedProps
  /** Required-clips checklist (characters only). */
  contract?: AnimationContract
  art: ArtItem[]
  urlFor(uri: string): string
  onImportArt(files: DroppedFile[]): Promise<void>
  onSave(next: AnimatedProps): void
  onCancel(): void
}

/**
 * Modal spritesheet/clip editor: pick or drop sheets, slice each one — by
 * uniform grid, by auto-detected transparency islands, or by hand-drawn
 * cells — and build named clips by clicking cells, previewing them live.
 * Frames number consecutively across the sheets, so clips can mix cells
 * from any of them. Pure DOM/CSS — the preview replays the engine's own
 * ClipPlayer over background-position.
 */
export function AnimationEditor(props: AnimationEditorProps) {
  const { title, contract, art, urlFor, onImportArt, onSave, onCancel } = props
  const editor = useAnimationDraft(props.initial)
  const { draft, selectedClip } = editor
  const { picking, setPicking, chooseTexture, importSheet } = useSheetPicking(editor, onImportArt, onCancel)
  const [dims, noteDims] = useSheetDims()

  const sheets = sheetsOf(draft)
  const clip = selectedClip ? draft.clips[selectedClip] : undefined
  const pixelated = draft.pixelArt !== false


  return (
    <ModalBackdrop onDismiss={onCancel}>
      <div className="ed-modal">
        <header className="ed-modal-head">
          <span>Animation — {title}</span>
          <button className="ed-mini" onClick={onCancel}>
            ✕
          </button>
        </header>

        <div className="ed-modal-body">
          <div className="ed-modal-left">
            {picking !== null || !draft.texture ? (
              <SheetPicker
                art={art}
                backOut={!draft.texture ? 'none' : picking === 'add' ? 'cancel' : 'keep'}
                onPick={chooseTexture}
                onImport={importSheet}
                onBackOut={() => setPicking(null)}
              />
            ) : (
              <SheetPanes
                editor={editor}
                art={art}
                dims={dims}
                urlFor={urlFor}
                onDims={noteDims}
                onPick={setPicking}
              />
            )}
          </div>

          <div className="ed-modal-right">
            <ClipList editor={editor} frameCount={totalFrames(draft)} />
            <ClipPreview sheets={sheets} clip={clip} dims={dims} urlFor={urlFor} pixelated={pixelated} />
            {contract && <RequiredClips contract={contract} clips={draft.clips} />}
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
    </ModalBackdrop>
  )
}

/**
 * Each sheet image's natural pixel size, keyed by texture uri — the slicing
 * params are in these units — and the callback its image reports it with.
 */
function useSheetDims() {
  const [dims, setDims] = useState<Record<string, [number, number]>>({})
  const noteDims = (uri: string, next: [number, number]): void =>
    setDims((d) => {
      const cur = d[uri]
      return cur && cur[0] === next[0] && cur[1] === next[1] ? d : { ...d, [uri]: next }
    })
  return [dims, noteDims] as const
}

/**
 * The sheet picker's target and where a picked or imported texture lands:
 * the sheet whose "change sheet…" opened it, a new sheet after "+ add
 * sheet", or the main sheet. Escape backs out of the picker first, then
 * closes the modal.
 */
function useSheetPicking(
  editor: AnimationDraft,
  onImportArt: (files: DroppedFile[]) => Promise<void>,
  onCancel: () => void,
) {
  const [picking, setPicking] = useState<PickTarget>(null)
  const hasTexture = editor.draft.texture !== ''
  const onEscape = useCallback(() => {
    if (picking !== null && hasTexture) setPicking(null)
    else onCancel()
  }, [onCancel, picking, hasTexture])
  useEscapeKey(onEscape)

  const chooseTexture = (uri: string): void => {
    if (picking === 'add') editor.addSheet(uri)
    else editor.patchSheet(typeof picking === 'number' ? picking : 0, { texture: uri })
    setPicking(null)
  }
  const importSheet = async (files: DroppedFile[]): Promise<void> => {
    const image = files.find((f) => IMAGE_RE.test(f.file.name))
    if (!image) return
    await onImportArt(files)
    // importArt writes to src/art/<relativePath>, so the stored uri is deterministic.
    chooseTexture(`src/art/${image.relativePath}`)
  }
  return { picking, setPicking, chooseTexture, importSheet }
}

interface SheetPanesProps {
  editor: AnimationDraft
  art: ArtItem[]
  dims: Record<string, [number, number]>
  urlFor: (uri: string) => string
  onDims: (uri: string, dims: [number, number]) => void
  /** Opens the picker to change a sheet, or to add one. */
  onPick: (target: PickTarget) => void
}

/** Every sheet of the draft, frames numbered across them, and + add sheet. */
function SheetPanes({ editor, art, dims, urlFor, onDims, onPick }: SheetPanesProps) {
  const { draft, selectedClip } = editor
  const sheets = sheetsOf(draft)
  const bases = sheetBases(sheets)
  const clipFrames = (selectedClip ? draft.clips[selectedClip] : undefined)?.frames ?? []
  const labelOf = (texture: string): string => {
    const item = art.find((a) => a.uri === texture)
    return item ? artDisplayPath(item) : texture
  }

  return (
    <>
      {sheets.map((sheet, index) => (
        <SheetPane
          key={index}
          index={index}
          sheet={sheet}
          base={bases[index] ?? 0}
          label={labelOf(sheet.texture)}
          showTitle={sheets.length > 1}
          canRemove={sheets.length > 1}
          dims={dims[sheet.texture]}
          url={urlFor(sheet.texture)}
          pixelated={draft.pixelArt !== false}
          selectedClip={selectedClip}
          clipFrames={clipFrames}
          onDims={onDims}
          onPatch={(p) => editor.patchSheet(index, p)}
          onPatchSlice={(key, raw) => editor.patchSheet(index, slicePatch(key, raw))}
          onChangeSheet={() => onPick(index)}
          onRemove={() => editor.removeSheet(index)}
          onToggleFrame={editor.toggleFrame}
          onDeleteCell={(cellIndex) => editor.deleteCell(index, cellIndex)}
        />
      ))}
      <button className="ed-mini ed-add-sheet" onClick={() => onPick('add')}>
        + add sheet
      </button>
    </>
  )
}
