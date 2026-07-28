// The runner behind "Play runs your code" (play-code.ts): TypeScript is
// transpiled by the Monaco TS worker the editor already ships — no
// second compiler on board — and executed as a blob ES module with its
// @waica imports rewritten to shims that re-export the editor's own
// module instances. defineStates/defineRole in project files therefore
// mutate the same registries the Play game reads.
import * as monaco from 'monaco-editor'
import * as engine from '@waica/engine'
import * as behaviors from '@waica/behaviors'
import { rewriteImports } from '../project/play-code'

declare global {
  // Shim modules read their package instance from here by name.
  var __waicaPlayModules: Record<string, object> | undefined
}

/** A blob module re-exporting one @waica package's live editor instance. */
function shimUrl(name: string, instance: object): string {
  ;(globalThis.__waicaPlayModules ??= {})[name] = instance
  const bindings = Object.keys(instance).filter((key) => key !== 'default')
  const source =
    `const m = globalThis.__waicaPlayModules[${JSON.stringify(name)}]\n` +
    `export const { ${bindings.join(', ')} } = m\n`
  return URL.createObjectURL(new Blob([source], { type: 'text/javascript' }))
}

let shims: Record<string, string> | undefined
function moduleShims(): Record<string, string> {
  return (shims ??= {
    '@waica/engine': shimUrl('@waica/engine', engine),
    '@waica/behaviors': shimUrl('@waica/behaviors', behaviors),
  })
}

/**
 * The TS language service boots lazily with the first typescript model —
 * which may well be the shadow model transpile() just created. Poll
 * briefly while the mode's worker finishes loading.
 */
async function tsWorkerFor(uri: monaco.Uri): Promise<{
  getEmitOutput(fileName: string): Promise<{ emitSkipped: boolean; outputFiles: { name: string; text: string }[] }>
}> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await (await monaco.languages.typescript.getTypeScriptWorker())(uri)
    } catch (error) {
      if (attempt >= 20) throw error
      await new Promise((resolve) => setTimeout(resolve, 150))
    }
  }
}

export async function transpile(source: string, path: string): Promise<string> {
  // A shadow model, so a file open in CodePane (possibly with unsaved
  // edits) is never touched — Play always runs what's saved on disk.
  const uri = monaco.Uri.parse(`file:///.play/${path}`)
  monaco.editor.getModel(uri)?.dispose()
  const model = monaco.editor.createModel(source, 'typescript', uri)
  try {
    const worker = await tsWorkerFor(uri)
    const output = await worker.getEmitOutput(uri.toString())
    const js = output.outputFiles.find((file) => file.name.endsWith('.js'))?.text
    if (output.emitSkipped || js == null) {
      throw new Error('could not compile — check the file for syntax errors')
    }
    return js
  } finally {
    model.dispose()
  }
}

export async function execute(js: string): Promise<void> {
  const url = URL.createObjectURL(
    new Blob([rewriteImports(js, moduleShims())], { type: 'text/javascript' }),
  )
  try {
    await import(/* @vite-ignore */ url)
  } finally {
    URL.revokeObjectURL(url)
  }
}
