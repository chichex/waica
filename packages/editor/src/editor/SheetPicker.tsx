import { useRef, useState, type DragEvent } from 'react'
import { reportRejection } from '../report-rejection'
import { ArtSearchGrid } from './ArtPicker'
import { collectDroppedFiles, type ArtItem, type DroppedFile } from './use-project-art'

interface SheetPickerProps {
  art: ArtItem[]
  /** What backing out does: nothing without a sheet yet; otherwise cancel an add or keep the current sheet. */
  backOut: 'none' | 'cancel' | 'keep'
  onPick: (uri: string) => void
  /** Imports dropped or chosen files and uses the image among them as the sheet. */
  onImport: (files: DroppedFile[]) => Promise<void>
  onBackOut: () => void
}

/** Where a sheet comes from: project art, a dropped PNG or an imported image file. */
export function SheetPicker({ art, backOut, onPick, onImport, onBackOut }: SheetPickerProps) {
  const drop = useFileDrop(onImport)
  const filePicker = useRef<HTMLInputElement>(null)

  return (
    <div
      className={`ed-anim-picker ${drop.dropping ? 'is-dropping' : ''}`}
      onDragOver={drop.onDragOver}
      onDragLeave={drop.onDragLeave}
      onDrop={drop.onDrop}
    >
      <div className="ed-hint">Drop a PNG spritesheet here, or pick one:</div>
      <ArtSearchGrid art={art} onPick={onPick} />
      <button className="ed-mini" onClick={() => filePicker.current?.click()}>
        Import image…
      </button>
      {backOut !== 'none' && (
        <button className="ed-mini" onClick={onBackOut}>
          {backOut === 'cancel' ? 'Cancel' : 'Keep current sheet'}
        </button>
      )}
      <input
        ref={filePicker}
        type="file"
        accept=".png,.jpg,.jpeg"
        hidden
        onChange={(e) => {
          const files = [...(e.currentTarget.files ?? [])].map((file) => ({ file, relativePath: file.name }))
          reportRejection(onImport(files), 'import sheet')
          e.currentTarget.value = ''
        }}
      />
    </div>
  )
}

/** Accepts files dragged in from the OS (and only those), highlighting while they hover. */
function useFileDrop(onImport: (files: DroppedFile[]) => Promise<void>) {
  const [dropping, setDropping] = useState(false)
  return {
    dropping,
    onDragOver: (e: DragEvent): void => {
      if (!e.dataTransfer.types.includes('Files')) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      setDropping(true)
    },
    onDragLeave: (): void => setDropping(false),
    onDrop: (e: DragEvent): void => {
      if (!e.dataTransfer.types.includes('Files')) return
      e.preventDefault()
      setDropping(false)
      const dataTransfer = e.dataTransfer
      reportRejection(collectDroppedFiles(dataTransfer).then(onImport), 'import dropped sheet')
    },
  }
}
