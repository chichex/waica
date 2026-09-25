# Assets Ready is a promise beside a synchronous scene load

`loadScene` keeps spawning synchronously, and `game.assets.ready()` is a separate promise that resolves once every texture requested so far has loaded or has failed and been recorded; a host awaits it before its first frame, and a Run Session waits for it before reporting ready, after a `scene` operation and before every screenshot. We decided this so a scene load stays a plain, frame-exact operation (ADR 0006, ADR 0011) while pop-in becomes something a host or an agent opts out of instead of something they work around.

## Considered Options

Making `loadScene` itself asynchronous was rejected because it changes a public signature in six lockstep packages, the Runtime Bridge's `scene` operation and the editor's two call sites, and because a load that awaits the network no longer composes with frame-exact stepping. A cache with no readiness signal was rejected because it leaves the MCP unable to tell a half-textured screenshot from a finished one. Rejecting the promise on a failed image was rejected because a missing PNG would then hang or break a host that awaits it; as audio already decided for sounds (#67, CA-9), a failure is recorded and counted instead.

## Consequences

Readiness is relative to the moment it is awaited: a later spawn that requests new art reopens it until that art settles. The Runtime Bridge reports `assets: { pending, loaded, failed }` in its metadata under the `'assets'` capability, and Run Session readiness and screenshots take as long as the images do, bounded by the session timeout. Textures are the second subsystem, after audio, whose browser dependency reaches the engine through an injectable seam (ADR 0013).
