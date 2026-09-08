# Sound dies with its scene unless it says otherwise

Every sound `game.audio.play()` starts is scene-scoped: `unloadScene()` stops it. A sound that must cross a scene change says so at the call site with `{ scope: 'session' }`, and only then does it survive. We decided this so the annotation lands on the rare, deliberate case — a music bed — instead of on the overwhelmingly common one, a one-shot effect that should never outlive the map it was triggered in.

## Considered Options

Mirroring `GameUi` literally — surviving by default, dying only with `{ scope: 'scene' }` — was rejected because it puts the ceremony on the common case: every `play()` for a footstep, a coin or a sword swing would have to remember the annotation, and forgetting it leaves the previous map's audio playing in the new one with nothing to catch it. `GameUi`'s default is right for `GameUi` because a host mounts a HUD once at boot; the usage profile of `play()` is the opposite. Attaching the lifetime to the channel — `sfx` dies, `music` survives — was rejected because it couples the mixing bus to retention: a looping ambience that should die with its scene would have to sit on `sfx` and lose the music volume control.

## Consequences

The engine's two scope rules point in opposite directions, and that asymmetry has to be stated wherever either one is documented, or it reads as an oversight. Anything that must outlive a scene stays explicit at its call site, which is what keeps ADR 0011's "session-scoped by construction" honest for audio. A future subsystem that adopts a scope flag has two precedents to choose from, and has to justify which one it follows.
