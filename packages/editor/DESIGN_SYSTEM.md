# Editor design system

The editor's look, written down. It was always in `src/styles.css`; this file names
its parts and gives the reason for each. The source of truth is the `:root` block at
the top of [`src/styles.css`](./src/styles.css): every color, type, spacing, corner,
elevation and motion value the editor draws with is a custom property there, and the
rules below it only reference them.

The editor is a dense, dark tool UI that sits around a game canvas. Three ideas
shape every choice:

1. **The game is the brightest thing on screen.** Chrome is near-black blue-grey,
   text is soft white, and color is spent on meaning, never decoration.
2. **Color says what you are editing and how far an edit reaches.** Amber is the
   scene and its instances, violet is a prefab (every instance changes), green is a
   UI piece. The same three hues mark the breadcrumb, the stage frame and the
   Inspector's context banner, so the answer is visible wherever you look.
3. **Small, legible, keyboard-friendly.** Most UI text is 11–13 px in the system
   font, controls are compact, and uppercase labels get extra tracking to stay
   readable at 11 px.

## Color

### Base palette

| Token | Value | Use and reason |
|---|---|---|
| `--bg` | `#101018` | The page behind everything. |
| `--bg-panel` | `#14141f` | Panels, cards, modals: one step up from the page. |
| `--bg-panel-2` | `#1d1d2b` | Raised surfaces inside a panel: breadcrumb bar, context banner, menus, picker cards. Also the light square of the transparency checker. |
| `--line` | `#26263a` | Every 1 px border and divider. One line color keeps the grid calm. |
| `--text` | `#e8e8f0` | Primary text. Not pure white, so it does not glare on the dark chrome. |
| `--text-dim` | `#9a9ab0` | Labels, hints, section heads, secondary metadata. |
| `--accent` | `#ffb703` | Amber: primary actions (Play, primary buttons), focus and selection outlines, and the scene/instance context. |
| `--accent-2` | `#8ecae6` | Sky blue: hover outlines on secondary controls, component and role heads, the demo chip and the export modal's copy and guide links. Information and secondary actions, never the primary one. |
| `--gold` | `#ffd166` | Text on amber-tinted fills (selected rows, warning cards), where `--accent` would vibrate. |
| `--danger` | `#e63946` | Destructive actions and errors. |
| `--ctx-prefab` | `#8d79f0` | Violet: editing a prefab, whose changes reach every instance. |
| `--ctx-ui` | `#06d6a0` | Green: editing a UI piece. |

### Derived colors

Tints are the palette hues at low alpha, so a fill always reads as "a little of that
meaning" over whatever surface it sits on.

| Token | Value | Use |
|---|---|---|
| `--bg-field` | `#0e0e16` | Inputs, selects and read-only values: darker than the panel, so fields read as wells. |
| `--bg-stage` | `#1a1a2e` | The center stage and the UI preview behind the game, a blue that separates the canvas from the chrome. |
| `--bg-overlay` | `rgba(20, 20, 31, 0.85)` | Viewport tool buttons and inputs that float over the canvas. |
| `--bg-inset` | `#00000055` | The inline rename field in the Explorer. |
| `--bg-label` | `#000a` | Labels drawn over tile thumbnails. |
| `--checker-dark` | `#16161f` | Dark square of the transparency checker behind art. |
| `--scrim` | `rgba(6, 6, 12, 0.72)` | Behind editor modals. |
| `--scrim-strong` | `#05050bcc` | Behind the archetype picker, which replaces the whole home screen. |
| `--hover-tint` | `#ffffff0d` | Hover on rows, crumbs and menu items. |
| `--badge-tint` | `#ffffff12` | A neutral badge fill (the context badge before a context colors it). |
| `--cell-line`, `--cell-text` | `rgba(255, 255, 255, 0.18)`, `rgba(255, 255, 255, 0.45)` | Grid cells over a sprite sheet: visible on any art. |
| `--text-on-accent` | `#14141f` | Text on an amber button. Dark on amber passes contrast; white would not. |
| `--ok` | `#06d6a0` | A clip that resolved. Same hex as `--ctx-ui`, a different meaning, so a different token. |
| `--accent-tint-faint` | `#ffb70311` | A panel that accepts a drop. |
| `--accent-tint` | `#ffb70322` | Selection: the selected Explorer row, the scene context badge, the archetype chip. |
| `--accent-edge` | `#ffb70355` | The breadcrumb underline in scene context. |
| `--accent-marquee` | `rgba(255, 183, 3, 0.08)` | The viewport's marquee selection. |
| `--accent-warn-bg`, `--accent-warn-line` | `rgba(255, 183, 3, 0.09)`, `rgba(255, 183, 3, 0.5)` | Playability warning cards: a card that asks to be seen without being an error. |
| `--accent-cell-hover`, `--accent-cell-on`, `--accent-cell-drawing` | `rgba(255, 183, 3, 0.18)`, `0.28`, `0.12` | Sprite sheet cells: hover, picked, and the rect being drawn. |
| `--accent-2-tint` | `#8ecae622` | The demo chip. |
| `--ctx-prefab-tint`, `--ctx-prefab-frame`, `--ctx-prefab-edge` | `#8d79f022`, `#8d79f055`, `#8d79f0aa` | Prefab context: badge and chip fill, the stage's inner frame, the breadcrumb underline. |
| `--ctx-ui-tint`, `--ctx-ui-edge` | `#06d6a022`, `#06d6a066` | UI context: badge fill and breadcrumb underline. |
| `--danger-tint`, `--danger-line` | `#e6394611`, `#e6394655` | Destructive hover fill and the danger button's outline. |

