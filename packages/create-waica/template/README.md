# Mi juego 🐕

Hecho con [Waica](https://github.com/chichex/waica), el motor de juegos web guiado por arquetipos.

## Correr

```bash
npm install
npm run dev
```

- **← →** moverte · **espacio** saltar · **~** abre el inspector
- Lo que ajustes en el inspector se guarda en `public/waica.params.json` — lo que tuneás jugando es lo que exportás.
- Tu personaje es la perrita placeholder: reemplazala en `src/main.ts` manteniendo los clips del contrato (`idle`, `run`, `jump`, `fall`).

## Exportar para la web

```bash
npm run build
```

La carpeta `dist/` queda lista para subir a itch.io o cualquier hosting estático.
