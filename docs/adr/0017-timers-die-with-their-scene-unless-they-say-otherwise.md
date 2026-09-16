# Timers die with their scene unless they say otherwise

Every Timer and Tween that `game.time` schedules is scene-scoped: `unloadScene()` cancels it without running `onComplete`. One that must cross a scene change says so with `{ scope: 'session' }`, and one that names an `owner` is also cancelled when that entity is destroyed, whatever its scope. We follow ADR 0012 rather than ADR 0011 because a timer's callback almost always closes over the scene that scheduled it — an attack cooldown, a hurt stun, a delayed spawn — and a callback that outlives its scene runs against destroyed entities with no error anywhere.

## Considered Options

Mirroring ADR 0011's host subscriptions — surviving by default and dying only with `{ scope: 'scene' }` — was rejected: `game.onUpdate` and `game.events` are wired once at boot by a host, while timers are created mid-scene by components, so the annotation would land on almost every call and forgetting it fails silently. Cancelling every timer on unload with no opt-in was rejected because a transition fade (#74) has to start in one scene and finish in the next.

## Consequences

`game.onUpdate` survives a scene change and `game.time.every` does not; a host that schedules a session clock at boot must pass `{ scope: 'session' }`, and the engine README states that asymmetry next to audio's. Scene-scoped timers are cancelled before the incoming scene's entities spawn, so nothing the outgoing scene scheduled can fire against the incoming one.
