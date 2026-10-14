import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { RENDER_BACKEND_LEGS, runRuntimeE2e } from './runtime-e2e.mjs'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

// Every browser scenario runs once per Render Backend (issue #140, ADR 0025).
// Both legs always run, so one leg's failure never hides the other's result;
// any failure still fails the gate.
const failures = []
const results = []
for (const renderLeg of RENDER_BACKEND_LEGS) {
  try {
    results.push(
      await runRuntimeE2e({
        root,
        cliPath: path.join(root, 'packages/cli/dist/cli.js'),
        engineRoot: path.join(root, 'packages/engine'),
        label: `checkout-${renderLeg.backend}`,
        renderLeg,
      }),
    )
  } catch (error) {
    console.error(`waica runtime e2e (checkout-${renderLeg.backend}) FAILED:`, error)
    failures.push(error)
  }
}
if (failures.length > 0) {
  throw new AggregateError(failures, `${failures.length} of ${RENDER_BACKEND_LEGS.length} Render Backend legs failed`)
}

// The animation is stepped by the simulation, not drawn by the backend (issue
// #166 CA-18): the third-person Player's pose hash at the same frame is the same on
// webgl2 and webgpu.
const poseHashes = results.map((result) => result.thirdPerson?.animation?.poseHashAt)
assert.ok(poseHashes.every((at) => at?.hash), `every leg must report the third-person Player's pose hash; ${JSON.stringify(poseHashes)}`)
assert.equal(new Set(poseHashes.map((at) => `${at.frame}:${at.hash}`)).size, 1, `both Render Backend legs must report the same pose hash at the same frame; ${JSON.stringify(poseHashes)}`)
console.log(`waica runtime e2e: the third-person Player's pose hash agrees across ${results.length} Render Backend legs at frame ${poseHashes[0].frame}: ${poseHashes[0].hash}`)
