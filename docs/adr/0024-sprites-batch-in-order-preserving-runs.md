# Sprites batch in order-preserving runs

Every Sprite and AnimatedSprite is drawn through a Sprite Batch by default: each frame, sprites are ordered by depth exactly as before (layer bands, then y-sort), and each run of consecutive sprites that share a batch key — texture, pixel-art filtering, shape, and for animated sprites the sheet — becomes one instanced draw with its own render order. A sprite of another key in between ends the run, so batching never changes what is drawn in front of what. A scene can opt out as a whole with `render.batch: false`, which restores one mesh per sprite.

## Considered Options

Batching purely by key and letting the depth buffer order sprites (with an alpha test discarding transparent pixels) was rejected: it would maximise batching but change semi-transparent and antialiased edges in every existing game. Making batching opt-in per scene or per sprite was rejected because the measured cost — one draw call per sprite, over the 16.6 ms budget at 5000 static or 2000 animated sprites on the benchmark host — would stay the default for every author who never turns it on.

## Consequences

The gain depends on how interleaved a scene's keys are in depth: a scene of one texture draws in one call, while a top-down scene that alternates many textures by y gains little. The per-sprite mesh path stays in the engine because the opt-out needs it. Instance buffers reuse freed slots and are released with their scene.
