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

Each output character sheet is 11 columns × 5 rows of native 32×32 cells with
one transparent pixel between cells (362×164). Output rows are the five
east-facing rows of the pack; the source row order, verified on the sheets
themselves (2026-08-29), is `0 s · 1 se · 2 e · 3 ne · 4 n · 5 nw · 6 w · 7 sw`.
An earlier composition took rows 5/6/7 as `ne/e/se`, which face west, and
shipped the hero walking the wrong way; the row → facing table below is the
corrected one.

| Output facing | Source row | Cell rectangle of output column `c` |
|---|---:|---|
| `n` | 4 | `(32·src[c], 128, 32·src[c]+32, 160)` |
| `ne` | 3 | `(32·src[c], 96, 32·src[c]+32, 128)` |
| `e` | 2 | `(32·src[c], 64, 32·src[c]+32, 96)` |
| `se` | 1 | `(32·src[c], 32, 32·src[c]+32, 64)` |
| `s` | 0 | `(32·src[c], 0, 32·src[c]+32, 32)` |

Output columns are `0 idle · 1–3 walk · 4–6 attack · 7–8 hurt · 9–10 death`.
`src[c]` is the source column each output column is cut from; the warrior's
sword/hurt/death poses sit one column earlier than the other two sheets':

| Output file | Character | `src[0..10]` |
|---|---|---|
| `waica-iso-hero.png` | `Warrior-Blue.png` | 0, 1, 2, 3, 5, 6, 7, 19, 20, 22, 23 |
| `waica-iso-villager.png` | `Human-Worker-Red.png` | 0, 1, 2, 3, 6, 7, 8, 20, 21, 22, 23 |
| `waica-iso-orc.png` | `Orc-Grunt.png` | 0, 1, 2, 3, 6, 7, 8, 20, 21, 22, 23 |

The villager sheet carries the sword columns like the others but declares no
`attack-*` clips.

### Mirror check

The west rows are absent from the committed sheets and resolve through
runtime mirroring (`flipX`). The composition compared every used cell of
source rows 1/2/3 against the horizontal mirror of rows 7/6/5. They are
**not pixel-exact**: idle/walk poses differ by 1–5 pixels (a hand or a
strap), and the sword poses by 30–60 pixels because the sword stays in the
same hand on both sides. Mirroring the east art is therefore a stylistic
approximation, not a lossless substitute — acceptable for the demo, and the
reason the human protocol checks the mirrored directions by eye.

| Output file | Character | Output size |
|---|---|---:|
| `waica-iso-hero.png` | `Warrior-Blue.png` | 362×164 |
| `waica-iso-villager.png` | `Human-Worker-Red.png` | 362×164 |
| `waica-iso-orc.png` | `Orc-Grunt.png` | 362×164 |

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

Tall art remains a Sprite prop. To keep nearest-neighbour sampling on one
power-of-two texel-density family, the crate is reduced to 32×32 with nearest
sampling and the 30×22 rock is bottom-centred at `(1,10)` on a transparent
32×32 canvas. The tree remains native at 32 texels per render unit; characters
remain at the human-approved 16 texels per render unit.

| Output file | Source rectangle `(left, top, right, bottom)` | Output size |
|---|---|---:|
| `waica-iso-tree.png` | `(768,208,832,304)`, transparent bottom trimmed | 64×94 |
| `waica-iso-rock.png` | `(784,868,814,890)`, padded at `(1,10)` | 32×32 |
| `waica-iso-crate.png` | `(896,832,960,896)`, nearest-resized | 32×32 |
