---
name: publish
description: Release a new version of the waica CLI (@chichex/waica) to npm — bumps the version, runs the verification ladder, ships the bump through a PR, then tags the release so GitHub Actions publishes it via npm trusted publishing (no token, no 2FA prompt), and verifies the published package end to end. Use whenever the user wants to publish, release or ship a new CLI version, bump the package version, or says things like "publicá", "sacá una versión", "release the CLI", "ship 0.3.0" — even when they only mention npm or a version number loosely.
---

# Publish a new waica CLI version

Releases `@chichex/waica` (packages/cli). The npm publish itself runs in CI:
pushing a `vX.Y.Z` tag triggers `.github/workflows/publish.yml`, which
publishes via npm trusted publishing (OIDC) — no npm login, no 2FA, no token.
The whole flow is yours; no step needs the human's terminal.

One-time prerequisite (already done; relevant only if publishes 404): the
npm package settings for `@chichex/waica` must list a Trusted Publisher for
GitHub Actions with repo `chichex/waica` and workflow `publish.yml`.

## 1. Preconditions

- On `main`, clean tree, synced (`git fetch origin && git status`). A release
  must never include unmerged or local-only state.
- Compare `packages/cli/package.json` version with the published one
  (`npm view @chichex/waica version`). They should match before bumping; if
  the local version is already ahead, a previous release half-finished
  (merged but never tagged/published) — skip to "Tag and watch" and release
  THAT version instead of bumping again.

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

## 4. Tag and watch

Never run `pnpm release`: it publishes every public package in the monorepo,
not just the CLI. Never tag an unmerged branch — the tag must point at the
merge commit on `main`.

```sh
git tag vX.Y.Z && git push origin vX.Y.Z
gh run watch --exit-status $(gh run list --workflow=publish.yml --limit 1 --json databaseId --jq '.[0].databaseId')
```

(If `gh run list` comes up empty, the run may not exist yet — retry after a
few seconds.) The workflow re-runs the ladder, builds fresh, checks the tag
matches the package version, and publishes.

Error decoder:

| Symptom | Meaning |
| --- | --- |
| `E404 Not Found - PUT …` from CI | NOT a missing package — the trusted publisher config on npmjs.com doesn't match this repo/workflow. Fix it in the package's Settings → Trusted Publisher. |
| `tag vX.Y.Z does not match packages/cli@…` | The tag was pushed on a commit whose package.json has a different version — usually a missing `git pull` after the merge. Delete the tag (`git push origin :refs/tags/vX.Y.Z`), sync, re-tag. |
| `403 … too similar to existing packages` | Only happens for NEW package names (it is why this package is scoped). Existing `@chichex/waica` publishes never hit it. |

If the workflow failed after a fixable cause, delete and re-push the tag to
re-trigger it — never re-run the job against a stale commit.

## 5. Verify like a real user

- `npm view @chichex/waica version dist-tags.latest` → both show the new
  version.
- Smoke from a scratch directory (never the repo):
  `npx -y @chichex/waica@latest --no-open --port 5401 &`, then
  `curl http://127.0.0.1:5401/__waica.json` → JSON reporting the new version.
- Clean up by port, not by the npx pid:
  `lsof -ti tcp:5401 | xargs kill`. Killing the npx wrapper orphans the
  actual server — one such orphan once survived for four days.

## 6. Report

Old → new version, PR link, workflow run link, and the verification evidence.
