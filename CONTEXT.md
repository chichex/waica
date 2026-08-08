# Waica

Archetype-driven web game engine: opinionated rails per game genre on top of a generic TypeScript core.

## Language

**Archetype**:
A genre + camera choice (platformer, top-down, …) packaged as a living declarative npm package (`@waica/archetype-*`) that configures behaviors, physics, camera, controls, animation contract and assets on top of the generic engine. Neither a boilerplate generator nor an engine fork.
_Avoid_: template, genre pack

**Archetype Manifest**:
The standard object every archetype package exports as `ARCHETYPE`: id, label, default scenes, registry, palette, prefabs, art, entity icons, bindings, action labels and bundle. Browser entries enrich it with art URLs; Node tooling uses an asset-import-free entry whose registry points at package-relative assets.

**Animation Contract**:
An archetype's declaration of which animation clips a role's states require and how a missing clip resolves through fallbacks. Direction-aware archetypes resolve clips per state × facing, with mirroring as a declarable fallback.
_Avoid_: clip list, animation set

**Chassis**:
The factory baseline something starts from and cannot shed: a prefab's core components (appearance, collision — configurable, never removable) and, by extension, the generic project skeleton every new project is created from.
_Avoid_: boilerplate, skeleton

**Project**:
A user's game: a plain-files Vite app (JSON scenes/prefabs/controls/stats, HTML UI, TS roles) depending on published `@waica/*` packages. The unit the editor opens and the MCP operates on.

**Run Session**:
A live, MCP-owned execution of one standalone Project for observation and control. It is keyed by canonical Project path, unique per Project within an MCP server, and never outlives its owning server.
_Avoid_: Dev server, run

**Runtime Bridge**:
The temporary control boundary through which a Run Session observes and controls the single live Game in its Project. It exists only while that Run Session is active.
_Avoid_: Inspection handle, live editor bridge

**Runtime Snapshot**:
A read-only, point-in-time view of a Run Session's game stats and live entities, transforms and component state. It can be filtered for focused observation without changing the Game.
_Avoid_: State dump, save state

**Project-owned code**:
The TS a user writes inside their project (`src/components`, `src/roles`, `src/states`) extending the archetype baseline. The game executes it, and `validate_project` evaluates it for deep metadata validation; other MCP introspection keeps it distinct from installed package code.

**Role**:
A named behavior definition (`defineRole`) a character references from its prefab JSON — `player`, `patroller`, `chaser`, or project-owned ones in `src/roles/`.

**Component Update Schedule**:
The deterministic per-entity sequence in which Waica advances component behavior each frame. It is derived from update constraints and canonical component identity, never from prefab authoring order.

**Update Constraint**:
A component-owned declaration that its per-frame update occurs after named sibling components when they are present. It expresses temporal ordering, not mandatory composition.
