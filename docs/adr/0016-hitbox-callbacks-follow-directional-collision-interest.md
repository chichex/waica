# Hitbox callbacks follow directional collision interest

A Hitbox belongs to one named Collision Layer and declares outgoing interest through its Collision Mask. A pair reaches exact overlap when either mask names the other layer, but only each interested side receives `onCollide`; Spatial Queries remain mask-agnostic. This supports one-way triggers and projectiles without requiring duplicated bilateral configuration.

## Considered Options

- Require both masks to agree: rejected because one-way interactions would require unrelated targets to opt in.
- Notify both sides when either mask agrees: rejected because uninterested components would still receive callbacks.
- Use an engine-global collision matrix or bitset registry: rejected to keep category names project-owned and avoid a public registry/tuning surface.

## Consequences

- `layer = 'default'` and `collidesWith = ['*']` preserve automatic dispatch for unconfigured Hitboxes.
- Shipped handlers rely on explicit masks rather than post-hoc identity guards, so existing projects using those handlers require migration.
- Collision Masks cannot narrow `game.query.area` or `game.query.point`.
