import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { RENDER_BACKEND_LEGS, runRuntimeE2e } from './runtime-e2e.mjs'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

// Every browser scenario runs once per Render Backend (issue #140, ADR 0025).
// Both legs always run, so one leg's failure never hides the other's result;
// any failure still fails the gate.
const failures = []
for (const renderLeg of RENDER_BACKEND_LEGS) {
  try {
    await runRuntimeE2e({
      root,
      cliPath: path.join(root, 'packages/cli/dist/cli.js'),
      engineRoot: path.join(root, 'packages/engine'),
      label: `checkout-${renderLeg.backend}`,
      renderLeg,
    })
  } catch (error) {
    console.error(`waica runtime e2e (checkout-${renderLeg.backend}) FAILED:`, error)
    failures.push(error)
  }
}
if (failures.length > 0) {
  throw new AggregateError(failures, `${failures.length} of ${RENDER_BACKEND_LEGS.length} Render Backend legs failed`)
}
