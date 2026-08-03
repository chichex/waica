---
name: publish
description: Release a new version of the waica CLI (@chichex/waica) to npm — bumps the version, runs the verification ladder, ships the bump through a PR, rebuilds fresh on main, hands the 2FA-gated publish command to the human, and verifies the published package end to end. Use whenever the user wants to publish, release or ship a new CLI version, bump the package version, or says things like "publicá", "sacá una versión", "release the CLI", "ship 0.3.0" — even when they only mention npm or a version number loosely.
---

# Publish a new waica CLI version

Releases `@chichex/waica` (packages/cli). One step — the npm publish itself —
is gated by 2FA only the human can complete; everything around it is yours.

## 1. Preconditions

- On `main`, clean tree, synced (`git fetch origin && git status`). A release
  must never include unmerged or local-only state.
- Compare `packages/cli/package.json` version with the published one
  (`npm view @chichex/waica version`). They should match before bumping; if
  the local version is already ahead, a previous release half-finished
  (merged but never published) — skip to "Fresh build" and release THAT
  version instead of bumping again.

## 2. Pick the version

Argument: `patch` | `minor` | `major` | an explicit `x.y.z`. Invoked bare,
ask which one. Bump only `packages/cli/package.json` — the other packages are
unpublished and their versions are not coupled to the CLI's.

## 3. Ladder, then PR

The contract (`.sdd/project.md`) requires the full local ladder before any PR
and forbids pushing to `main` directly:

1. `pnpm typecheck && pnpm test && pnpm build` — all green or stop.
2. Branch `release-cli-vX.Y.Z`, commit the bump, push,
   `gh pr create`, `gh pr merge --merge --delete-branch`, `git pull`.

## 4. Fresh build on main

```sh
pnpm --filter @waica/editor build && pnpm --filter @chichex/waica build
```

Order matters: the CLI build copies the editor's `dist` into its own
`dist/editor` — a stale editor build ships a stale editor.

## 5. The publish — human-gated

Never run `pnpm release`: it publishes every public package in the monorepo,
not just the CLI. Never publish from an unmerged branch.

Check `npm whoami` first:

- `E401` / `ENEEDAUTH` → have the user run `! npm login` (browser flow), then
  re-check.
- Authenticated → have the user run:
  `! pnpm --filter @chichex/waica publish --access public`
  This cannot run from your shell: npm's 2FA needs an interactive terminal
  and fails with `ERR_PNPM_OTP_NON_INTERACTIVE` otherwise.

Error decoder (all encountered in practice):

| Symptom | Meaning |
| --- | --- |
| `E404 Not Found - PUT …` | NOT a missing package — npm hides packages from unauthorized tokens. The session expired days ago; re-login. |
| `ERR_PNPM_OTP_NON_INTERACTIVE` | Publish ran non-interactively; the user must run it with the `!` prefix or in their own terminal. |
| `403 … too similar to existing packages` | Only happens for NEW package names (it is why this package is scoped). Existing `@chichex/waica` publishes never hit it. |

## 6. Verify like a real user

- `npm view @chichex/waica version dist-tags.latest` → both show the new
  version.
- Smoke from a scratch directory (never the repo):
  `npx -y @chichex/waica@latest --no-open --port 5401 &`, then
  `curl http://127.0.0.1:5401/__waica.json` → JSON reporting the new version.
- Clean up by port, not by the npx pid:
  `lsof -ti tcp:5401 | xargs kill`. Killing the npx wrapper orphans the
  actual server — one such orphan once survived for four days.

## 7. Report

Old → new version, PR link, publish output, and the verification evidence.
