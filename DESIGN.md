# Waica — Motor de juegos web guiado por arquetipos

> Estado: **borrador vivo**. Decisiones tomadas el 2026-07-18 en sesión de diseño inicial.
> Nombre: **Waica**, por la perra de la infancia de Ayrton — la perrita es la mascota natural del motor (logo).
> Handles verificados 2026-07-18: `waica` y `create-waica` libres en npm (scope `@waica` sin paquetes), org `waica` libre en GitHub, `waica.dev` / `.io` / `.games` sin registrar (`waica.org` tomado por un tercero ajeno al rubro).

## 1. Visión

Motor de videojuegos **open source (MIT)**, **web-first**, para juegos **2D y 3D**, centrado en la experiencia del usuario. No es un lienzo en blanco: es un motor **opinionado por arquetipos de juego** que te guía a construir lo que efectivamente necesitás, con salida limpia a código real (TypeScript) cuando querés salirte del riel.

Anti-objetivo explícito: **no** ser "Godot pero web". Godot optimiza para generalidad (cualquier juego posible) al costo de que todo requiere decisiones y la curva de entrada es enorme. Nosotros optimizamos el camino feliz de géneros concretos, con el capó abierto.

## 2. Tesis de producto: arquetipos

El flujo de creación define el producto:

1. Elegís **2D o 3D**.
2. Elegís el **arquetipo** (género + cámara): plataformero, top-down, isométrico, pantallas fijas, … (3D: tercera persona, primera persona, …).
3. Esa elección **configura todo**: modelo de movimiento, contrato de animaciones, física, cámara, input map, assets que el motor te pide, y hasta el vocabulario de la UI del editor.

Ejemplos del efecto en cascada:

- **Isométrico** → movimiento 8 direcciones → el motor te pide animaciones en 8 direcciones (y espeja NE→NO si falta el asset).
- **Top-down** → movimiento 4 direcciones → animaciones `idle/walk × N/S/E/O`, colisión por tiles, sin gravedad.
- **Plataformero** → izquierda/derecha con flip automático → clips `idle/run/jump/fall`, gravedad tuneada, cámara con deadzone y lookahead.
- **Pantallas fijas** → cámara con transición al borde (estilo Zelda NES).

Regla de oro anti-trampa: el arquetipo **no es un generador de boilerplate ni un fork del motor**. Es un **paquete declarativo vivo sobre el core genérico**. Si fuera un template que te vomita código, al primer cambio el usuario queda solo (el acantilado de RPG Maker). Como es configuración viva, ajustar un slider y reescribir el behavior son el mismo sistema.

Referencias del patrón: **GB Studio** (scene types que definen controles y física — prueba viva de que funciona, limitado a Game Boy), **RPG Maker** (el poder de un solo arquetipo y el techo de no tener salida a código).

## 3. Los tres niveles de usuario (sin acantilados)

1. **Riel**: seguís el arquetipo, ajustás parámetros con sliders, reemplazás placeholders por tu arte.
2. **Composición**: mezclás y configurás behaviors de la librería, agregás entidades propias.
3. **Código**: escribís tus behaviors en TypeScript (Monaco embebido, hot-reload).

El slider "jump height" del nivel 1 edita el mismo behavior TS que podrías reescribir en el nivel 3. Mismo proyecto siempre; nunca "exportar y no volver".

Bonus estratégico: los arquetipos dan **contexto semántico para agentes AI** ("esto es un plataformero; el player tiene estos behaviors") — "agregame doble salto" funciona mucho mejor con ese vocabulario. Proyecto en texto plano + API chica y tipada + CLI headless = el motor más cómodo para trabajar con AI. Ninguno de los grandes lo tiene como principio fundacional.

## 4. Anatomía de un arquetipo

Un arquetipo es un paquete (npm) declarativo que contiene:

