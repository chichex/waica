# A Game shows one scene at a time, and only scene-scoped state dies with it

`loadScene` replaces the live scene instead of adding to it, and `Game.unloadScene()` destroys exactly what the scene owns: the entities it spawned and the UI pieces it declared or showed as its own. Everything else is session-scoped and survives the change — stats, parameter overrides, input, pointer, renderer, and every subscription the host created. We decided this so carrying score and health between maps needs no host bookkeeping, and so "what outlives a scene" has one answer the rest of the engine can be built against instead of one answer per subsystem.

## Considered Options

Additive loading — keeping today's accidental stacking as a supported streaming mode — was rejected because no consumer exists and it would force per-scene arbitration of the camera, render sort, projection and UI list before anything else could be decided. Clearing `game.events` and `game.onUpdate` on unload was rejected because it silently breaks a host that wires once at boot: the platformer's coin counter would stop counting after the first swap, with no error anywhere. Resetting stats on every load was rejected because carrying score and health between maps is the case the feature exists for.

## Consequences

Anything that must outlive a scene has to be session-scoped by construction — the line audio (#67), the asset cache (#76) and camera effects (#74) inherit rather than re-decide. A UI piece shown by a behavior must declare itself scene-scoped or it survives into a map where nothing knows to hide it. `unloadScene()` leaves the Game as newly constructed, so there is exactly one "no scene" state to describe and test.
