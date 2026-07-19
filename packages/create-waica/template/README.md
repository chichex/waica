# My game 🐕

Made with [Waica](https://github.com/chichex/waica), the archetype-driven web game engine.

## Run

```bash
npm install
npm run dev
```

- **← →** move · **space** jump · **~** opens the inspector
- Whatever you tweak in the inspector is saved to `public/waica.params.json` — what you tune while playing is what you export.
- Your character is the placeholder dog: replace it in `src/main.ts` keeping the contract clips (`idle`, `run`, `jump`, `fall`).

## Export for the web

```bash
npm run build
```

The `dist/` folder is ready to upload to itch.io or any static hosting.
