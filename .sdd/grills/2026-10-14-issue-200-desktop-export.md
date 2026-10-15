# Grill — Desktop export: package a waica game with Electron and Steamworks
<!-- Estado: finalized. Proyecto: /home/chiche/workspace/waica. Fuente: issue #200. -->
<!-- SDD-Tracking: version=1; type=grill; state=finalized; issue=#200; grill=2026-10-14-issue-200-desktop-export; project=%2Fhome%2Fchiche%2Fworkspace%2Fwaica -->

## Hechos comprobados
- No existe comando build/export; el CLI tiene solo `waica` y `waica mcp` (`packages/cli/src/cli.ts:194`, `server.ts:14-42`).
- El `vite.config.ts` del template no fija `base` (dist usa `/assets/...`); `main.ts` carga `'/waica.params.json'` (`packages/editor/template/src/main.ts:121`), y si falla aplica defaults en silencio (`packages/engine/src/game.ts:444`).
- Rapier entra como chunk dinámico (`packages/engine/src/physics-3d/rapier-module.ts:36-38`); el render es WebGPU (`light-map.ts:67`), que pide contexto seguro.
- El engine no tiene quit, fullscreen, resolución configurable ni guardado de partida (grep `packages/*/src`). `game.stats` ya existe: son los stats del juego (`template/src/stats.json`: points, lives, health).
- `game.json` del template: `{ waicaGame, archetype, resolution: { mode, width, height }, pixelsPerUnit }`.
- El server del CLI es estático: solo GET/HEAD y `/__waica.json` (`packages/cli/src/server.ts:109-133`). El editor abre carpetas con `showDirectoryPicker` y no conoce la ruta en disco (`packages/editor/src/home/home-projects.ts:54`); exige File System Access (`Home.tsx:23`), o sea Chrome de escritorio.
- Componentes del editor a reusar: `EditorToolbar` (`packages/editor/src/editor/EditorToolbar.tsx:14`, selector "Scene to play" en :55), `EditorModals` (`EditorModals.tsx:15`).
- El MCP tiene 15 tools (`packages/mcp/src/server.ts:71-277`); ninguna edita `game.json`; `project_summary`/`validate_project` lo leen (`introspection.ts:297`).
- Lockstep: `packages/cli/src/package.test.ts:78-100` (9 dirs) y `scripts/test-dist.mjs:34-42` (7 paquetes) son listas hardcodeadas.
- CI: todo en `ubuntu-latest`, sin matriz de SO (`.github/workflows/*.yml`).
- Tiendas: Steam (SteamPipe) sube una carpeta por depot con launch option al ejecutable; exige apps de macOS notarizadas desde 2019 y no admite `app-sandbox`; conviene SteamCMD por los symlinks de `.app` (https://partner.steamgames.com/doc/store/application/platforms, https://wiki.gdevelop.io/gdevelop5/publishing/publish-to-steam/). itch.io butler acepta carpeta o zip por canal, tope 30 GB (https://itch.io/docs/butler/pushing). Epic BuildPatchTool sube una carpeta (guía de terceros).
- npm 2026-10-14: `steamworks.js` 0.4.0 (última publicación 2024-08-06), `electron` 44.7.2, `@electron/packager` 20.3.0.
- El repo `chichex/waica` es público; GitHub Actions es gratis en runners estándar para repos públicos, incluidos Windows y macOS (https://docs.github.com/en/billing/concepts/product-billing/github-actions).
- Host Linux: `wine` en `/usr/bin/wine`; sin Xvfb/xvfb-run ni display.

## Decisiones resueltas
### A. Alcance y superficie
1. Plataformas: Linux, Windows y macOS.
2. Superficie: CLI `waica export desktop [dir]` + botón en el editor que arma el mismo comando.
3. Salida: una carpeta por SO (ej. `mi-juego-linux-x64/`, `-win32-x64/`, `-darwin-arm64/`) + su `.zip`.
4. Empaquetado: `@electron/packager`.

### B. Runtime embebido
5. Servido: protocolo propio `app://` (`registerSchemesAsPrivileged` con `standard` y `secure`, `protocol.handle` sobre `dist/`); params sin cambios.
6. `game.json` gana `"desktop": { "fullscreen": false, "scale": 2 }` (opcionales): la ventana abre en `resolution` × `scale`, redimensionable.
7. Engine: `game.quit()` y `game.canQuit`; en web `quit()` es no-op y `canQuit === false`.
8. Metadata: nombre y versión del `package.json` del proyecto; ícono `src/art/icon.png` o default de waica; `--name`/`--icon` pisan.
9. Seam: el preload expone `window.waicaDesktop` por `contextBridge` (`contextIsolation` activo); el engine lo lee por un seam de plataforma reemplazable, como el de audio (ADR 0013); los tests usan un fake.
10. F11 y Alt+Enter alternan fullscreen, fijos, atendidos por el main.
11. Engine: `game.setFullscreen(on)` / `game.isFullscreen()`; en web, Fullscreen API del navegador.

### C. Steamworks
12. Opt-in: el export incluye `steamworks.js` si `game.json` tiene `desktop.steam` (`{ appId, achievements, stats }`); `--steam-app-id` pisa el id; `--no-steam` lo saca (ej. para itch.io).
13. Features: init, overlay (`electronEnableSteamOverlay`), achievements y stats. Sin rich presence ni Cloud.
14. API agnóstica de la tienda: `game.achievements.unlock(id)`, `setStat(id, n)`, `getStat(id)`, `available` (false en web o sin Steam, todo no-op).
15. Los ids se declaran en `desktop.steam.achievements` y `desktop.steam.stats`; `validate_project` emite el warning `unknown-achievement-id` por un id literal no declarado en `unlock`/`setStat`/`getStat`.

### D. Paquete, firma y distribución
16. Todo en `@waica/cli` (`src/export-desktop/`, main + preload + export), con `@electron/packager` como dependencia; sin paquete nuevo ni bootstrap de npm. `steamworks.js` se instala en el app staging solo con Steam.
17. Sin firma: builds sin firmar + guía documentada (macOS: codesign, notarytool, entitlements de Steam; Windows: firma del .exe). Human-only.
18. Versión de Electron exacta fijada en el CLI (44.7.2 hoy), actualizada por Dependabot.
19. Sin Wine, el build de Windows sale con el ícono default de Electron y un warning.
20. El comando corre el `vite build` del proyecto (con sus node_modules) en un directorio temporal; sin `node_modules` falla con diagnóstico ("corré npm install").
21. Salida por defecto `<proyecto>/export/`, que el template agrega a `.gitignore`; `--out <dir>` la cambia; un export reemplaza solo las carpetas de los SO que exporta.

### E. Verificación
22. Smoke `scripts/runtime-e2e-desktop.mjs` con `_electron.launch` de `playwright-core` sobre el binario empaquetado, con un proyecto platformer y otro third-person: el juego avanza frames, `app://` sirve params y Rapier, `canQuit === true`, `setFullscreen` cambia el estado, `achievements.available === false` sin Steam, `quit()` cierra el proceso. Headless o bajo xvfb.
23. CI: job `test:desktop` en `ci.yml`, matriz `ubuntu-latest`/`windows-latest`/`macos-latest`, en cada PR; cada runner exporta su SO y ejecuta el smoke; cache de los zips de Electron.
24. Chequeo estructural del cross-build de los 3 SO desde el host Linux: `.exe` con el ícono del juego (Wine), `.app` con `Info.plist` y nombre, `resources/app` con `dist/` y el preload.
25. Steam: unit tests del main y del seam con un `steamworks.js` falso (init, unlock, setStat, warning por id desconocido) + protocolo humano con el cliente de Steam y el app 480 (Spacewar): overlay con Shift+Tab y un achievement real.

### Diseño
26. Botón "Export desktop" en `EditorToolbar`, junto al selector "Scene to play".
27. Modal (patrón `EditorModals`): checkboxes Linux/Windows/macOS (los 3 por defecto), toggle de Steam visible solo si existe `desktop.steam` (prendido por defecto), comando armado en un campo de solo lectura con botón Copiar ("Copiado"), link a la guía de firma. El modal no ejecuta nada.
28. Si `navigator.clipboard` falla: aviso "No pude copiar: seleccioná y copiá con Ctrl+C"; el campo se selecciona al enfocarlo; Esc cierra y devuelve el foco al botón.
29. El bloque `desktop` no se edita en el editor; lo edita la tool MCP nueva `configure_desktop` (la 16): merge parcial, valida antes de escribir (scale > 0, appId entero, ids únicos), escribe solo `desktop`, conserva el resto de `game.json`, devuelve el bloque resultante; `steam: null` lo saca.
30. El MCP no ejecuta el export.

## Ramas pendientes
Ninguna.

## Diseño
- Superficie: `packages/editor` (React 19 + Vite), `con sistema` por la paleta de `packages/editor/src/styles.css`; sin UI kit, Storybook, mocks ni Claude Design.
- Pantallas y flujos: botón "Export desktop" en `EditorToolbar` → modal de export. Estados: inicial (comando con los 3 SO), cambio de opciones (comando se actualiza en vivo), copiado ("Copiado"), error de portapapeles (aviso con Ctrl+C). Sin estados de carga ni vacío: el modal no hace llamadas.
- Componentes: reusar `EditorToolbar` y el patrón de `EditorModals`; nuevo: el modal de export (ej. `ExportDesktopModal.tsx`).
- Dirección visual: no aplica (superficie con sistema); colores desde los tokens de `styles.css`, sin hex nuevos ni `style={{` (gates `diseño-hex-editor` ≤ 100 y `diseño-inline-editor` ≤ 3).
- Plataformas y accesibilidad: Chrome de escritorio (File System Access); botón y controles operables por teclado, Esc cierra y devuelve el foco; checkboxes y toggle con labels.
- Webview/celular: no aplica (el editor exige File System Access de escritorio).
- Capturas: no hay referencias renderizables ni adjuntas.

## Handoff
**Tema y alcance.** `waica export desktop` empaqueta un proyecto waica como app de Electron para Linux, Windows y macOS en el formato que piden Steam, itch.io y Epic (carpeta por SO + zip), con Steamworks opt-in, APIs de plataforma en el engine (`quit`/`canQuit`, `setFullscreen`/`isFullscreen`, `achievements`), un botón con modal en el editor que arma el comando y la tool MCP `configure_desktop` para el bloque `desktop` de `game.json`. Las 30 decisiones de arriba son el contrato.

**Restricciones y no-objetivos.** Sin instaladores (NSIS/dmg/AppImage), sin firma automática, sin auto-update, sin Steam Cloud ni rich presence, sin API de guardado, sin tool MCP de export, sin paquete npm nuevo (siguen 7 en lockstep). Rigen las políticas del contrato (max 950 líneas, lint-clean, tests-acompañan-src, naming, gates de diseño).

**Supuestos explícitos.**
- Bajo `app://` con `standard`, `/waica.params.json` resuelve contra `dist/` (se verifica en el smoke).
- `@electron/packager` descarga los zips de Electron por SO sin el paquete `electron` (usa `@electron/get`).
- `steamworks.js` 0.4.0 (napi-rs) carga en Electron 44 (fake en tests + prueba humana).
- Electron arranca headless (`--ozone-platform=headless`) o con `xvfb-run` en los runners.

**Riesgos y diferidos.**
- `steamworks.js` sin releases desde 2024-08: si no carga en Electron 44, Steam se rompe; queda opt-in y detrás del seam.
- WebGPU en runners sin GPU puede dar frame en blanco (#151): el smoke mira estado lógico, no píxeles.
- Reporte viejo de Electron que no corre en Steam Deck como non-Steam game: chequeo humano.
- La matriz de 3 SO suma minutos por PR (costo $0).
- Diferidos: instaladores, firma automática, edición del bloque `desktop` en el inspector, guardado de partida, Steam Cloud.

**Contexto para la spec.** ADR 0013 (seam de audio, modelo del seam de plataforma), ADR 0025 (backend de render), `packages/cli/src/server.ts` y `cli.ts`, `packages/mcp/src/server.ts` y `validation.ts`, `packages/editor/template/`, `EditorToolbar.tsx`/`EditorModals.tsx`, `.github/workflows/ci.yml`. Probable stack: engine (seam y APIs) → CLI export y shell `app://` → Steam → MCP `configure_desktop` y validación → editor (botón y modal) → CI matriz y smoke. Requiere un ADR nuevo (seam de plataforma y `app://`).
