# A scene declares its space, and z is a world axis only in 3D

> Superseded in part by [ADR 0030](./0030-the-editor-edits-3d-scenes-through-its-own-view-camera.md): the editor no longer opens a 3D scene read-only; it edits it through its own view camera. Everything else here stands.
>
> Amended by [ADR 0031](./0031-the-perspective-camera-orbits-a-followed-entity.md): the perspective camera is no longer always fixed by the scene. A block that names an entity to `follow` orbits it once per Simulation Step (the Orbit Camera); one without `follow` is placed once from `position` and `target`, as below. Camera Effects' shake now moves a perspective camera too.

A scene says `render.space: '2d' | '3d'` and the Game follows it. In a `2d` scene (the default) nothing changes: an orthographic camera, `z` as draw order (layer bands, y-sort, the isometric projection), Sprite Batches and the light-map. In a `3d` scene `z` is a world axis (Y up, the ground is the XZ plane) under a perspective camera, the frame is drawn straight to the canvas with a depth buffer deciding what is in front, and none of those 2D mechanisms runs. Lights are three's own (an ambient light the Game owns, a `Sun` and a `PointLight` per entity), not a light-map. `game.camera` is whichever camera the live scene uses; code that needs a point on the screen asks `game.worldToScreen`.

## Shadow amendment — issue 203

The original consequence below calling shadows a later block is superseded:
Sun/PointLight casting and Model casting/receiving now default on through the
existing WebGPURenderer with soft PCF. `render.shadows` selects Off/Low/Medium/High;
absence means Medium and finite reach 40, independent of Ambient Light.
Sun maps are 1024²/2048²/4096² and Point maps 256²/512²/1024² per face.
Global Off restores the previous shadow-free render. Existing 3D appearance/cost
may change; 2D and deterministic simulation do not.

Sun coverage follows the active camera with caster padding and texel stabilization,
without cascades. Point shadows have a Euclidean radius independent of lighting
attenuation. Nullable numeric overrides inherit scene settings; explicit instance
null and reset-to-prefab are different actions. No automatic light/FPS cap is added.
See the [public format and migration](../../packages/engine/README.md#3d-shadows-and-migration).

Both backend paths are implemented, but WebGPU has no positive pixel/resource
evidence on this host. The user withdrew CA-18/21 from this delivery on 2026-10-17;
H-1/H-2 remain optional future verification, with support/tests preserved.
Automatic browser CI requires new shadow pixels on WebGL2; the explicit
`pnpm test:e2e --webgpu-shadows` command requests their strict WebGPU runs.
Legacy browser scenarios and backend pose parity remain required on both APIs.
Blank frames/fallback are not verification. Manual 3D renders use an isolated, checked Three 0.186 NodeFrame
compatibility boundary; native RAF and Game Time are not advanced twice.

## Considered Options

Inferring 3D from the presence of a `Model` or a perspective camera was rejected: the same scene file would draw through two different pipelines depending on what a later edit adds, and validation would have nothing to check a component against. Keeping `z` as draw order and adding a separate depth axis was rejected because every 3D object would then need two ways to say how far away it is. Mixing 2D and 3D in one scene (2.5D: models inside an orthographic scene, two lighting systems, picking in a 2D viewport) was deferred: it needs ordering and lighting rules this block does not design, so `validate_project` keeps the engine's 2D components out of 3D scenes and its 3D components out of 2D ones until a later block decides.

## Consequences

`game.camera` became a union, and everything that read the orthographic frame (the Pointer, Anchored Pieces, spatial audio, the editor's viewport) narrows on the camera kind or goes through the one projection helper. `game.view` and `setViewHeight()` are the orthographic zoom and do nothing under a perspective camera. The editor opens a 3D scene read-only: it draws it through the scene's own camera and edits its transforms in the inspector, with no picking, gizmo or grid until a 3D editor block. `GLTFLoader` imports the bare `'three'` while the engine draws with `'three/webgpu'`; both builds share one core, so no class is duplicated, but every bundler of a project that loads glTF aliases the bare specifier to the WebGPU build so the module graph holds a single three (the migration note in the engine README). Physics, skeletal animation playback, shadows and a third-person archetype are later blocks.
