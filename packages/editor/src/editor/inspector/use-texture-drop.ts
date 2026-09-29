import { useState } from 'react'
import { reportRejection } from '../../report-rejection'
import { collectDroppedFiles, type ArtItem, type DroppedFile } from '../use-project-art'

export interface TextureDropProps {
  onDragOver: (e: React.DragEvent) => void
  onDragLeave: () => void
  onDrop: (e: React.DragEvent) => void
}

const acceptsDrag = (e: React.DragEvent): boolean =>
  e.dataTransfer.types.includes('Files') || e.dataTransfer.types.includes('waica/art')

/**
 * Drop target behavior for a texture slot: library art rows (the 'waica/art'
 * payload) and files from the desktop. `dropping` is true while a drag hovers.
 */
export function useTextureDrop(
  art: readonly ArtItem[],
  onChoose: (uri: string) => void,
  onImport: (files: DroppedFile[]) => Promise<void>,
): { dropping: boolean; dragProps: TextureDropProps } {
  const [dropping, setDropping] = useState(false)
  const dragProps: TextureDropProps = {
    onDragOver: (e) => {
      if (!acceptsDrag(e)) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
      setDropping(true)
    },
    onDragLeave: () => setDropping(false),
    onDrop: (e) => {
      if (!acceptsDrag(e)) return
      e.preventDefault()
      setDropping(false)
      const uri = e.dataTransfer.getData('waica/art')
      if (uri) {
        // `art` here is already filtered to kind 'image' (see the callers) —
        // a sound row shares the same 'waica/art' payload, so a dropped uri
        // that isn't one of these images is silently rejected instead of
        // being written into a texture prop.
        if (art.some((item) => item.uri === uri)) onChoose(uri)
      } else {
        const dataTransfer = e.dataTransfer
        reportRejection(collectDroppedFiles(dataTransfer).then(onImport), 'import dropped image')
      }
    },
  }
  return { dropping, dragProps }
}
