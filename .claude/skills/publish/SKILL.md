---
name: publish
description: Release a new waica version to npm — the CLI (@chichex/waica) plus the three @waica libraries, which ship together on one version number. Bumps all four, runs the verification ladder, ships the bump through a PR, then tags the release so GitHub Actions publishes it via npm trusted publishing (no token, no 2FA prompt), and verifies the published packages end to end. Use whenever the user wants to publish, release or ship a new version, bump the package version, or says things like "publicá", "sacá una versión", "release the CLI", "ship 0.3.0" — even when they only mention npm or a version number loosely.
---

# Publish a new waica version

Releases four packages on one version number: `@chichex/waica` (packages/cli)
and the three libraries a generated project installs — `@waica/engine`,
`@waica/behaviors`, `@waica/archetype-platformer`. The CLI bundles the
pre-built editor (`dist/editor`), the MCP server (`dist/mcp`) and vendored
copies of those same libraries, so a release ships `waica`, `waica mcp`, and
the packages `npm install` resolves inside a project the editor generated.

**They move in lockstep — one number, one tag, always all four.** A generated
project depends on `^<that version>`, and the CLI's vendored copies claim it
too; publishing a subset puts a CLI on npm that disagrees with the registry.
`packages/cli/src/package.test.ts` fails if the four versions ever diverge.

The npm publish itself runs in CI: pushing a `vX.Y.Z` tag triggers
`.github/workflows/publish.yml`, which publishes via npm trusted publishing
(OIDC) — no npm login, no 2FA, no token. The whole flow is yours; no step
needs the human's terminal.

One-time prerequisite (relevant if publishes 404): **each** of the four
packages must list a Trusted Publisher on npmjs.com for GitHub Actions with
repo `chichex/waica` and workflow `publish.yml`. This is configured per
package, not per scope — a new library added to the release needs its own.

## 0. Bootstrapping a package that has never been published

Skip this unless a package in the release set has no npm page yet. A Trusted
Publisher is configured on a package's settings page, which does not exist
until the package does — so the very first version of a brand-new package
goes out by hand, from the human's terminal, with their 2FA. Only they can do
it; this is the one step of the flow that is not yours.

Publish it at **the version already on `main`**, not the one being released.
Burning the current number on the bootstrap keeps the next release clean: CI
refuses to publish over an existing version, so a library hand-published at
the release version would abort the workflow before it reaches the CLI.

Hand it to the human as a block to run, in dependency order:

```sh
for dir in engine behaviors archetype-platformer; do
  (cd "packages/$dir" && pnpm publish --access public --no-git-checks)
done
```

`pnpm publish` — not `npm publish` — because it rewrites `workspace:^` and
applies `publishConfig` on its own, leaving the checkout untouched. It prompts
for the OTP per package.

Then they configure the Trusted Publisher on each new package's npm settings
page (repo `chichex/waica`, workflow `publish.yml`). From the next release on,
every package goes out through CI and nobody touches a token again.

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
ask which one. Bump all four published packages to the same number, even the
ones nothing touched — that is what lockstep means:

```sh
for dir in cli engine behaviors archetype-platformer; do
  (cd "packages/$dir" && npm version X.Y.Z --no-git-tag-version)
done
```

`@waica/editor` and `@waica/mcp` are `private` and ship inside the CLI; leave
their versions alone. Nothing else needs editing: the generated project's
`@waica/*` range is read from `packages/engine/package.json` at build time,
not written down anywhere.

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
matches the package version, lowers the libraries' manifests with
`scripts/prepare-publish.mjs`, and publishes the three libraries before the
CLI — in that order, so the CLI never lands pointing at versions npm does not
have yet.

Error decoder:

| Symptom | Meaning |
| --- | --- |
| `E404 Not Found - PUT …` from CI | NOT a missing package — the trusted publisher config on npmjs.com doesn't match this repo/workflow. Check WHICH package the failing step was publishing; each of the four is configured separately. |
| `tag vX.Y.Z does not match packages/cli@…` | The tag was pushed on a commit whose package.json has a different version — usually a missing `git pull` after the merge. Delete the tag (`git push origin :refs/tags/vX.Y.Z`), sync, re-tag. |
| `403 … too similar to existing packages` | Only happens for NEW package names (it is why the CLI is scoped). Existing publishes never hit it. |
| `You cannot publish over the previously published versions` | A previous run published part of the set. npm never takes a version twice, so this one is unrecoverable at that number: bump the patch on all four, re-run the flow from step 2, and release the new number. |

If the workflow failed **before any publish succeeded**, delete and re-push
the tag to re-trigger it — never re-run the job against a stale commit. If it
failed **after** one package went out, do not retry the tag; bump and re-release.

## 5. Verify like a real user

- All four on the registry at the new version:

  ```sh
  for pkg in @chichex/waica @waica/engine @waica/behaviors @waica/archetype-platformer; do
    echo "$pkg $(npm view "$pkg" version)"
  done
  ```
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

- **The one that matters: a generated project installs from npm.** This is the
  whole point of publishing the libraries, and nothing before this step proves
  it — the local ladder always resolves `@waica/*` from the workspace. Do it in
  a scratch directory, never the repo (a project inside the repo would resolve
  through the workspace and pass while npm is broken):

  ```sh
  cd "$(mktemp -d)" && npx -y @chichex/waica@latest mcp <<'EOF' >/dev/null
  {"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"1.0.0"}}}
  {"jsonrpc":"2.0","method":"notifications/initialized"}
  {"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"create_project","arguments":{"project_path":"REPLACE_WITH_ABSOLUTE_PATH/smoke-game"}}}
  EOF
  cd smoke-game && npm install && npm run build
  ```

  `npm install` resolving all three `@waica/*` packages is the acceptance
  signal; `npm run build` then proves the published dists actually compile a
  project. A 404 here means a library did not publish — check step 4's decoder.

## 6. Report

Old → new version, PR link, workflow run link, and the verification evidence.
