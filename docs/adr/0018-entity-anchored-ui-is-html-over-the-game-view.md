# Entity-anchored UI is HTML drawn over the game view

Anything that follows an entity on screen — a damage number, a health bar, a speech bubble, an interact prompt — is an Anchored Piece: an instance of a UI Piece in the HTML overlay, repositioned every frame from its entity's projected position, never text or geometry rendered in the three scene. We chose this because it reuses the UI Piece pipeline (HTML, CSS, shadow roots, `{{bindings}}`) that projects already own as files, it covers bubbles and bars that a world-space text renderer would make expensive, and it adds no text-rendering dependency.

## Considered Options

A `Text` component rendered in the three scene (a canvas texture, or troika SDF as `DESIGN.md` once planned) was rejected for now: it would sort correctly among sprites under y-sort and show in the editor's edit mode, but it needs a text renderer, turns a bordered bubble or a bar into a mesh problem, and re-rasterizes on every text change. Shipping both at once was rejected as more than one issue's worth of design.

## Consequences

Anchored Pieces always draw above the game world — a label behind a tree draws over it — hide with the rest of the overlay in the editor's edit mode, and do not align to the pixel-art grid. They are scene-scoped by construction rather than by a `scope` flag: they die with their entity, or linger for their own `seconds` when given one, and never outlive their scene (ADR 0011). Because every project owns its piece files under `src/ui/`, moving to world-space rendering later means migrating those files and the behaviors' params, not just the engine.
