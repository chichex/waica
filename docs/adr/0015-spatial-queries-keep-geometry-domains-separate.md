# Spatial queries keep trigger, proximity, physical, and visual geometry separate

The public `game.query` service evaluates spatial questions in Logical Coordinates, but each operation keeps one domain: area and point inspect Hitboxes, nearest measures entity transforms, and ray intersects Solids, including Tilemap-derived geometry. Pointer remains a render-space sprite picker. This preserves existing targeting, interaction, physics, and visual-picking behavior while allowing internal candidate providers to be replaced by a future broadphase.

## Considered Options

A required geometry selector on every operation was rejected because it would make callers choose among concepts that do not share identity or ordering semantics. Automatically combining Hitboxes, Solids, transforms, and sprite bounds was rejected because one entity can contribute several shapes, derived Solids have transient identity, and visual front-most selection is not a physical overlap rule.

## Consequences

New geometry domains require explicit API expansion rather than silently changing an existing operation. Future acceleration may replace candidate enumeration, but it must preserve each operation’s domain and observable ordering.
