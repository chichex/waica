# Waica

Archetype-driven web game engine: opinionated rails per game genre on top of a generic TypeScript core.

## Language

**Archetype**:
A genre + camera choice (platformer, top-down, …) packaged as a living declarative npm package (`@waica/archetype-*`) that configures behaviors, physics, camera, controls, animation contract and assets on top of the generic engine. Neither a boilerplate generator nor an engine fork.
_Avoid_: template, genre pack

**Archetype Manifest**:
The standard object every archetype package exports as `ARCHETYPE`: id, label, default scenes, registry, palette, prefabs, art, entity icons, bindings, action labels and bundle. The contract through which the editor and the MCP consume archetypes.

**Chassis**:
The factory baseline something starts from and cannot shed: a prefab's core components (appearance, collision — configurable, never removable) and, by extension, the generic project skeleton every new project is created from.
_Avoid_: boilerplate, skeleton

**Project**:
A user's game: a plain-files Vite app (JSON scenes/prefabs/controls/stats, HTML UI, TS roles) depending on published `@waica/*` packages. The unit the editor opens and the MCP operates on.

**Project-owned code**:
The TS a user writes inside their project (`src/components`, `src/roles`, `src/states`) extending the archetype baseline. The game loads it via glob imports; tooling never executes it (the MCP marks it "not validated").

**Role**:
A named behavior definition (`defineRole`) a character references from its prefab JSON — `player`, `patroller`, `chaser`, or project-owned ones in `src/roles/`.
