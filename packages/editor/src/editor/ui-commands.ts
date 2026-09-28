import { NEW_UI_HTML, uiPath } from '../fs/ui-fs'
import type { EditorCore } from './editor-commits'
import { withoutKey } from './prefab-commands'

/** UI piece files: creating, duplicating and deleting them, each one an undo step. */

export function createUi(core: EditorCore): void {
  const [uiLib] = core.library.uiLib
  let n = 1
  while (uiLib[`ui-${n}`]) n++
  const name = `ui-${n}`
  core.commitUi(name, NEW_UI_HTML)
  core.view.openView({ kind: 'ui', name })
}

export function duplicateUi(core: EditorCore, name: string): void {
  const [uiLib] = core.library.uiLib
  const html = uiLib[name]
  if (html == null) return
  let copy = `${name}-copy`
  for (let n = 2; uiLib[copy]; n++) copy = `${name}-copy-${n}`
  core.commitUi(copy, html)
  core.view.openView({ kind: 'ui', name: copy })
}

export async function deleteUi(core: EditorCore, name: string): Promise<void> {
  const [uiLib, setUiLib] = core.library.uiLib
  const html = uiLib[name]
  if (html == null) return
  if (!window.confirm(`Delete ${name}? Scenes listing it will skip it with a warning.`)) return
  core.persistence.cancel(`ui:${name}`)
  // The file may not exist yet (debounced save cancelled above): ignore.
  await core.fs.deleteFile(uiPath(name)).catch(() => {})
  core.history.record({ kind: 'ui', name, before: html, after: null })
  setUiLib((lib) => withoutKey(lib, name))
  const { view } = core.view
  if (view?.kind === 'ui' && view.name === name) core.view.setView(null)
}
