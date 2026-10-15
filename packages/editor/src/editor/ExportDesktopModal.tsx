import { useEffect, useId, useState } from 'react'
import { reportRejection } from '../report-rejection'
import { DESKTOP_GUIDE, EXPORT_PLATFORMS, exportCommand, type ExportPlatformId } from './export-command'
import { ModalBackdrop } from './ModalBackdrop'
import { useEscapeKey } from './use-escape-key'

type CopyState = 'idle' | 'copied' | 'failed'

const COPY_MESSAGES: Record<CopyState, string> = {
  idle: '',
  copied: 'Copied',
  failed: "Couldn't copy: select the command and press Ctrl+C",
}

/** Gives the focus back to whatever had it when the modal opened (the toolbar button) once it closes. */
function useReturnFocus(): void {
  useEffect(() => {
    const opener = document.activeElement
    return () => {
      if (opener instanceof HTMLElement) opener.focus()
    }
  }, [])
}

/** The platforms and the Steam switch the user picked, and the command they make. */
function useExportChoice(steamAppId: number | null) {
  const [platforms, setPlatforms] = useState<ReadonlySet<ExportPlatformId>>(() => new Set(EXPORT_PLATFORMS.map(({ id }) => id)))
  const [steamOn, setSteamOn] = useState(true)
  const togglePlatform = (id: ExportPlatformId): void => {
    const next = new Set(platforms)
    if (!next.delete(id)) next.add(id)
    setPlatforms(next)
  }
  const command = exportCommand({ platforms, steam: steamAppId === null ? null : steamOn })
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

function SteamCheck({ appId, on, onToggle }: { appId: number; on: boolean; onToggle: () => void }) {
  return (
    <fieldset className="ed-export-row">
      <legend>Steam</legend>
      <label className="ed-export-check">
        <input type="checkbox" checked={on} onChange={onToggle} />
        Include Steamworks (app {appId})
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

/**
 * Builds the `waica export desktop` command for the project (issue 200
 * CA-24, CA-25): it runs nothing, it only hands the command to the clipboard.
 * `steamAppId` is game.json's `desktop.steam.appId`, null without Steam.
 */
export function ExportDesktopModal({ steamAppId, onClose }: { steamAppId: number | null; onClose: () => void }) {
  const choice = useExportChoice(steamAppId)
  const titleId = useId()
  useEscapeKey(onClose)
  useReturnFocus()
  return (
    <ModalBackdrop onDismiss={onClose}>
      <div className="ed-modal ed-modal-export" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="ed-modal-head">
          <span id={titleId}>Export desktop</span>
          <button className="ed-mini" aria-label="Close export desktop" onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="ed-modal-body ed-export-body">
          <PlatformChecks platforms={choice.platforms} onToggle={choice.togglePlatform} />
          {steamAppId !== null && <SteamCheck appId={steamAppId} on={choice.steamOn} onToggle={choice.toggleSteam} />}
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
