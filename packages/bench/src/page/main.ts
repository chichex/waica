import { SCENARIOS, type ScenarioName } from '../results.ts'
import './bench-global.ts'
import { runScenario } from './harness.ts'

function requestedScenario(): ScenarioName {
  const name = new URLSearchParams(location.search).get('scenario')
  const scenario = SCENARIOS.find((candidate) => candidate === name)
  if (!scenario) throw new Error(`bench: unknown scenario "${name ?? ''}"`)
  return scenario
}

// One scenario per page load: the runner opens a fresh page for each, so
// no scenario inherits another's heap, caches or GL state.
window.__waicaBench = { result: Promise.resolve().then(() => runScenario(requestedScenario())) }
