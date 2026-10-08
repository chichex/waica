import type { SceneJson, ScenePostJson } from '@waica/engine'

type RenderProp = (key: string, value: unknown) => void

const AMBIENT_DEFAULT = { color: '#ffffff', intensity: 1 }
const VIGNETTE_DEFAULT = { intensity: 0.5, radius: 0.5 }
const GRADE_DEFAULT = { tint: '#ffffff', contrast: 1, saturation: 1 }

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))

/** A labelled number field inside [min, max]; an unreadable entry is ignored. */
function NumberRow({ label, value, min, max, step, onValue }: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onValue: (value: number) => void
}) {
  return (
    <label className="ed-row">
      <span>{label}</span>
      <input
        type="number"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => {
          const parsed = Number.parseFloat(e.target.value)
          if (Number.isFinite(parsed)) onValue(clamp(parsed, min, max))
        }}
      />
    </label>
  )
}

/** A labelled `#rrggbb` color field. */
function ColorRow({ label, value, onValue }: { label: string; value: string; onValue: (value: string) => void }) {
  return (
    <label className="ed-row">
      <span>{label}</span>
      <input type="color" aria-label={label} value={value} onChange={(e) => onValue(e.target.value)} />
    </label>
  )
}

/** A labelled switch with its hint. */
function Switch({ label, checked, onToggle, hint }: {
  label: string
  checked: boolean
  onToggle: (on: boolean) => void
  hint: string
}) {
  return (
    <>
      <label className="ed-row">
        <span>{label}</span>
        <input type="checkbox" aria-label={label} checked={checked} onChange={(e) => onToggle(e.target.checked)} />
      </label>
      <div className="ed-hint">{hint}</div>
    </>
  )
}

/** The scene's Ambient Light (issue #78): on/off, color and intensity, written to render.lighting. */
export function LightingOptions({ scene, onRenderProp }: { scene: SceneJson; onRenderProp: RenderProp }) {
  const lighting = scene.render?.lighting
  const ambient = { ...AMBIENT_DEFAULT, ...lighting?.ambient }
  const setAmbient = (next: Partial<typeof ambient>): void => {
    onRenderProp('lighting', { ...lighting, ambient: { ...ambient, ...next } })
  }
  return (
    <>
      <Switch
        label="Scene lighting"
        checked={lighting !== undefined}
        onToggle={(on) => onRenderProp('lighting', on ? { ambient: AMBIENT_DEFAULT } : undefined)}
        hint="Lights and Ambient Light: everything drawn is darkened where no Light reaches, except Emissive drawables"
      />
      {lighting !== undefined && (
        <>
          <ColorRow label="Ambient color" value={ambient.color} onValue={(color) => setAmbient({ color })} />
          <NumberRow
            label="Ambient intensity"
            value={ambient.intensity}
            min={0}
            max={1}
            step={0.05}
            onValue={(intensity) => setAmbient({ intensity })}
          />
        </>
      )}
    </>
  )
}

type PostSetter = (next: ScenePostJson) => void

/** The vignette switch and, while on, its intensity and radius. */
function VignetteOptions({ post, setPost }: { post: ScenePostJson | undefined; setPost: PostSetter }) {
  const vignette = post?.vignette
  return (
    <>
      <Switch
        label="Vignette"
        checked={vignette !== undefined}
        onToggle={(on) => setPost({ ...post, vignette: on ? VIGNETTE_DEFAULT : undefined })}
        hint="Darkens the frame towards its corners"
      />
      {vignette && (
        <>
          <NumberRow label="Vignette intensity" value={vignette.intensity} min={0} max={1} step={0.05}
            onValue={(intensity) => setPost({ ...post, vignette: { ...vignette, intensity } })} />
          <NumberRow label="Vignette radius" value={vignette.radius} min={0} max={1} step={0.05}
            onValue={(radius) => setPost({ ...post, vignette: { ...vignette, radius } })} />
        </>
      )}
    </>
  )
}

/** The color grade switch and, while on, its tint, contrast and saturation. */
function ColorGradeOptions({ post, setPost }: { post: ScenePostJson | undefined; setPost: PostSetter }) {
  const grade = post?.colorGrade && { ...GRADE_DEFAULT, ...post.colorGrade }
  return (
    <>
      <Switch
        label="Color grade"
        checked={grade !== undefined}
        onToggle={(on) => setPost({ ...post, colorGrade: on ? GRADE_DEFAULT : undefined })}
        hint="Tints the frame and shifts its contrast and saturation"
      />
      {grade && (
        <>
          <ColorRow label="Grade tint" value={grade.tint} onValue={(tint) => setPost({ ...post, colorGrade: { ...grade, tint } })} />
          <NumberRow label="Contrast" value={grade.contrast} min={0} max={2} step={0.05}
            onValue={(contrast) => setPost({ ...post, colorGrade: { ...grade, contrast } })} />
          <NumberRow label="Saturation" value={grade.saturation} min={0} max={2} step={0.05}
            onValue={(saturation) => setPost({ ...post, colorGrade: { ...grade, saturation } })} />
        </>
      )}
    </>
  )
}

/** The scene's Post Effects (issue #78): a vignette and a color grade, written to render.post; none left removes it. */
export function PostOptions({ scene, onRenderProp }: { scene: SceneJson; onRenderProp: RenderProp }) {
  const post = scene.render?.post
  const setPost: PostSetter = (next) => {
    const kept = Object.fromEntries(Object.entries(next).filter(([, effect]) => effect !== undefined))
    onRenderProp('post', Object.keys(kept).length > 0 ? kept : undefined)
  }
  return (
    <>
      <VignetteOptions post={post} setPost={setPost} />
      <ColorGradeOptions post={post} setPost={setPost} />
    </>
  )
}
