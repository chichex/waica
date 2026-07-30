// Copies the built editor into dist/editor so the published `waica` package
// ships the whole app. Runs after tsc in this package's build script; pnpm's
// topological ordering (via the @waica/editor devDependency) guarantees the
// editor is built first.
import { cpSync, existsSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const editorDist = path.join(here, '..', 'editor', 'dist')
const target = path.join(here, 'dist', 'editor')

if (!existsSync(path.join(editorDist, 'index.html'))) {
  console.error('waica: editor build not found — run `pnpm --filter @waica/editor build` first')
  process.exit(1)
}

rmSync(target, { recursive: true, force: true })
cpSync(editorDist, target, { recursive: true })
console.log(`waica: bundled editor from ${path.relative(process.cwd(), editorDist)}`)
