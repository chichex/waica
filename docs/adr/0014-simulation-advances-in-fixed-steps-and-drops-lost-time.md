# The simulation advances in fixed steps and drops the time it cannot run

The engine used to hand every component whatever wall-clock delta the last frame took, so jump arcs, collision sampling and state timers differed between a 60 Hz and a 144 Hz display, and a hitch played the world in slow motion through a 0.1 s clamp. The loop now consumes a fixed Simulation Step of 1/60 s from an accumulator: every `onUpdate`, the scene camera and the host's update callbacks receive exactly that step; a frame runs as many whole steps as its elapsed time contains, up to a per-frame cap; and time beyond the cap is dropped — the simulation may fall behind the wall clock but never runs slow. The Runtime Bridge's `step` advances whole steps (`frames`) and takes no `dt`; an engine that receives one rejects it.

## Considered Options

Keeping the variable delta was rejected because game-feel values were being tuned against hardware-dependent behavior, and the cost of switching grows with every value tuned. Repaying dropped time from the accumulator was rejected because a machine that cannot keep up would chain slow motion into a spiral. A per-project step size was rejected because a project that changed it would no longer reproduce the archetypes' tuned feel, and the MCP would have to read it to know what one step means. Interpolating render positions between steps was deferred, not rejected: it requires separating an entity's logical position from its render node, which are the same object today, and every demo targets 60 Hz, where the last step is the frame.

## Consequences

`input.endFrame()` runs after every step, not once per frame, or a frame that runs two steps would see one press twice. ADR 0006's "explicit `dt`" wording is superseded: a Run Session advances by steps, which is exactly what makes it reproducible from the request alone. The fixed step is announced as the `fixed-step` bridge capability, never as a protocol version bump, because a version mismatch disables the bridge entirely. At 120 Hz and above the picture updates 60 times a second until interpolation lands.
