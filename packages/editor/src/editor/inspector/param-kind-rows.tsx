import { useContext, useState } from 'react'
import type { ArtItem, DroppedFile } from '../use-project-art'
import { NumberField } from '../NumberField'
import { RefTargetsContext } from './ref-targets-context'
import { TexturePicker, TexturePreview } from './TextureControls'
import { useTextureDrop, type TextureDropProps } from './use-texture-drop'

interface ParamKindRowProps {
  name: React.ReactNode
  value: unknown
  onChange: (value: unknown) => void
}

export function Vector2ParamRow({
  label,
  name,
  value,
  onChange,
}: ParamKindRowProps & { label: string }) {
  const pair = Array.isArray(value) ? value : []
  const x = typeof pair[0] === 'number' && Number.isFinite(pair[0]) ? pair[0] : 0
  const y = typeof pair[1] === 'number' && Number.isFinite(pair[1]) ? pair[1] : 0
  return (
    <div className="ed-row ed-row-xy">
      {name}
      <NumberField
        aria-label={`${label} x`}
        step={0.1}
        value={x}
        onChange={(text) => onChange([Number(text), y])}
      />
      <NumberField
        aria-label={`${label} y`}
        step={0.1}
        value={y}
        onChange={(text) => onChange([x, Number(text)])}
      />
    </div>
  )
}

interface OpenTextureProps {
  art: ArtItem[]
  uri: string
  dropping: boolean
  dragProps: TextureDropProps
  onChoose: (uri: string) => void
  onKeep: () => void
  onImport: (files: DroppedFile[]) => Promise<void>
}

function OpenTexture({
  art,
  uri,
  dropping,
  dragProps,
  onChoose,
  onKeep,
  onImport,
}: OpenTextureProps) {
  return (
    <>
      <TexturePicker
        art={art}
        hasTexture={uri !== ''}
        dropping={dropping}
        dragProps={dragProps}
        onPick={onChoose}
        onKeep={onKeep}
        onImport={onImport}
      />
      <button className="ed-mini" type="button" onClick={() => onChoose('')}>
        Clear image
      </button>
    </>
  )
}

function EmptyTexture({ dropping, dragProps, onOpen }: {
  dropping: boolean
  dragProps: TextureDropProps
  onOpen: () => void
}) {
  return (
    <button
      className={`ed-mini ${dropping ? 'is-dropping' : ''}`}
      type="button"
      onClick={onOpen}
      {...dragProps}
    >
      Choose image…
    </button>
  )
}

export function TextureParamRow({ name, value, onChange }: ParamKindRowProps) {
  const [choosing, setChoosing] = useState(false)
  const { texture } = useContext(RefTargetsContext)
  const art = texture.art.filter((item) => item.kind === 'image')
  const uri = typeof value === 'string' ? value : ''
  const choose = (next: string): void => {
    onChange(next)
    setChoosing(false)
  }
  const { dropping, dragProps } = useTextureDrop(art, choose, texture.onImport)
  const control = choosing ? (
    <OpenTexture
      art={art}
      uri={uri}
      dropping={dropping}
      dragProps={dragProps}
      onChoose={choose}
      onKeep={() => setChoosing(false)}
      onImport={texture.onImport}
    />
  ) : uri ? (
    <TexturePreview
      texture={uri}
      art={art}
      urlFor={texture.urlFor}
      overridden={false}
      dropping={dropping}
      dragProps={dragProps}
      onChange={() => setChoosing(true)}
    />
  ) : (
    <EmptyTexture dropping={dropping} dragProps={dragProps} onOpen={() => setChoosing(true)} />
  )
  return (
    <div className="ed-row">
      {name}
      <div>{control}</div>
    </div>
  )
}
