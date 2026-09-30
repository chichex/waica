# Y-sort participants may contribute multiple depth entries

A y-sort participant may contribute one or more render-space Y entries and receive one Z per entry. Single-entry renderables such as Sprite and AnimatedSprite keep their existing behaviour; a batched renderable such as ParticleEmitter can rank each quad globally against sprites and other particles while retaining one geometry, material and draw call.

## Considered Options

Using only the owner's Y for the whole batch was rejected because particles that travel or spawn across a wide area would cross sprites without changing their relative depth. Splitting the batch into separately drawn depth runs was rejected because it gives up the batching guarantee that motivated the primitive.

## Consequences

Y-sort work scales with the number of active depth entries rather than only the number of components. Batched renderables write the returned depths into their individual geometry, while exact order-independent alpha composition remains outside this contract.
