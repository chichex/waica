# Run Sessions start paused and advance deterministically

> Partially superseded by [ADR-0014](./0014-simulation-advances-in-fixed-steps-and-drops-lost-time.md): a Run Session advances by whole Simulation Steps, not by an explicit `dt`. Everything else here stands.

An MCP Run Session reaches readiness after the scene is loaded but before simulation advances from its deterministic baseline. The caller queues semantic Waica actions and advances frames with explicit `dt`; queued input takes effect on the next stepped frame. Real-time playback remains an explicit mode that can be resumed and paused again.

## Considered Options

Real-time-by-default was rejected because wall-clock waits make gameplay assertions and input timing flaky. Deterministic-only execution was rejected because the same session must still support real-time playback for human observation.

## Consequences

The engine must expose one frame pipeline shared by manual stepping and its normal animation loop without changing ordinary non-MCP behavior. Runtime Snapshots and screenshots carry frame/time metadata so evidence can be correlated with the exact step that produced it.
