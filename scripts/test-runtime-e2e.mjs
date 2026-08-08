import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { runRuntimeE2e } from './runtime-e2e.mjs'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

await runRuntimeE2e({
  root,
  cliPath: path.join(root, 'packages/cli/dist/cli.js'),
  engineRoot: path.join(root, 'packages/engine'),
  label: 'checkout',
})
