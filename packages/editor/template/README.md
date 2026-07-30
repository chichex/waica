# My game 🐕

Made with [Waica](https://github.com/chichex/waica), the archetype-driven web game engine.

## Run

```bash
npm install
npm run dev
```

- **← →** move · **space** jump
- Parameter overrides live in `public/waica.params.json` — tweak them there to beat the component defaults.
- Your character is the placeholder dog: replace it in `src/main.ts` keeping the contract clips (`idle`, `run`, `jump`, `fall`).

## Export for the web

```bash
npm run build
```

The `dist/` folder is ready to upload to itch.io or any static hosting.