## Typography

| Token | Value | Use |
|---|---|---|
| `--font-sans` | `system-ui, -apple-system, sans-serif` | All UI text. The platform font renders crisply at small sizes and needs no download. |
| `--font-mono` | `ui-monospace, monospace` | Code paths, the crash message, the export command. |
| `--font-mono-code` | `ui-monospace, SFMono-Regular, Menlo, monospace` | The prefab reference chip, with explicit fallbacks for older systems. |
| `--leading` | `1.45` | Body line height, set once on the root. |
| `--leading-snug` | `1.35` | Multi-line notes inside the Inspector. |
| `--weight-regular`, `--weight-semibold`, `--weight-bold` | `400`, `600`, `700` | Bold carries headings, names and buttons; semibold marks the current breadcrumb and emphasis inside metadata; regular resets a hint inside a bold head. |

Sizes are a scale named by their pixel value (`--font-size-12` is 12 px), because the
editor uses exact half steps and the name should not hide them:

| Step | Role |
|---|---|
| `--font-size-8`, `-9` | Glyphs inside tiny controls: a cell's delete cross, Explorer flags, tile labels. |
| `--font-size-10` | Badges, chips, counts, carets, the uppercase group heads. |
| `--font-size-11` | Uppercase panel and section heads (with `--tracking-label-wide` or `--tracking-label`). |
| `--font-size-11-5` | The Inspector context banner's scope line. |
| `--font-size-12` | The default for controls, hints, cards and modal heads: the most used size. |
| `--font-size-12-5` | The breadcrumb, nested Explorer rows and the multi-selection list. |
| `--font-size-13` | Rows you act on: Explorer items, Inspector rows, menu items. |
| `--font-size-14` | The root size, the home list heading and viewport tool glyphs. |
| `--font-size-15`, `-16` | The new-project name field and the home tagline. |
| `--font-size-18`, `-22`, `-26`, `-40` | The crash title, picker and home card icons, and the home title. |

Uppercase labels get tracking so 10–11 px capitals do not clump:
`--tracking-label-wide` (`0.08em`, panel and group heads), `--tracking-label` (`0.06em`,
section, component and role heads), `--tracking-badge` (`0.05em`) and
`--tracking-title` (`0.04em`, modal heads).

## Corners

Named by pixel value, like the type scale. Small radii go on small things:

| Step | Role |
|---|---|
| `--radius-3` to `--radius-5` | Tiny controls: tile labels, the inline rename field, reset buttons. |
| `--radius-6` | Inputs, selects, buttons, menu items: the default control corner. |
| `--radius-7`, `--radius-8` | Explorer rows; cards, the Play button, the context banner, warning cards. |
| `--radius-9`, `--radius-10` | Picker fields; the context menu, component cards, role options and home list items. |
| `--radius-12` | Modals and picker cards. |
| `--radius-14`, `--radius-16` | Home cards and the archetype picker sheet: the largest surfaces. |
| `--radius-99`, `--radius-pill` | Pills: chips and badges (`99px` and `999px` render the same on these heights; both kept so no corner changed). |
| `--radius-circle` | Dots and round buttons. |

## Elevation and motion

The UI is flat; only things that float above the page cast a shadow.

| Token | Value | Use |
|---|---|---|
| `--shadow-modal` | `0 18px 60px rgba(0, 0, 0, 0.55)` | Modals. |
| `--shadow-menu` | `0 12px 32px #00000073` | The context menu. |
| `--shadow-cell-text` | `0 1px 2px rgba(0, 0, 0, 0.8)` | Cell numbers over sprite art. |
| `--z-sticky` (1) | | Sticky panel heads over their scrolling rows. |
| `--z-picker` (10) | | The archetype picker over the home screen. |
| `--z-marquee` (40) | | The marquee over the viewport. |
| `--z-menu` (100) | | The context menu's backdrop and menu. |
| `--z-modal` (10000) | | Editor modals, above everything. |
| `--duration-fast` | `0.15s` | Hover lifts and border changes on cards; the Explorer subtree fade. |

