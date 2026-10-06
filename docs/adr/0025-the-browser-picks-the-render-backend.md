# The browser picks the Render Backend

A Game draws through three's `WebGPURenderer`: WebGPU when the browser offers it, otherwise the renderer's own WebGL2 fallback. No option forces either one, and the classic `WebGLRenderer` is gone, so every drawable — including the Sprite Batch instance shader, written as a node material — has a single implementation. Because the renderer initializes asynchronously, `new Game()` stays synchronous and `game.ready()` resolves once it can draw (rejecting when neither backend initializes); frames before that simulate without drawing. A Run Session waits for it and reports which backend it got.

## Considered Options

Keeping `WebGLRenderer` as an opt-out was rejected: the Sprite Batch would need its instance shader twice (GLSL through `onBeforeCompile`, which node materials ignore, and TSL), and every render test would run on both. Forcing `WebGPURenderer` onto WebGL first was rejected because WebGPU would ship untested. An async `Game.create()` factory was rejected because it breaks every host and test that builds a Game, while a promise beside a synchronous constructor follows Assets Ready (ADR 0019).

## Consequences

A game cannot work around a broken WebGPU driver by itself; that waits on the browser's own blocklist. The end-to-end suite runs once per backend so both stay covered, and the `THREE` namespace re-exported by `@waica/engine` is the `three/webgpu` build. Lighting and post-processing (#78) build on node materials and three's render pipeline rather than on an `EffectComposer`.
