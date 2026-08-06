import { cpSync, existsSync, rmSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const editorTemplate = path.join(here, '..', 'editor', 'template')
const target = path.join(here, 'dist', 'template')
const nativeImporter = path.join(here, 'src', 'native-import.cjs')

if (!existsSync(path.join(editorTemplate, 'package.json.tpl'))) {
  console.error('waica-mcp: editor project template not found')
  process.exit(1)
}

rmSync(target, { recursive: true, force: true })
cpSync(editorTemplate, target, { recursive: true })
cpSync(nativeImporter, path.join(here, 'dist', 'native-import.cjs'))
console.log(`waica-mcp: bundled template from ${path.relative(process.cwd(), editorTemplate)}`)
