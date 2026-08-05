---
name: publish
description: Release a new version of the waica CLI (@chichex/waica) to npm — the one package that ships both the editor and the MCP server. Bumps the version, runs the verification ladder, ships the bump through a PR, then tags the release so GitHub Actions publishes it via npm trusted publishing (no token, no 2FA prompt), and verifies the published package end to end. Use whenever the user wants to publish, release or ship a new CLI version, bump the package version, or says things like "publicá", "sacá una versión", "release the CLI", "ship 0.3.0" — even when they only mention npm or a version number loosely.
---

# Publish a new waica CLI version

Releases `@chichex/waica` (packages/cli) — the only published package. It
bundles the pre-built editor (`dist/editor`), the MCP server (`dist/mcp`) and
the `@waica` libraries that server introspects, so a release ships both
`waica` and `waica mcp`. The npm publish itself runs in CI: pushing a `vX.Y.Z`
tag triggers `.github/workflows/publish.yml`, which publishes via npm trusted
publishing (OIDC) — no npm login, no 2FA, no token. The whole flow is yours;
no step needs the human's terminal.

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
ask which one. Bump only `packages/cli/package.json` — every other package is
unpublished (`@waica/mcp` is `private`; the libraries are simply never
released) and their versions are not coupled to the CLI's. A change that only
touches the MCP server or the engine still ships as a CLI version bump.

## 3. Ladder, then PR

The contract (`.sdd/project.md`) requires the full local ladder before any PR
and forbids pushing to `main` directly:

1. `pnpm typecheck && pnpm test && pnpm test:dist` — all green or stop.
   `test:dist` builds from clean dists and is the only rung that proves the
   packed CLI still starts `waica mcp` over real stdio with its vendored
   `@waica` copies; a plain `pnpm build` does not.
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
- Editor smoke, from a scratch directory (never the repo):
  `npx -y @chichex/waica@latest --no-open --port 5401 &`, then
  `curl http://127.0.0.1:5401/__waica.json` → JSON reporting the new version.
- Clean up by port, not by the npx pid:
  `lsof -ti tcp:5401 | xargs kill`. Killing the npx wrapper orphans the
  actual server — one such orphan once survived for four days.
- MCP smoke, same scratch directory. This handshake needs no MCP SDK, and it
  also proves nothing pollutes stdout — any stray banner breaks the parse:

  ```sh
  printf '%s\n' \
    '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"1.0.0"}}}' \
    '{"jsonrpc":"2.0","method":"notifications/initialized"}' \
    '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}' \
    | npx -y @chichex/waica@latest mcp 2>/dev/null | head -2
  ```

  Expect two JSON-RPC replies: `serverInfo` for id 1, and nine tools for id 2.
  A published CLI missing its bundled server answers on stderr instead
  (`bundled MCP server is missing`) and prints nothing here.

## 6. Report

Old → new version, PR link, workflow run link, and the verification evidence.
