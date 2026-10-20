/** Only new shadow pixels are capability-dependent; both legacy backend legs remain required. */
export function runtimeE2eLegOptions(backend, argv = []) {
  const args = argv[0] === '--' ? argv.slice(1) : argv
  for (const arg of args) {
    if (arg !== '--webgpu-shadows') throw new Error(`unknown runtime e2e argument: ${arg}`)
  }
  const requested = backend === 'webgl2' || args.includes('--webgpu-shadows')
  return { includeShadows: requested, includeEditorShadows: requested }
}