- **Behaviors preconfigurados** con defaults de *game feel* curados (ej. plataformero: coyote time, jump buffering, curvas de aceleración — lo que un principiante no sabe que necesita).
- **Contrato de animaciones**: qué clips necesita cada personaje; el editor muestra los huecos ("te falta walk-NO") y aplica fallbacks (espejado automático).
- **Placeholders CC0** (ej. Kenney): el juego funciona desde el minuto cero; el usuario reemplaza pieza por pieza. Nunca hay pantalla vacía.
- **Input map por defecto** (WASD/flechas/gamepad ya mapeados).
- **Preset de física y cámara** del género.
- **Template de escena/proyecto** inicial.
- **Especialización de la UI del editor** (vocabulario, paneles, wizards con mini-demos animadas).

El formato es abierto para que la comunidad publique arquetipos propios (shoot 'em up, cartas roguelike, point & click, …).

Estrategia de lanzamiento: **2 arquetipos excelentes > 6 mediocres**. Cada arquetipo es game design curado, no solo código.

## 5. Mapa competitivo y hueco (julio 2026)

| Proyecto | Qué es | Su debilidad |
|---|---|---|
| Godot | Open source dominante, desktop-first | No web-native; curva de entrada enorme |
| GDevelop | Open source, editor web+desktop, no-code; desde 5.6 (dic 2025) con editor 3D real y física Jolt | Código = ciudadano de segunda; event-sheets first; 2 renderers (Pixi+three) |
| Construct 3 | La referencia de UX editor-en-browser | Cerrado, suscripción |
| PlayCanvas | Engine 3D MIT; frontend del editor abierto (jul 2025) | El editor depende de su backend SaaS |
| three.js / Babylon | Infraestructura de render | No son motores con editor |
| Phaser | 2D code-first popular | Sin 3D; editor aparte |
| GB Studio | Arquetipos bien hechos, MIT | Limitado a Game Boy |

**El cuadrante vacío que ocupamos**: code-first TS + editor que vive en el browser y es local-first (tus archivos, tu git, sin cuenta ni backend) + 2D/3D unificado + open source completo + **arquetipos opinionados como concepto de primera clase**.

## 6. Decisiones tomadas

| # | Decisión | Elección | Por qué |
|---|---|---|---|
| 1 | Estrategia de editor | Browser-first, local-first; empaquetable a desktop después | Hueco del mercado; "abrí un link y editá" |
| 2 | Base de render | three.js — WebGPU con fallback WebGL2, **un solo pipeline 2D+3D** | 2D = quads + cámara ortográfica (como Unity: Hollow Knight/Cuphead); evita mantener 2 renderers como GDevelop; luces/post/mezcla 2D+3D gratis; three es detalle de implementación detrás de la API del motor (reversible) |
| 3 | Scripting del usuario | TypeScript first-class + behaviors parametrizables | Cubre de principiante a pro; 80% del valor del visual scripting al 20% del costo; AI-friendly |
| 4 | Alcance inicial | Core unificado 2D+3D; primer pulido en 2D | Evita la reescritura "2D primero, 3D imposible después" |
| 5 | Tesis de producto | **Motor guiado por arquetipos** ("rieles con capó abierto") | Ver §2 |
| 6 | Modelo de objetos | Entity + Components (Unity-like) | Arquetipo = entidades con behaviors enchufados; mapea 1:1 al inspector; familiar |
| 7 | Licencia | MIT | Norma del nicho (three, Phaser, GB Studio); máxima adopción |
| 8 | Primer arquetipo | **Plataformero** | Género "mi primer juego"; assets baratos (2 dir + flip); donde el game feel más se luce |
| 9 | Forma del hito 1 | Juego + **inspector overlay** (no editor completo aún) | Valida la magia jugar-ajustar-guardar sin el costo del editor |
| 10 | Nombre | **Waica** | Corto, pronunciable en español e inglés, con historia real detrás y mascota incluida; handles npm/GitHub/dominios libres |

## 7. Stack técnico

- **Lenguaje**: TypeScript en todo (motor, editor, juegos de usuario).
- **Render**: three.js (WebGPU → WebGL2 automático). Sprites vía instancing/batching + atlas; pixel-perfect con NearestFilter y snapping; capas 2D con renderOrder; texto SDF (troika).
- **Física**: Rapier (Rust→WASM, Apache-2.0) — 2D y 3D con la misma API; character controller para el plataformero.
- **Audio**: Web Audio API con capa fina.
- **Dev**: Vite (dev server + HMR de behaviors); el overlay persiste cambios al disco vía plugin del dev server (File System Access API llega con el editor standalone).
- **Formato de proyecto**: JSON/texto plano, git-friendly, diffs limpios.
- **Export**: HTML = bundle estático. Steam/Epic = Electron + steamworks.js. Móvil (futuro) = Capacitor.
- **Repo**: monorepo pnpm + Vitest + Playwright; changesets para versionado.

Estructura objetivo del monorepo (el hito 1 puede arrancar con menos paquetes y dividir cuando duela):

```
packages/
  engine/            # core: loop, escena, Entity+Components, assets, input, audio
                     # + render (three) + physics (Rapier) — dividir después si crece
  behaviors/         # librería: PlatformerMovement, CameraFollow, Health, Spawner…
  archetype-platformer/  # el primer arquetipo (formato de arquetipo nace acá)
  overlay/           # inspector overlay in-game: edita behaviors en vivo + persiste
  create/            # create-waica: wizard de arquetipo (`npm create waica`)
  exporter-html/     # build estático
examples/            # incluye un smoke test 3D del core unificado
docs/                # docs vivas con ejemplos ejecutables
```

## 8. Hito 1 — "Plataformero de punta a punta" (definition of done)

1. `npm create waica` → wizard: nombre, arquetipo (plataformero; el resto "coming soon"), ¿pixel art? → proyecto generado.
2. `npm run dev` → en el browser: **plataformero jugable con placeholders CC0**: correr, saltar (coyote time + jump buffering), plataformas, monedas, un enemigo, muerte/respawn, un par de pantallas de nivel.
3. **Overlay** (tecla `~`): árbol de entidades + parámetros de behaviors editables en vivo (sliders) + **persistencia al proyecto** a través del dev server.
4. **Hot-reload** de behaviors TS del usuario.
5. `npm run build` → carpeta estática lista para itch.io / cualquier hosting.
6. `examples/` incluye una escena 3D mínima que usa el mismo core (smoke test del diseño unificado; no es feature de usuario todavía).

Fuera del hito 1 (explícito): edición visual de niveles (los niveles del template vienen como assets JSON; import de Tiled como puente para técnicos). La edición visual llega con el editor.

## 9. Roadmap

- **H1**: plataformero de punta a punta (§8).
- **H2**: editor web local-first — el juego como viewport, jerarquía, inspector real, edición de niveles/tilemaps, play-in-editor; File System Access API (fallback para Safari/Firefox).
- **H3**: segundo arquetipo (**top-down**) → fuerza a generalizar el formato de arquetipo (recién con dos ejemplos se sabe qué abstraer). Contrato de animaciones 4-dir con espejado.
- **H4**: export desktop (Electron + steamworks.js), librería de behaviors ampliada, tooling del contrato de animaciones.
- **H5**: primer arquetipo 3D (tercera persona), pipeline glTF, isométrico 8-dir.
- **Continuo**: docs vivas, templates, time-to-first-game < 5 min, comunidad de arquetipos.

Estrategia transversal: **cada capa útil por sí sola** (el framework sirve sin editor; el overlay sirve sin editor completo) y **dogfooding** — hacer juegos reales con el motor en cada hito.

## 10. Límites honestos / no-objetivos

- **Consolas**: Switch/PlayStation no tienen camino oficial para web-tech; Xbox es posible vía UWP/WebView2 con limitaciones. Prometemos: web, Steam, Epic, Itch, móvil. Consolas no.
- **Performance**: JS + WebGPU cubre ~95% de los juegos indie; AAA no es el target.
- **v1 no incluye**: visual scripting (evaluar post-editor), multiplayer, asset store.
- El editor completo es ~80% del esfuerzo total: por eso el orden runtime → overlay → editor.
- La adopción la ganan templates, docs y time-to-first-game — no el core técnico.

## 11. Pendientes

- [x] **Nombre del proyecto**: Waica (2026-07-18).
- [x] `git init` + repo público: `github.com/chichex/waica` (2026-07-18; migrar a la org `waica` cuando esté reservada).
- [x] Bootstrap del monorepo (2026-07-18): `engine` (loop, Entity+Components, input, Sprite, Solid), `behaviors` (`PlatformerMovement` con coyote/buffer/jump-cut/squash, `CameraFollow`), `archetype-platformer`, `overlay` (inspector in-game con persistencia; round-trip verificado con browser real).
- [ ] **Publicar a npm** (solo Ayrton): crear la org `@waica` en npmjs + `npm login` + `pnpm release` (buildea y publica los 5 paquetes reales, ya no placeholders). Después: org `waica` en GitHub y registrar `waica.dev` (opcional `.io`/`.games`).
- [x] Contrato de animaciones v0 (2026-07-18): `AnimationContract` + `resolveClip`/`missingClips` con fallbacks, `AnimatedSprite` (spritesheet en grilla, pixel-perfect), `PlatformerAnimator` (estado→clip) y el spritesheet placeholder de la mascota generado por script (`scripts/generate-dog-sheet.mjs`). Vitest en marcha (14 tests). Verificado e2e con browser: ciclo idle→jump→fall→idle y flip automático.
- [x] Gameplay del arquetipo completo (2026-07-18): sistema de triggers (`Hitbox` + hook `onCollide` en el core), behaviors `Collectible`/`Patrol`/`Hazard` (stomp Mario-style)/`Respawnable`, nivel con pozo, monedas y slimes (sprites generados por script), HUD de monedas. 22 tests unitarios; verificado e2e: recoger, daño lateral→respawn, stomp y muerte por caída.
- [x] Wizard `create-waica` (2026-07-18): CLI con @clack/prompts (pelado = interactivo; `create-waica <dir>` = power-user), template completo, y los paquetes convertidos a **publicables** (build tsc a dist/ + d.ts, exports duales dev/publish vía publishConfig, v0.1.0). Verificado e2e con tarballs de `pnpm pack`: el proyecto generado instala, typechequea, buildea y corre con overlay. Pendiente manual: completar el flujo interactivo una vez en un terminal real (el render está verificado; expect no pudo automatizar clack).
- [x] **Editor v0 — H2 arrancado** (2026-07-18, prioridad redefinida por Ayrton: la app primero): escenas serializadas a JSON (`loadScene` + registry en el engine; `src/scenes/main.scene.json` como fuente de verdad de cada proyecto), y la app `@waica/editor` (React + Monaco): crear proyecto en carpeta real (File System Access) / abrir / demo en memoria, árbol de archivos, jerarquía de entidades, viewport con selección + drag + pan + zoom + gizmo, paleta arrastrable, inspector completo (props, agregar/quitar componentes, renombrar, eliminar), play-in-editor con Stop que restaura, autosave y editor de código Monaco. Verificado e2e con browser: drag persiste al JSON, drop crea entidades, play recoge la moneda creada (🪙 1), Monaco muestra el JSON actualizado. Pendiente de prueba manual: flujo con carpetas reales (picker no automatizable headless).
- [ ] **Editor siguiente**: hot-reload de behaviors TS del usuario en el viewport (esbuild-wasm), assets del usuario (PNG de la carpeta como texturas), export HTML desde el editor, undo/redo, multiselección.
- [ ] **Hito 1 restante**: props reactivas de Sprite; smoke test 3D del core unificado; migración a WebGPURenderer con fallback.
- [ ] Definir formato v0 del manifest de arquetipo (nace con `archetype-platformer`, se generaliza en H3).
- [ ] Elegir set de placeholders CC0 (candidato: Kenney) y convención de nombres del contrato de animaciones.
