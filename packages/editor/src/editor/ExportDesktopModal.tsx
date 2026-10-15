import { useEffect, useId, useRef, useState, type RefObject } from 'react'
import type { ProjectFS } from '../fs/project-fs'
import { readJsonObject } from '../json-object'
import { GAME_PATH } from '../project/game'
import { reportRejection } from '../report-rejection'
import {
  DESKTOP_GUIDE,
  EXPORT_PLATFORMS,
  exportCommand,
  steamDeclaration,
  type ExportPlatformId,
  type SteamDeclaration,
} from './export-command'
import { ModalBackdrop } from './ModalBackdrop'
import { useEscapeKey } from './use-escape-key'

type CopyState = 'idle' | 'copied' | 'failed'

const COPY_MESSAGES: Record<CopyState, string> = {
  idle: '',
  copied: 'Copied',
  failed: "Couldn't copy: select the command and press Ctrl+C",
}

/**
 * Moves the focus to the dialog's first control as it opens (a keyboard user
 * lands inside, not on the toolbar behind the backdrop) and gives it back to
 * whatever had it (the toolbar button) once it closes.
 */
function useModalFocus(dialog: RefObject<HTMLDivElement | null>): void {
  useEffect(() => {
    const opener = document.activeElement
    dialog.current?.querySelector('input')?.focus()
    return () => {
      if (opener instanceof HTMLElement) opener.focus()
    }
  }, [dialog])
}

/**
 * game.json's Steam as it is on disk when the modal opens: configure_desktop
 * may have changed it since the editor read the project. `remembered` stands
 * in until the file is read, and when it cannot be.
 */
function useSteamOnDisk(remembered: SteamDeclaration, fs: Pick<ProjectFS, 'readText'> | undefined): SteamDeclaration {
  const [onDisk, setOnDisk] = useState<{ steam: SteamDeclaration } | null>(null)
  useEffect(() => {
    if (!fs) return
    let open = true
    const read = fs.readText(GAME_PATH).then((text) => {
      const game = text === null ? null : readJsonObject(text)
      if (open && game) setOnDisk({ steam: steamDeclaration(game.desktop) })
    })
    reportRejection(read, 'read src/game.json for the desktop export')
    return () => {
      open = false
    }
  }, [fs])
  return onDisk ? onDisk.steam : remembered
}

/** The platforms and the Steam switch the user picked, and the command they make. */
function useExportChoice(steam: SteamDeclaration) {
  const [platforms, setPlatforms] = useState<ReadonlySet<ExportPlatformId>>(() => new Set(EXPORT_PLATFORMS.map(({ id }) => id)))
  const [steamOn, setSteamOn] = useState(true)
  const togglePlatform = (id: ExportPlatformId): void => {
    const next = new Set(platforms)
    if (!next.delete(id)) next.add(id)
    setPlatforms(next)
  }
  const command = exportCommand({ platforms, steam: steam === null ? null : steamOn })
  return { platforms, steamOn, command, togglePlatform, toggleSteam: () => setSteamOn(!steamOn) }
}

function PlatformChecks({ platforms, onToggle }: { platforms: ReadonlySet<ExportPlatformId>; onToggle: (id: ExportPlatformId) => void }) {
  return (
    <fieldset className="ed-export-row">
      <legend>Platforms</legend>
      {EXPORT_PLATFORMS.map(({ id, label }) => (
        <label key={id} className="ed-export-check">
          <input type="checkbox" checked={platforms.has(id)} onChange={() => onToggle(id)} />
          {label}
        </label>
      ))}
    </fieldset>
  )
}

function SteamCheck({ appId, on, onToggle }: { appId: number | null; on: boolean; onToggle: () => void }) {
  return (
    <fieldset className="ed-export-row">
      <legend>Steam</legend>
      <label className="ed-export-check">
        <input type="checkbox" checked={on} onChange={onToggle} />
        {appId === null ? 'Include Steamworks (no app id in game.json)' : `Include Steamworks (app ${appId})`}
      </label>
    </fieldset>
  )
}

/** The read-only command, its Copy button and what the clipboard said. */
function CommandField({ command }: { command: string | null }) {
  const [copied, setCopied] = useState<{ command: string | null; state: CopyState }>({ command: null, state: 'idle' })
  const fieldId = useId()
  // A changed command has not been copied yet: the message belongs to the command it was about.
  const state = copied.command === command ? copied.state : 'idle'
  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(command ?? '')
      setCopied({ command, state: 'copied' })
    } catch {
      setCopied({ command, state: 'failed' })
    }
  }
  return (
    <>
      <label htmlFor={fieldId}>Run this in your project folder:</label>
      <div className="ed-export-command">
        <input id={fieldId} type="text" readOnly value={command ?? ''} placeholder="pick at least one platform" onFocus={(e) => e.currentTarget.select()} />
        <button className="ed-primary" disabled={command === null} onClick={() => reportRejection(copy(), 'copy the export command')}>
          Copy
        </button>
        <span className={`ed-export-copy is-${state}`} role="status">
          {COPY_MESSAGES[state]}
        </span>
      </div>
    </>
  )
}

interface ExportDesktopModalProps {
  /** game.json's Steam as the editor read it; null without a `desktop.steam` block. */
  steam: SteamDeclaration
  /** The project, to re-read game.json as the modal opens; without it `steam` is the answer. */
  fs?: Pick<ProjectFS, 'readText'>
  onClose: () => void
}

/**
 * Builds the `waica export desktop` command for the project (issue 200
 * CA-24, CA-25): it runs nothing, it only hands the command to the clipboard.
 */
export function ExportDesktopModal({ steam: remembered, fs, onClose }: ExportDesktopModalProps) {
  const steam = useSteamOnDisk(remembered, fs)
  const choice = useExportChoice(steam)
  const titleId = useId()
  const dialog = useRef<HTMLDivElement>(null)
  useEscapeKey(onClose)
  useModalFocus(dialog)
  return (
    <ModalBackdrop onDismiss={onClose}>
      <div ref={dialog} className="ed-modal ed-modal-export" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="ed-modal-head">
          <span id={titleId}>Export desktop</span>
          <button className="ed-mini" aria-label="Close export desktop" onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="ed-modal-body ed-export-body">
          <PlatformChecks platforms={choice.platforms} onToggle={choice.togglePlatform} />
          {steam !== null && <SteamCheck appId={steam.appId} on={choice.steamOn} onToggle={choice.toggleSteam} />}
          <CommandField command={choice.command} />
          <a className="ed-export-guide" href={DESKTOP_GUIDE} target="_blank" rel="noreferrer">
            Signing and store upload: docs/desktop-export.md ↗
          </a>
        </div>
        <footer className="ed-modal-foot">
          <button className="ed-mini" onClick={onClose}>
            Close
          </button>
        </footer>
      </div>
    </ModalBackdrop>
  )
}
