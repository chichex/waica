# Runtime shadow evidence

Captured by the strict CA-17 MCP/browser suite at clean commit `ad12bd6f05b478e83b26a28549d81d0c068c90de`, Google Chrome 150.0.7871.186, actual backend `webgl2`, canvas 640×360. These are implementation captures, not design references.

- `runtime-sun-{on,off}-f13.png`: receiver darkening 135, illuminated control delta 0.
- `runtime-point-{on,off}-f13.png`: receiver darkening 183.68, diagonal control delta 0. Luminous distance 9, independent Euclidean shadow range 2.
- `runtime-moving-caster-on-f73.png`: caster x=4 and its moved receiver darkening 135; the original receiver is no longer shadowed.
- `runtime-animated-gltf-on-{f13,f43}.png`: Walking_A at fixed frames 13/43. A fixed ground-only polygon, excluding the character bounds, has 370 changed shadow-mask pixels and zero overlap with visible character pixels. The complete on/off pairs are produced by the harness.

The complete matrix also checks caster/light opt-out, independent receiver opt-out, a camera following a 500-unit teleport and static glTF casting. All nine groups passed. No WebGPU result is implied.

Reproduce after `pnpm build` using the exported runner API:

```sh
WAICA_E2E_SCREENSHOT_DIR=/tmp/opencode/waica-203-ca17 node --input-type=module -e '
import { runRuntimeE2e, RENDER_BACKEND_LEGS } from "./scripts/runtime-e2e.mjs";
const root = process.cwd();
await runRuntimeE2e({root,cliPath:`${root}/packages/cli/dist/cli.js`,engineRoot:`${root}/packages/engine`,label:"ca17-webgl2",renderLeg:RENDER_BACKEND_LEGS[0],includeNegative:false,includeReload:false,includeAlias:false,includeTopdown:false,includeIsometric:false,includeProjection:false,includeSceneSwap:false,includeSceneFade:false,includeBatchParity:false,includeLighting:false,includeThirdPerson:false,includeEditor3d:false,includeSignalShutdown:false,includeShadows:true});
'
```

`pnpm test:e2e` requires both legacy backend legs (`webgl2` and `webgpu`) and runs the new strict shadow cases on WebGL2 by default. The new WebGPU shadow cases are manual opt-in:

```sh
pnpm test:e2e -- --webgpu-shadows
```

The direct form `pnpm test:e2e --webgpu-shadows` is equivalent. Opting in keeps both legacy legs and enables the unchanged strict WebGPU shadow oracles; it does not imply that WebGPU passed on this host. The shadow leg never accepts a blank frame or the legacy issue-151 exception as a pass.

## Editor captures

`editor-*.png` were recaptured after review fixes on 2026-10-20 at clean final-stack source `7c70ad2f3963a76307c213dab13ca65181d0c3b3`, Chrome 150, WebGL2. No visual reference was supplied. These show the existing palette/rows, actual stored/inherited values, and selected-light coverage, not an invented mock. The complete WebGL2 leg passed in 216454 ms; the legacy editor result is timed separately from its shadow flow.

The permanent editor flow checks all quality levels and map changes on the same Game, zero console/page errors, darkening 135/control delta 0, scene/prefab inheritance and reset, undo/redo, saved-project reopen, current-frame Sun camera fit, PointLight radius 2 and absence of all `waica:editor-*` objects in Play. It is included in `pnpm test:e2e`.

The minimized resize failure was reproduced before correcting it. Resizing now disposes obsolete GPU storage through `RenderTarget.setSize` while keeping the active node used by cached materials; it does not dispose/recreate that node on every size change. Global Off and destruction still dispose the complete shadow resource chain.
