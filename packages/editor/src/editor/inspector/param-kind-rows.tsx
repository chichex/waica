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

const finiteOr0 = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0)

/** A `[x, y]` or `[x, y, z]` param: one number field per axis, each named `<label> x|y|z`. */
export function VectorParamRow({
  label,
  name,
  value,
  axes,
  onChange,
}: ParamKindRowProps & { label: string; axes: readonly ('x' | 'y' | 'z')[] }) {
  const parts = Array.isArray(value) ? value : []
  const numbers = axes.map((_axis, index) => finiteOr0(parts[index]))
  return (
    <div className={`ed-row ${axes.length === 3 ? 'ed-row-xyz' : 'ed-row-xy'}`}>
      {name}
      {axes.map((axis, index) => (
        <NumberField
          key={axis}
          aria-label={`${label} ${axis}`}
          step={0.1}
          value={numbers[index] ?? 0}
          onChange={(text) => onChange(numbers.map((current, at) => (at === index ? Number(text) : current)))}
        />
      ))}
    </div>
  )
}

/**
 * Whether a model uri is one `validate_project` and the generated build
 * resolve: a file directly under `src/art/` (the build's `import.meta.glob('./art/*')`
 * never crosses a folder) or the archetype's own `waica:` art.
 */
const isResolvableModel = (uri: string): boolean => uri.startsWith('waica:') || /^src\/art\/[^/]+$/.test(uri)

/** A `kind: 'model'` param (Model.src): the project's model art as a select; empty means "none". */
export function ModelParamRow({ name, value, onChange }: ParamKindRowProps) {
  const { texture } = useContext(RefTargetsContext)
  const models = texture.art.filter((item) => item.kind === 'model' && isResolvableModel(item.uri))
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
