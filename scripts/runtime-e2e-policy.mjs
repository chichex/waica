/** Only new shadow pixels are capability-dependent; both legacy backend legs remain required. */
export function runtimeE2eLegOptions(backend, argv = []) {
  for (const arg of argv) {
    if (arg !== '--webgpu-shadows') throw new Error(`unknown runtime e2e argument: ${arg}`)
  }
  const requested = backend === 'webgl2' || argv.includes('--webgpu-shadows')
  return { includeShadows: requested, includeEditorShadows: requested }
}
