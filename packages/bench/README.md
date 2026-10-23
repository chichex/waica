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

All native memory values remain in the JSON. Three 0.186's `programsSize` is
`program.code.length`, including generated variable names, not GPU allocation
bytes. It and its contribution to `total` are reported rather than mistaken for
a retained GPU leak. Actual program counts and all texture, target, buffer,
geometry and non-source storage counters must match equivalent checkpoints.
The original real leak (program count 19→21) was corrected by retiring clone-local
Object3D render state, without disposing cached glTF geometry/materials.

### Recorded WebGL2 run

At `dd8cf9e`, Linux `chichex-linux`, eight CPUs, Chrome 150.0.7871.186,
SwiftShader WebGL2: `--update-baseline` and `--check` both passed at the same SHA.
All 29 scenario counters repeated exactly; all 17 historical baselines remained
identical, including the explicit-Off physics/animation workloads. Qualified
baselines are committed without rewriting historical files.

The same-Game resource exercise passed ten cycles and 121 checkpoints, with zero
outgoing-owner shadow storage. Full recording/check JSON, raw memory values and
timings are in `.sdd/evidence/issue-203-3d-shadows/bench/`. Four PointLights and 200
casters measured median 33.2 ms/p95 41.4 ms on this software renderer; timings and
the Off-pair deltas are informational, not portability or frame-rate guarantees.

`pnpm bench --backend=webgpu --check` failed at the first scenario with
`OperationError: A valid external Instance reference no longer exists.` No
WebGPU baseline was written or accepted. Remote forwarding is unit-tested; a
remote measurement was not performed because SSH preflight did not trust that
host key. No SSH configuration was changed.

WebGL2 runtime/editor visual captures are in
`.sdd/evidence/issue-203-3d-shadows/webgl2/`. Positive WebGPU visuals and resource
baselines are not positively verified on this host. On 2026-10-17 the user withdrew
CA-18/21 from this delivery; H-1/H-2 remain optional future verification, not gates.
No tests or backend support were removed. Blank frames, fallback and issue-151
exceptions still do not verify that backend.

The independent browser suite now runs new shadow pixels automatically on
WebGL2. `pnpm test:e2e --webgpu-shadows` explicitly includes their unchanged strict
WebGPU runtime/editor counterparts. Legacy browser checks still require both
backends. Benchmark flags/baseline gates are unchanged by this CI selection.

After resumption, `--backend=webgl2 --check` passed again at df0b004, including the
ten-cycle resource gate. The exact JSON is `bench/webgl2-resume-check.json` under
the same evidence folder. Unit fixtures now use the runtime temporary directory,
and geometric CPU checks retain every frame/condition while avoiding repeated
matchers and world-matrix traversals. No timeout, tolerance or frame count changed.