## Spacing

`padding`, `margin` and `gap` read a `--space-N` token, named by its pixel value like the
type and corner scales: `--space-1` through `--space-10`, then `12`, `14`, `16`, `18`,
`20`, `22`, `24`, `26`, `28`, `36`, `44` and `48`.

| Steps | Role |
|---|---|
| `--space-4`, `--space-6`, `--space-8` | The default gaps and paddings between and inside controls: the most used. |
| `--space-10`, `--space-12`, `--space-14` | Panel, card and modal padding. |
| `--space-1`, `--space-2`, `--space-3`, `--space-5`, `--space-7`, `--space-9` | Half steps and odd values that align small glyphs optically. |
| `--space-16` to `--space-24` | Button and card padding (`16`, `18`, `20`), the picker, the project pane and backdrops (`24`), the room for a select's arrow (`22`). |
| `--space-26` | The role list nested under its card. |
| `--space-28`, `--space-44` | Explorer indentation: a nested row, and a row inside a folder. |
| `--space-36`, `--space-48` | The home screen only. |

Three spacing values stay literal on purpose: `calc(100% - 110px)` lines Inspector
diagnostics up with the 110 px label column (a layout width), `-2px` pulls the role list
up against its header (an optical nudge), and `9vh` / `12vh` place the home and crash
screens relative to the window.

## Pieces

There is no component library: each piece is a class family in `styles.css`, next to
the feature that renders it. The main ones:

- **Shell**: the top bar (brand, scene select, Export desktop, Play, save state),
  the Explorer on the left, the center stage, the Inspector on the right.
- **Panel head** (`.ed-panel-head`): 11 px bold uppercase with wide tracking on
  `--bg-panel`, sticky over its rows.
- **Explorer row** (`.ed-x-item`): 13 px, `--radius-7`; hover `--hover-tint`;
  selected `--accent-tint` with `--gold` text.
- **Breadcrumb** (`.ed-crumbs`): 12.5 px on `--bg-panel-2`, underlined by the context
  edge color (`--accent-edge`, `--ctx-prefab-edge`, `--ctx-ui-edge`).
- **Stage** (`.ed-stage`, `.ed-center`): `--bg-stage`; a prefab draws a 2 px
  `--ctx-prefab-frame` inside its edge so it never reads as the scene.
- **Inspector context banner** (`.ed-ins-ctx`): a `--bg-panel-2` card with a 3 px left
  rule and a pill badge tinted by context: what you are editing and how far changes
  reach.
- **Inspector row** (`.ed-row`): label and control, 13 px; fields on `--bg-field`
  with a `--line` border and `--radius-6`. Native selects are redrawn because they
  render washed out on dark backgrounds.
- **Section and component heads** (`.ed-sec-head`, `.ed-comp-head`): 11 px bold
  uppercase; component heads in `--accent-2`.
- **Buttons**: primary (`.ed-primary`, `.ed-play`) is amber with
  `--text-on-accent`; danger (`.ed-danger`) is an outline in `--danger-line` with
  `--danger` text and a `--danger-tint` hover; the rest are quiet bordered buttons.
- **Warning card** (`.ed-warn-card`): amber outline and fill with `--gold` text.
- **Viewport tools** (`.ed-vp-tools`): small buttons on `--bg-overlay` floating over
  the canvas.
- **Context menu** (`.ed-ctx`): `--bg-panel-2`, `--radius-10`, `--shadow-menu`.
- **Modal** (`.ed-modal`): `--bg-panel`, `--radius-12`, `--shadow-modal` over `--scrim`.
- **Home and archetype picker** (`.home-*`, `.picker-*`): the only large type and
  radii; cards lift on hover with `--duration-fast`.

## Rules

- Draw with a token. A new color, size, corner, shadow, layer or duration gets a token
  in `:root` with a name that says what it is for, and a line in this file.
- A tint of a palette hue is a derived token next to its hue, not a new hex in a rule.
- Keep the three context hues for context. Amber also means "primary"; violet and
  green mean nothing else.
- Left as literals on purpose: resets (`0`, `normal`, `auto`), `line-height: 1` on glyph
  buttons and `16px` on the reset button (they size a box, not text), layout
  dimensions (widths, heights, offsets), and the three spacing values above.
- The `#ffffff` values in `SceneLightingOptions.tsx` are scene data defaults (a light's
  color), not editor styling.
- Two generation gates watch the `.tsx` files: hex colors outside the tokens and inline
  `style={{`. The hex gate is a plain `#rgb`/`#rrggbb` grep, so issue references such as
  `#173` in comments count toward it.
