// DEV only (issue #173 inference 19): the hook the editor's browser e2e drives
// a project through, as the examples expose `window.__waica` in DEV. It opens
// an in-memory project from text and base64 files (no folder picker), reads a
// file back as the editor saved it, and answers the live viewport Game for
// projections. Only `import.meta.env.DEV` code calls into this module, so a
// production build drops it (`pnpm test:dist` checks the bundle).
import type { Game } from '@waica/engine'
import { useEffect, useLayoutEffect, useRef } from 'react'
import { MemFS, type ProjectFS } from './fs/project-fs'

/** A file of the in-memory project: text, or bytes as base64. */
export type DevProjectFile = string | { base64: string }

export interface EditorDevHook {
  /** Opens a project held in memory, from its files by project path. */
  openMemoryProject(name: string, files: Record<string, DevProjectFile>): Promise<void>
  /** A file of the project the hook opened, as the editor has saved it; null when absent. */
  readText(path: string): Promise<string | null>
  /** The live viewport Game, or null while no stage shows one. */
  viewportGame(): Game | null
}

declare global {
  interface Window {
    /** DEV only: the editor's e2e hook. */
    __waicaEditor?: EditorDevHook
  }
}

let viewportGame: (() => Game | null) | null = null

const bytesOf = (base64: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))

/** Installs `window.__waicaEditor`, opening projects through `open`; returns what removes it. */
export function installEditorDevHook(open: (fs: ProjectFS) => void): () => void {
  let project: ProjectFS | null = null
  window.__waicaEditor = {
    async openMemoryProject(name, files) {
      const texts = Object.fromEntries(Object.entries(files).filter((entry): entry is [string, string] => typeof entry[1] === 'string'))
      const fs = new MemFS(name, texts)
      for (const [path, file] of Object.entries(files)) {
        if (typeof file !== 'string') await fs.writeFile(path, bytesOf(file.base64))
      }
      project = fs
      open(fs)
    },
    readText: (path) => (project ? project.readText(path) : Promise.resolve(null)),
    viewportGame: () => viewportGame?.() ?? null,
  }
  return () => {
    Reflect.deleteProperty(window, '__waicaEditor')
  }
}

/** Lets the hook answer the live viewport Game through `game`; returns what forgets it. */
export function registerViewportGame(game: () => Game | null): () => void {
  viewportGame = game
  return () => {
    if (viewportGame === game) viewportGame = null
  }
}

/** In DEV, installs the hook for as long as the app is mounted, opening projects through the latest `open`. */
export function useEditorDevHook(open: (fs: ProjectFS) => void): void {
  const openRef = useRef(open)
  useLayoutEffect(() => {
    openRef.current = open
  })
  useEffect(() => (import.meta.env.DEV ? installEditorDevHook((fs) => openRef.current(fs)) : undefined), [])
}

/** In DEV, lets the hook answer the Game of the stage `game` reads, while the Editor is mounted. */
export function useDevViewportGame(game: () => Game | null): void {
  useEffect(() => (import.meta.env.DEV ? registerViewportGame(game) : undefined), [game])
}
