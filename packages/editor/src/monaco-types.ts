// Monaco TypeScript setup: the embedded code editor typechecks project
// code for real. The @waica package sources are bundled as raw strings
// (script-sources.ts's trick, applied wholesale) and registered as libs
// under a virtual file:///node_modules/, so `import ... from
// '@waica/engine'` resolves inside Monaco without the project having
// installed anything. Models must live under file:/// for the lookup to
// reach that node_modules — CodePane passes each file's project path.
// Limit: three's types aren't bundled, so THREE-typed surfaces read as
// `any` here; that never squiggles the open file, only softens hints.
import * as monaco from 'monaco-editor'

const PACKAGES: Record<string, Record<string, string>> = {
  '@waica/engine': import.meta.glob(['../../engine/src/**/*.ts', '!**/*.test.ts'], {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>,
  '@waica/behaviors': import.meta.glob(['../../behaviors/src/**/*.ts', '!**/*.test.ts'], {
    query: '?raw',
    import: 'default',
    eager: true,
  }) as Record<string, string>,
}

const defaults = monaco.languages.typescript.typescriptDefaults

defaults.setCompilerOptions({
  target: monaco.languages.typescript.ScriptTarget.ESNext,
  module: monaco.languages.typescript.ModuleKind.ESNext,
  moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
  allowNonTsExtensions: true,
  strict: true,
})

for (const [name, sources] of Object.entries(PACKAGES)) {
  // No package.json needed: node resolution falls back to index.ts.
  defaults.addExtraLib(`export * from './src/index'\n`, `file:///node_modules/${name}/index.ts`)
  for (const [key, source] of Object.entries(sources)) {
    const rel = key.slice(key.lastIndexOf('/src/') + 1)
    defaults.addExtraLib(source, `file:///node_modules/${name}/${rel}`)
  }
}
