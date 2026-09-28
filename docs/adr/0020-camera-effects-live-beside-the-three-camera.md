# Camera effects live beside the three camera, not on it

`game.camera` stays the raw `THREE.OrthographicCamera`, and shake, fade and flash live in a separate service, `game.cameraEffects`. The effects never write into the camera's base position: follow, deadzone and limits compute a base center, and the shake offset is layered on top only when drawing, so smoothing never feeds on its own jitter. We chose this because the editor and existing projects read and write `game.camera.position` directly, and the effects have to compose with follow and clamping instead of fighting them.

## Considered Options

Replacing `game.camera` with a wrapper that owns `shake()`/`fade()` — the API #74 first sketched — was rejected: it breaks the editor's viewport code and every consumer that treats `game.camera` as a three camera, across six lockstep packages. Writing the shake offset straight into `camera.position` was rejected because `stepSceneCamera` damps from the previous position, so the jitter would leak into the follow.

## Consequences

Code that moves `game.camera` by hand moves the base, and effects still apply on top. A fade is session-scoped and survives a scene change (ADR 0011); shake and flash are scene-scoped. Punch-zoom, deferred, would also belong to `game.cameraEffects`, not `setViewHeight`.
