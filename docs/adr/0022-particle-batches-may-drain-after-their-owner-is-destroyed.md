# Particle batches may drain after their owner is destroyed

ParticleEmitter follows the normal component lifecycle by default and clears with its owner. With `destroyMode: 'drain'`, destroying the owner stops new emission, converts local particles to their current logical world positions and transfers the live batch to scene-scoped ownership until every particle expires. Scene unload and Game disposal always clear it.

## Considered Options

Always clearing with the owner was rejected as the only policy because a death burst emitted immediately before `Entity.destroy()` would never be visible. Requiring a separate transient emitter entity was rejected because every caller would have to allocate, configure and clean up that coordination. Always draining was rejected because resources would unexpectedly outlive every owner even when the effect does not need it.

## Consequences

The engine needs an internal scene-scoped owner for detached batch updates and GPU cleanup. A draining batch has no live Entity, accepts no new emissions and cannot outlive its scene.
