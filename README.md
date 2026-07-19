# Waica 🐕

**An archetype-driven, open source game engine for the web.**

Pick what you're making — a platformer, a top-down adventure, an isometric game — and Waica sets up the movement, the camera, the physics and the exact animations you'll need. Opinionated rails for the common 90%, a real TypeScript engine underneath for everything else. 2D and 3D, one core.

**Status: milestone 1 in progress.** The platformer archetype already runs with factory game feel — coyote time, jump buffering, jump cut, squash & stretch — and the in-game inspector (press `~`) live-edits behavior params and persists them to the project (`waica.params.json`). No visual editor yet; that's milestone 2.

- Design doc (Spanish, for now): [DESIGN.md](./DESIGN.md)
- Stack: TypeScript · three.js (WebGPU → WebGL2 planned) · Vite
- Exports: web (static HTML) now; desktop via Electron (Steam/Epic) planned
- License: MIT

Named after a childhood dog. She was a good girl.

## Run it

```bash
pnpm install
pnpm dev   # platformer archetype — ← → move · space jump · ~ inspector
```

## Packages

| Package | What it is |
|---|---|
| `@waica/engine` | Core: game loop, Entity + Components, input actions, sprites, animated sprites + animation contracts, AABB solids |
| `@waica/behaviors` | Curated game-feel library: `PlatformerMovement`, `PlatformerAnimator`, `CameraFollow`, … |
| `@waica/archetype-platformer` | Opinionated platformer setup — playable from minute zero. The placeholder hero is Waica herself (pixel art, script-generated) |
| `@waica/overlay` | In-game inspector: live-edit params, persisted via the dev plugin |
