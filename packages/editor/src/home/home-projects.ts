import { MemFS, RealFS, SCENE_PATH, type ProjectFS } from '../fs/project-fs'
import { saveRecent } from '../fs/recents'
import { resolveArchetype } from '../project/archetype'
import { GAME_PATH, parseGameSettings } from '../project/game'
import { projectArtFiles, projectFiles, type ProjectStart } from '../project/template'

/** Where a project found or made on disk goes next, and how Home shows the wait. */
export interface ProjectSink {
  onOpen: (fs: ProjectFS) => void
  setBusy: (busy: string | null) => void
}

/** What the new-project picker asked for. */
export interface NewProject {
  name: string
  start: ProjectStart
  archetypeId: string
}

async function isEmptyDir(handle: FileSystemDirectoryHandle): Promise<boolean> {
  for await (const _ of handle.entries()) return false
  return true
}

/** Downloads the archetype's bundled art into the project (demo start only). */
async function writeArtFiles(
  fs: ProjectFS,
  start: ProjectStart,
  archetypeId: string,
): Promise<void> {
  for (const [path, url] of Object.entries(projectArtFiles(start, archetypeId))) {
    const bytes = await (await fetch(url)).arrayBuffer()
    await fs.writeFile(path, new Uint8Array(bytes))
  }
}

/** Cancelling the picker throws AbortError: that one stays silent. */
function reportPickerError(err: unknown): void {
  if ((err as DOMException | null)?.name === 'AbortError') return
  console.error(err)
  const message = err instanceof Error ? err.message : String(err)
  alert(
    `Could not open the folder picker: ${message}\n\n` +
      'If the editor is running inside an embedded preview (IDE browser, iframe), ' +
      'open it in a regular Chrome/Edge tab instead.',
  )
}

/** Scaffolds a new project in a folder the user picks, then opens it. */
export async function createProject(project: NewProject, sink: ProjectSink): Promise<void> {
  if (!window.showDirectoryPicker) return
  const { name, start, archetypeId } = project
  try {
    const parent = await window.showDirectoryPicker({ mode: 'readwrite', id: 'waica-new' })
    for await (const [entryName, entry] of parent.entries()) {
      if (entryName !== name) continue
      // Reusing an empty folder is fine; overwriting something is not.
      if (entry.kind !== 'directory' || !(await isEmptyDir(entry))) {
        alert(`"${parent.name}" already has "${name}" — pick another name or another folder.`)
        return
      }
    }
    sink.setBusy('creating project…')
    const dir = await parent.getDirectoryHandle(name, { create: true })
    const fs = new RealFS(name, dir)
    for (const [path, content] of Object.entries(projectFiles(name, start, archetypeId))) {
      await fs.writeText(path, content)
    }
    await writeArtFiles(fs, start, archetypeId)
    await saveRecent(name, dir)
    sink.onOpen(fs)
  } catch (err) {
    reportPickerError(err)
  } finally {
    sink.setBusy(null)
  }
}

/** Opens a project folder the user picks, offering an empty scene when it has none. */
export async function openProjectFolder(onOpen: (fs: ProjectFS) => void): Promise<void> {
  if (!window.showDirectoryPicker) return
  try {
    const handle = await window.showDirectoryPicker({ mode: 'readwrite', id: 'waica-open' })
    const fs = new RealFS(handle.name, handle)
    const scene = await fs.readText(SCENE_PATH)
    if (scene == null && !(await addEmptyScene(fs, handle.name))) return
    await saveRecent(handle.name, handle)
    onOpen(fs)
  } catch (err) {
    reportPickerError(err)
  }
}

/** Asks to create an empty scene in a folder without one; false when it was not created. */
async function addEmptyScene(fs: ProjectFS, folder: string): Promise<boolean> {
  const settings = parseGameSettings(await fs.readText(GAME_PATH))
  let archetype
  try {
    archetype = resolveArchetype(settings.archetype)
  } catch (err) {
    alert(err instanceof Error ? err.message : String(err))
    return false
  }
  const make = confirm(
    `"${folder}" has no ${SCENE_PATH}. Create an empty scene (${archetype.label} archetype) there?`,
  )
  if (!make) return false
  // Empty, not the demo level: that scene instances prefabs, and this
  // folder has no prefab files to instance. "Create project" → Demo
  // level is the playable start — it writes the prefabs and the art
  // alongside the scene.
  await fs.writeText(SCENE_PATH, JSON.stringify(archetype.blankScene, null, 2) + '\n')
  return true
}

/** The full editor over an in-memory demo project — nothing touches the disk. */
export async function openDemo(onOpen: (fs: ProjectFS) => void): Promise<void> {
  const fs = new MemFS('waica-demo', projectFiles('waica-demo', 'demo', 'platformer'))
  await writeArtFiles(fs, 'demo', 'platformer')
  onOpen(fs)
}
