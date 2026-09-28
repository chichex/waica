# @waica/lint

Private ESLint toolchain for the waica monorepo. It is never published and is
not part of the six-package release lockstep.

Run it from the repository root:

```sh
pnpm lint                                   # ESLint + SHOULD-warning ratchet
pnpm --filter @waica/lint lint -- --update-baseline   # rewrite lint-baseline.json
```

`pnpm lint` lints `packages/*/src`, `examples/*/src` and `scripts/`. It exits
non-zero on any ESLint error, or when a file's warning count for a rule grows
past `lint-baseline.json`. Lower the baseline after removing warnings; never
raise it to make a change pass.

## Why TypeScript 6.0 here

The repository builds and type-checks with TypeScript 7 (`tsc` 7.0.2), which
has no JavaScript compiler API. `typescript-eslint` needs that API and supports
`typescript >=4.8.4 <6.1.0`. This package therefore pins `typescript@6.0.3`
for ESLint's type-aware rules only; `pnpm typecheck` and `pnpm build` stay on
TypeScript 7. Drop the pin once `typescript-eslint` supports TypeScript 7.
ESLint stays on 9.x because `eslint-plugin-jsx-a11y` 6.10 supports ESLint up
to 9.

## Rule map

Every rule of `.sdd/coding-policies.md` whose gate names a lint rule maps to
the ESLint rule and severity below: MUST lines run at `error`, SHOULD lines at
`warn` under the ratchet. `Lnn` is the line in `.sdd/coding-policies.md`. The
representative file is where `packages/lint/src/config.test.ts` resolves the
config to check the severity.

| Policy | Level | ESLint rule | Severity | Representative file | Notes |
|---|---|---|---|---|---|
| L18 | SHOULD | `waica/soft-max-lines-per-function` | `warn` | `packages/engine/src/game.ts` | 40 logical lines; core rule under a second name |
| L23 | MUST | `max-lines-per-function` | `warn` | `packages/engine/src/game.ts` | 60 logical lines; `error` once the size refactors land |
| L25 | SHOULD | `complexity` | `warn` | `packages/engine/src/game.ts` | 10 |
| L26 | SHOULD | `max-depth` | `warn` | `packages/engine/src/game.ts` | 3 |
| L27 | SHOULD | `max-params` | `warn` | `packages/engine/src/game.ts` | 3 |
| L38 | SHOULD | `waica/soft-max-lines` | `warn` | `packages/engine/src/game.ts` | 300 logical lines |
| L40 | MUST | `max-lines` | `warn` | `packages/engine/src/game.ts` | 600 logical lines; `error` once the size refactors land |
| L64 | MUST | `@eslint-community/eslint-comments/require-description` | `error` | `packages/editor/src/editor/Viewport.tsx` | plus `reportUnusedDisableDirectives: "error"` |
| L97 | MUST | `@typescript-eslint/no-non-null-assertion` | `warn` | `packages/engine/src/game.ts` | `error` once assertions are replaced |
| L98 | MUST | `@typescript-eslint/no-explicit-any` | `error` | `packages/engine/src/game.ts` | |
| L98 | MUST | `@typescript-eslint/no-unsafe-assignment` | `warn` | `packages/engine/src/game.ts` | `error` once JSON is validated |
| L98 | MUST | `@typescript-eslint/no-unsafe-argument` | `warn` | `packages/engine/src/game.ts` | `error` once JSON is validated |
| L98 | MUST | `@typescript-eslint/no-unsafe-call` | `warn` | `packages/engine/src/game.ts` | `error` once JSON is validated |
| L98 | MUST | `@typescript-eslint/no-unsafe-member-access` | `warn` | `packages/engine/src/game.ts` | `error` once JSON is validated |
| L98 | MUST | `@typescript-eslint/no-unsafe-return` | `warn` | `packages/engine/src/game.ts` | `error` once JSON is validated |
| L99 | MUST | `no-restricted-syntax` | `warn` | `packages/engine/src/game.ts` | forbids `as unknown as` outside tests; `error` once the casts are named |
| L106 | MUST | `@typescript-eslint/switch-exhaustiveness-check` | `warn` | `packages/engine/src/game.ts` | a `default` does not count as exhaustive; `error` once the switches are fixed |
| L111 | MUST | `@typescript-eslint/no-unnecessary-type-parameters` | `warn` | `packages/engine/src/game.ts` | `error` once the generics are fixed |
| L112 | SHOULD | `@typescript-eslint/unified-signatures` | `warn` | `packages/engine/src/game.ts` | |
| L124 | MUST | `@typescript-eslint/no-floating-promises` | `error` | `packages/engine/src/game.ts` | `ignoreVoid: false` (L125) |
| L126 | MUST | `@typescript-eslint/no-misused-promises` | `error` | `packages/engine/src/game.ts` | |
| L132 | SHOULD | `@typescript-eslint/consistent-type-imports` | `warn` | `packages/engine/src/game.ts` | |
| L138 | SHOULD | `@typescript-eslint/require-await` | `warn` | `packages/engine/src/game.ts` | stands for every `recommendedTypeChecked` rule no policy line names |
| L140 | MUST | `@typescript-eslint/ban-ts-comment` | `error` | `packages/engine/src/game.ts` | `@ts-expect-error` allowed with a description |
| L183 | MUST | `react-hooks/purity` | `error` | `packages/editor/src/editor/Viewport.tsx` | |
| L183 | MUST | `react-hooks/refs` | `warn` | `packages/editor/src/editor/Viewport.tsx` | `error` once render stops writing refs |
| L184 | MUST | `react-hooks/immutability` | `warn` | `packages/editor/src/editor/Viewport.tsx` | `error` once the React fixes land |
| L186 | MUST | `react-hooks/rules-of-hooks` | `error` | `packages/editor/src/editor/Viewport.tsx` | |
| L187 | MUST | `react-hooks/set-state-in-effect` | `warn` | `packages/editor/src/editor/Viewport.tsx` | stands for the rest of the recommended preset; `error` once the React fixes land |
| L203 | MUST | `react-hooks/exhaustive-deps` | `warn` | `packages/editor/src/editor/Viewport.tsx` | `error` once the React fixes land |
| L210 | MUST | `react-hooks/static-components` | `error` | `packages/editor/src/editor/Viewport.tsx` | |
| L224 | MUST | `jsx-a11y/click-events-have-key-events` | `warn` | `packages/editor/src/editor/Inspector.tsx` | `error` once the controls are semantic |
| L224 | MUST | `jsx-a11y/no-static-element-interactions` | `warn` | `packages/editor/src/editor/Inspector.tsx` | `error` once the controls are semantic |
| L224 | MUST | `jsx-a11y/alt-text` | `error` | `packages/editor/src/editor/Inspector.tsx` | stands for the rest of the recommended preset |

Size and complexity rules are `warn` in test code (`*.test.ts(x)`,
`scripts/runtime-e2e.mjs`, `scripts/test-*.mjs`); type and promise rules keep
their production severity there. `scripts/**/*.mjs` get JavaScript rules only,
without type information.
