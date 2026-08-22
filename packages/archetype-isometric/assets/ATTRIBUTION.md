# Art attribution and composition receipt

All source art is Creative Commons Zero (CC0). The run recomposed these files
offline from originals retained outside the repository at
`~/Sync/workspace/waica-art-src/iso-kit-a/`.

## Puny Characters

- **Puny Characters** by Shade (merchant-shade)
- Source: https://merchant-shade.itch.io/16x16-puny-characters
- Mirror: https://opengameart.org/content/puny-characters
- Licence shown by the source page: **Creative Commons Zero v1.0 Universal**.
  The author also states: “No need to give me credit.”
- Source files: `puny-characters/orcs/Puny-Characters/Warrior-Blue.png`,
  `Human-Worker-Red.png`, and `Orc-Grunt.png` (each 768×256, 24×8 cells
  of 32×32).

Each output character sheet is 4 columns × 5 rows of native 32×32 cells with
one transparent pixel between cells. Output columns are source columns 0, 1,
2 and 3: idle followed by the three walk poses. Output rows and exact source
cell rectangles are:

| Output facing | Source row | Cell rectangles `(left, top, right, bottom)` |
|---|---:|---|
| `n` | 4 | `(0,128,32,160)`, `(32,128,64,160)`, `(64,128,96,160)`, `(96,128,128,160)` |
| `ne` | 5 | `(0,160,32,192)`, `(32,160,64,192)`, `(64,160,96,192)`, `(96,160,128,192)` |
| `e` | 6 | `(0,192,32,224)`, `(32,192,64,224)`, `(64,192,96,224)`, `(96,192,128,224)` |
| `se` | 7 | `(0,224,32,256)`, `(32,224,64,256)`, `(64,224,96,256)`, `(96,224,128,256)` |
| `s` | 0 | `(0,0,32,32)`, `(32,0,64,32)`, `(64,0,96,32)`, `(96,0,128,32)` |

The offline composition compared every one of those four poses against the
source mirror pair. Source row 2 (`w`) is the pixel-exact horizontal mirror of
row 6 (`e`), row 3 (`nw`) mirrors row 5 (`ne`), and row 1 (`sw`) mirrors row 7
(`se`) in all three character files. The west rows are therefore intentionally
absent from the committed sheets and resolve through runtime mirroring.

| Output file | Character | Output size |
|---|---|---:|
| `waica-iso-hero.png` | `Warrior-Blue.png` | 131×164 |
| `waica-iso-villager.png` | `Human-Worker-Red.png` | 131×164 |
| `waica-iso-orc.png` | `Orc-Grunt.png` | 131×164 |

## hawkbirdtree isometric tileset

- **32x32 Isometric Tileset Version 0_1** by hawkbirdtree
- Source: https://opengameart.org/content/32x32-isometric-tileset-version-01
- Licence: **Creative Commons Zero (CC0)**.
- Source file: `hawkbirdtree-64x32/big_isometric_tileset64x32.png`
  (1024×1344).

`waica-iso-ground.png` is a 5×1 regular sheet of flat 64×32 diamonds with
one transparent pixel between columns. No raised/cube tile is included:

| Index | Meaning | Source rectangle `(left, top, right, bottom)` |
|---:|---|---|
| 0 | grass | `(832,576,896,608)` |
| 1 | dirt | `(896,576,960,608)` |
| 2 | path | `(832,640,896,672)` |
| 3 | water | `(896,640,960,672)` |
| 4 | border | `(960,640,1024,672)` |

Tall art remains a Sprite prop:

| Output file | Source rectangle `(left, top, right, bottom)` | Output size |
|---|---|---:|
| `waica-iso-tree.png` | `(768,208,832,304)`, transparent bottom trimmed | 64×94 |
| `waica-iso-rock.png` | `(784,868,814,890)` | 30×22 |
| `waica-iso-crate.png` | `(896,832,960,896)` | 64×64 |
