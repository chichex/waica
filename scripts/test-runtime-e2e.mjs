import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { RENDER_BACKEND_LEGS, runRuntimeE2e } from './runtime-e2e.mjs'
import { runtimeE2eRunOptions, selectedSubLegs } from './runtime-e2e-policy.mjs'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

// Existing browser scenarios still run on both Render Backends (issue #140).
// New shadow pixels require WebGL2 automatically, WebGPU only with --webgpu-shadows.
// `--group <name>` (repeatable) narrows the run to groups of sub-legs, for CI's
// parallel jobs (runtime-e2e-policy.mjs); without it every group runs.
// Both legs run whenever they have a sub-leg selected, so one leg's failure
// never hides the other's result; any failure still fails the gate. A leg
// with none (WebGPU in the shadows group without --webgpu-shadows) would
// verify nothing, so it is skipped and says so.
const failures = []
const results = []
const ran = []
const legs = RENDER_BACKEND_LEGS.map((renderLeg) => {
  const runOptions = runtimeE2eRunOptions(renderLeg.backend, process.argv.slice(2))
  return { renderLeg, runOptions, subLegs: selectedSubLegs(runOptions) }
})
console.log(`waica runtime e2e policy: ${JSON.stringify(legs.map(({ renderLeg, runOptions }) => ({ backend: renderLeg.backend, ...runOptions })))}`)
for (const { renderLeg, runOptions, subLegs } of legs) {
  if (subLegs.length === 0) {
    console.log(`waica runtime e2e (checkout-${renderLeg.backend}): SKIPPED, no sub-leg is selected on this Render Backend, so nothing was verified on it`)
    continue
  }
  ran.push(renderLeg.backend)
  try {
    results.push(
      await runRuntimeE2e({
        root,
        cliPath: path.join(root, 'packages/cli/dist/cli.js'),
        engineRoot: path.join(root, 'packages/engine'),
        label: `checkout-${renderLeg.backend}`,
        renderLeg,
        ...runOptions,
      }),
    )
  } catch (error) {
    console.error(`waica runtime e2e (checkout-${renderLeg.backend}) FAILED:`, error)
    failures.push(error)
  }
}
if (failures.length > 0) {
  throw new AggregateError(failures, `${failures.length} of ${ran.length} Render Backend legs failed`)
}

// The animation is stepped by the simulation, not drawn by the backend (issue
// #166 CA-18): the third-person Player's pose hash at the same frame is the same on
// webgl2 and webgpu. The third-person group always runs on both legs, so
// whenever it is selected, its legs are compared here.
if (legs.some(({ runOptions }) => runOptions.includeThirdPerson)) {
  const poseHashes = results.map((result) => result.thirdPerson?.animation?.poseHashAt)
  assert.ok(poseHashes.every((at) => at?.hash), `every leg must report the third-person Player's pose hash; ${JSON.stringify(poseHashes)}`)
  assert.equal(new Set(poseHashes.map((at) => `${at.frame}:${at.hash}`)).size, 1, `both Render Backend legs must report the same pose hash at the same frame; ${JSON.stringify(poseHashes)}`)
  console.log(`waica runtime e2e: the third-person Player's pose hash agrees across ${results.length} Render Backend legs at frame ${poseHashes[0].frame}: ${poseHashes[0].hash}`)
} else {
  console.log('waica runtime e2e: the third-person group is not selected, so there is no pose hash to compare across Render Backend legs')
}
