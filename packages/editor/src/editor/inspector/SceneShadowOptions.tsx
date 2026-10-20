import { useId, useState } from 'react'
import { resolveSceneShadows, sceneShadowIssues, SHADOW_OVERRIDE_PARAMS, type SceneJson } from '@waica/engine'
import { NumberField } from '../NumberField'
import { ParamDiagnosticMessages } from '../StringListField'
import { useRejectedInput } from './use-rejected-input'

type RenderProp = (key: string, value: unknown) => void

function ShadowQualityRow({ value, issue, onValue }: {
  value: string
  issue?: string
  onValue: (value: string) => void
}) {
  const id = useId()
  return (
    <>
      <label className="ed-row">
        <span>Shadow quality</span>
        <select value={value} aria-invalid={!!issue || undefined} aria-describedby={issue ? id : undefined}
          onChange={(event) => onValue(event.target.value)}>
          {value === '' && <option value="" disabled>Invalid stored quality</option>}
          <option value="off">Off</option>
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </label>
      <ParamDiagnosticMessages id={id} diagnostics={issue ? [{ severity: 'error', message: issue }] : []} />
    </>
  )
}

function ShadowDistanceRow({ value, issue, onValue }: {
  value: number | string
  issue?: string
  onValue: (value: number) => boolean
}) {
  const id = useId()
  const { attach, revision, resetInput } = useRejectedInput()
  const range = SHADOW_OVERRIDE_PARAMS.shadowMaxDistance
  return (
    <div ref={attach}>
      <label className="ed-row">
        <span>Scene shadow max distance</span>
        <NumberField key={revision} value={value} min={range.min} max={range.max} step={range.step}
          aria-invalid={!!issue || undefined} aria-describedby={issue ? id : undefined}
          onChange={(text) => {
            const parsed = Number.parseFloat(text)
            if (Number.isFinite(parsed) && !onValue(Math.min(range.max, Math.max(range.min, parsed)))) {
              // Drop the rejected keyboard draft, not the last committed setting.
              resetInput()
            }
          }} />
      </label>
      <ParamDiagnosticMessages id={id} diagnostics={issue ? [{ severity: 'error', message: issue }] : []} />
    </div>
  )
}

/** Display authored numbers as-is and diagnose invalid JSON instead of normalizing it on open. */
function sceneShadowFields(scene: SceneJson) {
  const block: unknown = scene.render?.shadows
  const authored = typeof block === 'object' && block !== null && !Array.isArray(block) ? block : {}
  const resolved = resolveSceneShadows(block)
  const issues = sceneShadowIssues(scene.render)
  const issueFor = (field: string): string | undefined => issues.find((issue) => issue.field === field || issue.field === 'render.shadows')?.message
  const qualityIssue = issueFor('render.shadows.quality')
  const distanceIssue = issueFor('render.shadows.maxDistance')
  const storedDistance = 'maxDistance' in authored ? authored.maxDistance : undefined
  const distance = typeof storedDistance === 'number' && Number.isFinite(storedDistance) ? storedDistance : (distanceIssue ? '' : resolved.maxDistance)
  return { authored, resolved, qualityIssue, distanceIssue, distance }
}

/** Scene shadow policy, kept separate from Ambient Light and per-light overrides. */
export function SceneShadowOptions({ scene, onRenderProp }: { scene: SceneJson; onRenderProp: RenderProp }) {
  const [rejected, setRejected] = useState<{ scene: SceneJson; field: string; message: string } | null>(null)
  const { authored, resolved, qualityIssue, distanceIssue, distance } = sceneShadowFields(scene)
  const setShadow = (field: string, value: unknown): boolean => {
    try {
      onRenderProp('shadows', { ...authored, [field]: value })
      setRejected(null)
      return true
    } catch (error) {
      setRejected({ scene, field, message: error instanceof Error ? error.message : String(error) })
      return false
    }
  }
  const issueFor = (field: string, storedIssue?: string): string | undefined =>
    [storedIssue, rejected?.scene === scene && rejected.field === field ? rejected.message : undefined].filter(Boolean).join(' ') || undefined
  return (
    <>
      <ShadowQualityRow value={qualityIssue ? '' : resolved.quality} issue={issueFor('quality', qualityIssue)}
        onValue={(quality) => setShadow('quality', quality)} />
      <div className="ed-hint">Off disables shadows without changing light overrides.</div>
      <ShadowDistanceRow value={distance} issue={issueFor('maxDistance', distanceIssue)}
        onValue={(maxDistance) => setShadow('maxDistance', maxDistance)} />
      <div className="ed-hint">World units. Lights inherit this distance unless overridden.</div>
    </>
  )
}
