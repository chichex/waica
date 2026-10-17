# Real benchmark evidence

- Source commit: `dd8cf9e`.
- Host: Linux `chichex-linux`, eight CPUs, Google Chrome 150.0.7871.186.
- Actual backend: `webgl2`; adapter: ANGLE/SwiftShader Vulkan software renderer.
- `webgl2-record.json`: `pnpm bench --backend=webgl2 --update-baseline`, exit 0.
- `webgl2-check.json`: `pnpm bench --backend=webgl2 --check`, exit 0, same source SHA.
- 29 results per run, exactly identical structural/draw counters. The 17 historical
  scenario-only baseline counters are unchanged; qualified baseline files are new.
- `shadows-sun-on-50.resources` carries the actual same-Game resource exercise:
  three fixed warmups, ten measured cycles, 121 ordered checkpoints before disposal.
  Backend allocation/destruction, color/depth attachments, target retirement and
  raw renderer memory are included. Other workloads' timing windows exclude it.

The resource gate caught retained programs from abandoned glTF clone render state.
Native `Object3D.dispose()` now retires only the clone's rendering state, preserving
shared cache resources. It also distinguishes Three's shader-source character
count (`programsSize`) from GPU storage; every raw value remains in both files.
Actual program/resource counts and non-source storage must remain stable.

Median/p95 and Off-pair deltas are informational. No WebGPU evidence is implied:
its explicit benchmark leg failed at the first scenario with a device-instance
OperationError, before producing a result or baseline. Issue 203's H-1/H-2 protocols
must run on a functional WebGPU host at the final delivered SHA.
