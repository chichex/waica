# Render benchmarks

Run from the repository root with installed workspace dependencies and system Chrome.
This private package is never published. Counters are gates; median/p95, GC and the
16.6 ms frame-budget verdict are informational, not a promise of 60 FPS.

```sh
pnpm bench --backend=webgl2 --update-baseline
pnpm bench --backend=webgl2 --check
pnpm bench --backend=webgpu --update-baseline
pnpm bench --backend=webgpu --check
pnpm bench --backend=both --check
```

Without a selector, browser backend selection remains automatic. `--gpu` chooses
hardware access through ANGLE/Vulkan; it is **not** a backend selector. A requested
backend must match the actual renderer, never a fallback. macOS needs `--local`.
Remote runs forward backend selection:

```sh
WAICA_BENCH_HOST=chichex-linux pnpm bench:remote --backend=webgl2 --check
```

Remote execution requires a pushed SHA, unattended SSH and its dedicated clone;
it never modifies another remote checkout. An inaccessible host is not a pass.

## Shadow workloads

The historical 17 workloads remain, plus twelve paired shadow cases: 50/200 casters,
one Sun / one PointLight / four PointLights, each with an Off control that preserves
the exact lights, illumination, content, camera and input. At least one caster is
an animated glTF. Medium/40 is the active configuration; Sun maps 2048² and Point
512² per face. Five render-only warmup frames stay outside the measured window of
60 GPU-synchronized Simulation Steps. Results carry the actual backend/adapter,
quality, lights and casters. Pair timing deltas are informational.

PointLight may render six shadow views. Four points plus Sun can add 25 in a public
scene; there are no automatic light caps or FPS-based degradation. Shadow reach is
finite and radial for points, without truncating illumination. Existing 3D scenes
now default to active shadows. Historical falling-boxes/skinned-characters fixtures
explicitly use Off to preserve their physics/animation-only intent; public scenes
are not disabled to preserve a benchmark.

## Evidence and baseline identity

Baselines are keyed by **backend and scenario**; a WebGPU run never overwrites or
compares against WebGL2. Historical scenario-only files are preserved and usable
only when their embedded backend matches. Complete unique matrices are mandatory.
Do not rewrite a differing baseline before explaining its counter delta.

Resource evidence must observe actual renderer memory and native shadow storage,
not only scene meshes/materials. Repeated equivalent checkpoints are taken after
warmup on the same Game/renderer across ten Off/On, resize and scene-swap cycles,
before renderer disposal resets its counters. Stable internal caches are allowed;
retained growth and outgoing-owner shadow storage are not.

WebGL2 runtime/editor visual captures are in
`.sdd/evidence/issue-203-3d-shadows/webgl2/`. Positive WebGPU visuals and resource
baselines remain externally pending under issue #203's H-1/H-2 protocol. Blank
frames, fallback and issue-151 exceptions do not verify that backend.
