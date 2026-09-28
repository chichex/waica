import { useState } from 'react'
import { registeredRoles, roleDefinition } from '@waica/engine'
import type { CharacterIdentity } from '../project/chassis'
import { ModalBackdrop } from './ModalBackdrop'
import { useEscapeKey } from './use-escape-key'

/** What the creation dialog hands back: who it is, and the role package. */
export interface NewCharacterPick {
  identity: CharacterIdentity
  role: string
}

/** Roles offered as an enemy's hunting style — every role that isn't an identity of its own. */
function enemyRoles(): string[] {
  return registeredRoles().filter((name) => name !== 'player' && name !== 'npc')
}

/** The role an identity installs; '' while a custom role is still unnamed. */
function pickedRole(identity: CharacterIdentity, movement: string | null, customRole: string): string {
  if (identity === 'player') return 'player'
  if (identity === 'npc') return 'npc'
  if (identity === 'enemy') return movement ?? customRole.trim()
  return customRole.trim()
}

interface RolePickerModalProps {
  /** Preselected identity: 'player' until the project has one, then 'enemy'. */
  suggested: CharacterIdentity
  onPick: (pick: NewCharacterPick) => void
  onCancel: () => void
}

/**
 * Modal shown when creating a character: pick WHO it is (player / enemy /
 * npc / custom) there and then, so the character is born whole — graph,
 * driver and the identity's extras installed (player → Respawn, enemy →
 * Hazard), working in Play from second zero. Enemies also pick how they
 * hunt: a built-in movement role or a custom one from the project's code;
 * 'custom' is bring-your-own-role with no extras at all. The identity is
 * fixed at birth: changing it later means deleting the character and
 * creating a new one.
 */
export function RolePickerModal({ suggested, onPick, onCancel }: RolePickerModalProps) {
  const [identity, setIdentity] = useState<CharacterIdentity>(suggested)
  /** The enemy's movement role; null = custom (named below). */
  const [movement, setMovement] = useState<string | null>(enemyRoles()[0] ?? null)
  const [customRole, setCustomRole] = useState('')
  useEscapeKey(onCancel)

  const role = pickedRole(identity, movement, customRole)
  const option = (id: CharacterIdentity, desc: string) => (
    <IdentityOption id={id} picked={identity === id} desc={desc} onPick={setIdentity} />
  )

  return (
    <ModalBackdrop onDismiss={onCancel}>
      <div className="ed-modal ed-modal-role">
        <header className="ed-modal-head">
          <span>New character — what is it?</span>
          <button className="ed-mini" onClick={onCancel}>
            ✕
          </button>
        </header>
        <div className="ed-modal-body ed-role-body">
          {option(
            'player',
            `${roleDefinition('player')?.description ?? ''} Respawn included — it comes back at its spawn point when it dies.`,
          )}
          {option('enemy', 'Hurts the player on touch — Hazard included. Pick how it hunts:')}
          {identity === 'enemy' && (
            <EnemyHuntingPicker
              movement={movement}
              customRole={customRole}
              onMovement={setMovement}
              onCustomRole={setCustomRole}
            />
          )}
          {option('npc', roleDefinition('npc')?.description ?? '')}
          <CustomRoleOption
            group="identity"
            picked={identity === 'custom'}
            customRole={customRole}
            idleHint="a role of your own, no extras included — name it here, define it in your project (defineRole)"
            onPick={() => setIdentity('custom')}
            onCustomRole={setCustomRole}
          />
          <div className="ed-hint">
            the choice installs the whole package — states, the behaviour that moves them and
            the identity's extras — and is fixed at birth: to change it later, delete the
            character and create a new one.
          </div>
        </div>
        <footer className="ed-modal-foot">
          <button className="ed-mini" onClick={onCancel}>
            Cancel
          </button>
          <button className="ed-primary" disabled={role === ''} onClick={() => onPick({ identity, role })}>
            Create
          </button>
        </footer>
      </div>
    </ModalBackdrop>
  )
}

interface IdentityOptionProps {
  id: CharacterIdentity
  picked: boolean
  desc: string
  onPick: (id: CharacterIdentity) => void
}

/** One radio row of the identity group: its name and what it means. */
function IdentityOption({ id, picked, desc, onPick }: IdentityOptionProps) {
  return (
    <label className={`ed-role-option ${picked ? 'is-picked' : ''}`}>
      <input type="radio" name="identity" checked={picked} onChange={() => onPick(id)} />
      <span className="ed-role-name">{id}</span>
      <span className="ed-role-desc">{desc}</span>
    </label>
  )
}

interface EnemyHuntingPickerProps {
  /** The picked movement role; null = custom. */
  movement: string | null
  customRole: string
  onMovement: (role: string | null) => void
  onCustomRole: (role: string) => void
}

/** How an enemy hunts: one radio per movement role, plus a custom role of the project's. */
function EnemyHuntingPicker({
  movement, customRole, onMovement, onCustomRole,
}: EnemyHuntingPickerProps) {
  return (
    <div className="ed-role-sub">
      {enemyRoles().map((name) => (
        <label key={name} className={`ed-role-option ${movement === name ? 'is-picked' : ''}`}>
          <input
            type="radio"
            name="enemy-role"
            checked={movement === name}
            onChange={() => onMovement(name)}
          />
          <span className="ed-role-name">{name}</span>
          <span className="ed-role-desc">{roleDefinition(name)?.description}</span>
        </label>
      ))}
      <CustomRoleOption
        group="enemy-role"
        picked={movement === null}
        customRole={customRole}
        idleHint="a role of your own — name it here, define it in your project (defineRole)"
        onPick={() => onMovement(null)}
        onCustomRole={onCustomRole}
      />
    </div>
  )
}

interface CustomRoleOptionProps {
  group: 'identity' | 'enemy-role'
  picked: boolean
  customRole: string
  /** What the row says while another option is picked. */
  idleHint: string
  onPick: () => void
  onCustomRole: (role: string) => void
}

/** The "custom" radio of a group: picked, it reveals the field that names the role. */
function CustomRoleOption({
  group, picked, customRole, idleHint, onPick, onCustomRole,
}: CustomRoleOptionProps) {
  return (
    <label className={`ed-role-option ${picked ? 'is-picked' : ''}`}>
      <input type="radio" name={group} checked={picked} onChange={onPick} />
      <span className="ed-role-name">custom</span>
      {picked ? (
        <input
          type="text"
          // eslint-disable-next-line jsx-a11y/no-autofocus -- choosing "custom" reveals this field; focus follows the choice
          autoFocus
          placeholder="your role name…"
          value={customRole}
          onChange={(e) => onCustomRole(e.target.value)}
        />
      ) : (
        <span className="ed-role-desc">{idleHint}</span>
      )}
    </label>
  )
}
