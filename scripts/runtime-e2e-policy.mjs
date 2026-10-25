/**
 * The runtime e2e's sub-legs, named after runRuntimeE2e's `include*` options,
 * in the groups CI runs as parallel jobs (`.github/workflows/ci.yml`). A group
 * runs on both Render Backends in one process, so a cross-backend assertion
 * (the third-person pose hash at frame 13) stays inside its group. With no
 * `--group`, every group runs, as `pnpm test:e2e` always did.
 */
export const RUNTIME_E2E_GROUPS = Object.freeze({
  core: Object.freeze([
    'HappyPath', 'Reload', 'Alias', 'Projection', 'Topdown', 'Isometric', 'SceneSwap', 'SceneFade', 'BatchParity',
    'Lighting', 'Negative', 'SignalShutdown',
  ]),
  'third-person': Object.freeze(['ThirdPerson']),
  shadows: Object.freeze(['ShadowLeg']),
  editor: Object.freeze(['Editor3d']),
})

function knownGroup(name) {
  if (typeof name === 'string' && Object.hasOwn(RUNTIME_E2E_GROUPS, name)) return name
  throw new Error(`unknown runtime e2e group: ${String(name)} (known: ${Object.keys(RUNTIME_E2E_GROUPS).join(', ')})`)
}

/** `[--] [--webgpu-shadows] [--group <name>]...`; anything else is a mistake, never a smaller run. */
function parseArguments(argv) {
  const rest = argv[0] === '--' ? argv.slice(1) : [...argv]
  const parsed = { webgpuShadows: false, groups: [] }
  while (rest.length > 0) {
    const arg = rest.shift()
    if (arg === '--webgpu-shadows') parsed.webgpuShadows = true
    else if (arg === '--group') parsed.groups.push(knownGroup(rest.shift()))
    else throw new Error(`unknown runtime e2e argument: ${arg}`)
  }
  return parsed
}

/** Only new shadow pixels are capability-dependent; both legacy backend legs remain required. */
export function runtimeE2eLegOptions(backend, argv = []) {
  const requested = backend === 'webgl2' || parseArguments(argv).webgpuShadows
  return { includeShadows: requested, includeEditorShadows: requested }
}

/** Every `include*` option runRuntimeE2e takes on `backend`: the selected groups' sub-legs, under the shadow policy. */
export function runtimeE2eRunOptions(backend, argv = []) {
  const { groups } = parseArguments(argv)
  const selected = new Set((groups.length > 0 ? groups : Object.keys(RUNTIME_E2E_GROUPS)).flatMap((group) => RUNTIME_E2E_GROUPS[group]))
  const legs = Object.values(RUNTIME_E2E_GROUPS).flat().map((leg) => [`include${leg}`, selected.has(leg)])
  const shadows = runtimeE2eLegOptions(backend, argv)
  return { ...Object.fromEntries(legs), ...shadows, includeShadowLeg: selected.has('ShadowLeg') && shadows.includeShadows }
}
