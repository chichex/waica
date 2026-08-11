# Art attribution

All sprites in this directory are composed from Creative Commons Zero (CC0)
pixel art by Kenney (www.kenney.nl). CC0 requires no attribution — this file
credits the source anyway and records exactly how each sheet was assembled,
so the composition is reproducible.

Sources (both CC0, downloaded 2026-08-10):

- **RPG Urban Pack 1.0** — https://kenney.nl/assets/rpg-urban-pack
  (`Tilemap/tilemap_packed.png`, a 27×18 grid of 16×16 tiles)
- **Tiny Dungeon 1.0** — https://kenney.nl/assets/tiny-dungeon
  (`Tilemap/tilemap_packed.png`, a 12×11 grid of 16×16 tiles)

Tile coordinates below are `(column, row)`, zero-based, into each pack's
`tilemap_packed.png`.

| File | Size | Source | Composition |
|---|---|---|---|
| `waica-hero.png` | 50×50 | RPG Urban | Character 1 (rows 0–2). 3×3 grid of 16×16 cells with 1px transparent gutters between them (frame-edge sampling never reaches a neighbour): rows = facing s/n/e (source columns 24/25/26), columns = idle / walk A / walk B (source rows base+0/1/2). West is mirrored from east at runtime. |
| `waica-npc.png` | 50×50 | RPG Urban | Character 4, the farmer (rows 9–11). Same 3×3 gutter layout as the hero. |
| `waica-blob.png` | 16×16 | Tiny Dungeon | (0, 9) — the green blob. |
| `waica-potion.png` | 16×16 | Tiny Dungeon | (7, 9) — the red potion. |
| `waica-grass.png` | 16×16 | RPG Urban | (1, 1) — plain grass. |
| `waica-water.png` | 16×16 | RPG Urban | (9, 7) — pond interior. |
| `waica-path.png` | 16×16 | Tiny Dungeon | (1, 4) — speckled sand. |
| `waica-fence.png` | 16×16 | Tiny Dungeon | (5, 6) — fence run. |
| `waica-tree.png` | 16×32 | RPG Urban | (16, 8)–(16, 9) — tall green tree, two tiles stacked. |
