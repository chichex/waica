import { useRef } from 'react'
import { reportRejection } from '../../report-rejection'
import { ArtSearchGrid } from '../ArtPicker'
import type { ArtItem, DroppedFile } from '../use-project-art'
import type { TextureDropProps } from './use-texture-drop'

interface TexturePickerProps {
  art: ArtItem[]
  hasTexture: boolean
  dropping: boolean
  dragProps: TextureDropProps
  onPick: (uri: string) => void
  onKeep: () => void
  onImport: (files: DroppedFile[]) => Promise<void>
}

/** Picks the texture from the library, a dropped file or the file dialog. */
export function TexturePicker({
  art,
  hasTexture,
  dropping,
  dragProps,
  onPick,
  onKeep,
  onImport,
}: TexturePickerProps) {
  const filePicker = useRef<HTMLInputElement>(null)
  return (
    <div className={`ed-anim-picker ${dropping ? 'is-dropping' : ''}`} {...dragProps}>
      <div className="ed-hint">Drag an image here, or pick one:</div>
      <ArtSearchGrid art={art} onPick={onPick} />
      <button className="ed-mini" onClick={() => filePicker.current?.click()}>
        Import image…
      </button>
      {hasTexture && (
        <button className="ed-mini" onClick={onKeep}>
          Keep current image
        </button>
      )}
      <input
        ref={filePicker}
        type="file"
        accept=".png,.jpg,.jpeg"
        hidden
        onChange={(e) => {
          const files = [...(e.currentTarget.files ?? [])].map((file) => ({
            file,
            relativePath: file.name,
          }))
          reportRejection(onImport(files), 'import image')
          e.currentTarget.value = ''
        }}
      />
    </div>
  )
}

/** The current texture as a button that reopens the picker — and a drop target. */
export function TexturePreview({
  texture,
  art,
  urlFor,
  overridden,
  dropping,
  dragProps,
  onChange,
}: {
  texture: string
  art: ArtItem[]
  urlFor: (uri: string) => string
  overridden: boolean
  dropping: boolean
  dragProps: TextureDropProps
  onChange: () => void
}) {
  return (
    <button
      type="button"
      className={`ed-appear-preview ${dropping ? 'is-dropping' : ''}`}
      title="Click to change the image — or drop a new one on it"
      onClick={onChange}
      {...dragProps}
    >
      <img src={urlFor(texture)} alt={texture} />
      <span>
        {art.find((a) => a.uri === texture)?.label ?? texture}
        {overridden && <i className="ed-dot" title="overridden on this instance" />}
      </span>
    </button>
  )
}
