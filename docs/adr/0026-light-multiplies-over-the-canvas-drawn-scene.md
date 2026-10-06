# Light multiplies over the scene already drawn on the canvas

A lit scene is drawn exactly as an unlit one — straight into the canvas, blending on sRGB values (ADR 0025) — and its light then lands on top: a light-map rendered at the game's internal resolution is drawn over the frame as one multiply-blended quad, and Emissive drawables are drawn after it at full brightness. A scene with no lights and no Post Effect never touches a render target, so turning lighting on changes no sprite edge, and Ambient Light 1.0 with no lights leaves the frame identical. Only a Post Effect renders the scene into a render target.

## Considered Options

Drawing every lit scene into a linear render target — three's default, and the path a Post Effect needs anyway — was rejected: translucent edges blend in linear space there, so lighting a scene would change every soft sprite edge and break the zero-tolerance Sprite Batch parity the end-to-end suite holds. Lighting inside each material was rejected because every drawable, including the Sprite Batch instance shader, would need a light-aware variant.

## Consequences

Light darkens and brightens sRGB values, not linear ones, so falloff looks slightly different from a physically based multiply. A scene that adds a Post Effect moves into a render target and its translucent edges blend in linear space from then on.
