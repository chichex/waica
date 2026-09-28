import { useState } from 'react'
import { roleDefinition, type SceneComponentJson } from '@waica/engine'
import { useArchetype } from '../../project/archetype'
import { behaviourTypes } from '../../project/chassis'
import { machineProps, type MachineProps } from '../../project/states'
import { StateMachineCard } from '../StateMachinePanel'
import { ComponentCard } from './ComponentCard'
import { componentLabel } from './component-meta'
import { ComponentUpdateSchedule } from './update-schedule'

/** Context the Role card needs beyond the generic behaviour plumbing. */
export interface MachineCardContext {
  clips: string[]
  stateFiles: string[]
  roleFiles: string[]
  onPatch: (patch: Partial<MachineProps>) => void
  onCreateRoleFile: (role: string) => void
  onEditState: (state: string) => void
}

interface BehavioursSectionProps {
  id: string
  comps: SceneComponentJson[]
  present: Set<string>
  canRemove: (comp: SceneComponentJson) => boolean
  machine?: MachineCardContext
  /** Playability gap (e.g. logic without its driver), shown above the cards. */
  warning?: string
  overriddenFor?: (type: string) => Set<string> | undefined
  onProp: (type: string, key: string, value: unknown) => void
  onRemove: (type: string) => void
  onAdd: (type: string) => void
  onReset?: (type: string, key: string) => void
  onApply?: (type: string, key: string) => void
}

type BehaviourCardProps = Omit<
  BehavioursSectionProps,
  'comps' | 'present' | 'machine' | 'warning' | 'onAdd'
> & { comp: SceneComponentJson }

/** One behaviour's card, wired to the section's per-type callbacks. */
function BehaviourCard({
  id,
  comp,
  canRemove,
  overriddenFor,
  onProp,
  onRemove,
  onReset,
  onApply,
}: BehaviourCardProps) {
  return (
    <ComponentCard
      id={id}
      comp={comp}
      overridden={overriddenFor?.(comp.type)}
      onProp={(key, value) => onProp(comp.type, key, value)}
      onRemove={canRemove(comp) ? () => onRemove(comp.type) : undefined}
      onReset={onReset && ((key) => onReset(comp.type, key))}
      onApply={onApply && ((key) => onApply(comp.type, key))}
    />
  )
}

/**
 * The Role card with the role's driver nested under it — one visible
 * package — instead of as a sibling card the user must mentally connect.
 */
function RolePackage({
  machine,
  driver,
  ...card
}: BehaviourCardProps & { machine: MachineCardContext; driver: SceneComponentJson | undefined }) {
  const { comp, canRemove, onRemove } = card
  return (
    <div className="ed-role-pack">
      <StateMachineCard
        comp={comp}
        clips={machine.clips}
        stateFiles={machine.stateFiles}
        roleFiles={machine.roleFiles}
        onPatch={machine.onPatch}
        onCreateRoleFile={machine.onCreateRoleFile}
        onEditState={machine.onEditState}
        onRemove={canRemove(comp) ? () => onRemove(comp.type) : undefined}
        updateSchedule={<ComponentUpdateSchedule type={comp.type} />}
      />
      {driver && (
        <div className="ed-role-driver">
          <BehaviourCard {...card} comp={driver} />
        </div>
      )}
    </div>
  )
}

/** The role's driver component, when the machine's role declares one and it is present. */
function roleDriver(
  comps: readonly SceneComponentJson[],
  machine: MachineCardContext | undefined,
): SceneComponentJson | undefined {
  const machineComp = machine ? comps.find((c) => c.type === 'StateMachine') : undefined
  const driverType = machineComp ? roleDefinition(machineProps(machineComp).role)?.driver : undefined
  return driverType ? comps.find((c) => c.type === driverType) : undefined
}

export function BehavioursSection({
  comps,
  present,
  machine,
  warning,
  onAdd,
  ...card
}: BehavioursSectionProps) {
  const driverComp = roleDriver(comps, machine)
  return (
    <div className="ed-section">
      <header className="ed-sec-head">Behaviours</header>
      {warning && <div className="ed-warn-card">⚠ {warning}</div>}
      {comps.length === 0 && <div className="ed-hint">no behaviours yet</div>}
      {comps.map((comp) => {
        if (comp === driverComp) return null
        if (comp.type === 'StateMachine' && machine) {
          return (
            <RolePackage key={comp.type} {...card} comp={comp} machine={machine} driver={driverComp} />
          )
        }
        return <BehaviourCard key={comp.type} {...card} comp={comp} />
      })}
      <AddComponentRow present={present} onAdd={onAdd} />
    </div>
  )
}

function AddComponentRow({ present, onAdd }: { present: Set<string>; onAdd: (type: string) => void }) {
  const archetype = useArchetype()
  const [adding, setAdding] = useState('')
  const available = behaviourTypes(Object.keys(archetype.registry.components)).filter(
    (t) => !present.has(t),
  )
  return (
    <div className="ed-add-comp">
      <select value={adding} onChange={(e) => setAdding(e.target.value)}>
        <option value="">{available.includes('Tilemap') ? '+ component…' : '+ behaviour…'}</option>
        {available.map((t) => (
          <option key={t} value={t}>
            {componentLabel(t, archetype)}
          </option>
        ))}
      </select>
      <button
        className="ed-mini"
        disabled={!adding}
        onClick={() => {
          onAdd(adding)
          setAdding('')
        }}
      >
        add
      </button>
    </div>
  )
}
