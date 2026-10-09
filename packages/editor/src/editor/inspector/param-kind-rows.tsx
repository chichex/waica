import { useContext, useState } from 'react'
import { IMAGE_RE, type ArtItem, type DroppedFile } from '../use-project-art'
import { MissingOption, missingOptionClass } from '../missing-option'
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

const finiteOr0 = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0)

/** A `[x, y, z]` param (the Sun's direction): three number fields, each named `<label> x|y|z`. */
export function Vector3ParamRow({
  label,
  name,
  value,
  onChange,
}: ParamKindRowProps & { label: string }) {
  const triple = Array.isArray(value) ? value : []
  const [x, y, z] = [finiteOr0(triple[0]), finiteOr0(triple[1]), finiteOr0(triple[2])]
  return (
    <div className="ed-row ed-row-xyz">
      {name}
      <NumberField aria-label={`${label} x`} step={0.1} value={x} onChange={(text) => onChange([Number(text), y, z])} />
      <NumberField aria-label={`${label} y`} step={0.1} value={y} onChange={(text) => onChange([x, Number(text), z])} />
      <NumberField aria-label={`${label} z`} step={0.1} value={z} onChange={(text) => onChange([x, y, Number(text)])} />
    </div>
  )
}

/** A `kind: 'model'` param (Model.src): the project's model art as a select; empty means "none". */
export function ModelParamRow({ name, value, onChange }: ParamKindRowProps) {
  const { texture } = useContext(RefTargetsContext)
  const models = texture.art.filter((item) => item.kind === 'model')
  const uri = typeof value === 'string' ? value : ''
  const missing = uri !== '' && !models.some((item) => item.uri === uri)
  return (
    <label className="ed-row">
      {name}
      <select className={missingOptionClass(missing)} value={uri} onChange={(e) => onChange(e.target.value)}>
        <option value="">none (use the shape)</option>
        {missing && <MissingOption value={uri} />}
        {models.map((item) => (
          <option key={item.uri} value={item.uri}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
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

async function importTextureImage(
  files: DroppedFile[],
  onImport: (files: DroppedFile[]) => Promise<void>,
  onChoose: (uri: string) => void,
): Promise<void> {
  const images = files.filter((file) => IMAGE_RE.test(file.file.name))
  const image = images[0]
  if (!image) return
  await onImport(images)
  onChoose(`src/art/${image.relativePath}`)
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
  const importImage = (files: DroppedFile[]): Promise<void> => importTextureImage(
    files, texture.onImport, choose,
  )
  const { dropping, dragProps } = useTextureDrop(art, choose, importImage)
  const control = choosing ? (
    <OpenTexture
      art={art}
      uri={uri}
      dropping={dropping}
      dragProps={dragProps}
      onChoose={choose}
      onKeep={() => setChoosing(false)}
      onImport={importImage}
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
  return <div className="ed-row">{name}<div>{control}</div></div>
}
