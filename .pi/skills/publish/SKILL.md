---
name: publish
description: Release a new Waica version to npm — the CLI (@waica/cli) plus five @waica libraries, which ship together on one version number. Bumps all eight workspace manifests, runs the verification ladder, ships the bump through a PR, tags the merge so GitHub Actions publishes through npm trusted publishing, and verifies the published packages end to end. Use whenever the user wants to publish, release, ship, or bump a Waica version.
compatibility: Requires the chichex/waica Git repository, Node.js, npm, pnpm, authenticated GitHub CLI (gh), write access to the repository, network access to npm, and the ask_user_question tool.
---

# Publish a new Waica version from Pi

## Canonical workflow

Read [`../../../.claude/skills/publish/SKILL.md`](../../../.claude/skills/publish/SKILL.md) completely before taking any action. It is the single canonical release runbook. Follow every precondition, lockstep-version rule, verification rung, failure decoder, publishing constraint, registry smoke test, cleanup step, and reporting requirement exactly as written there.

This adapter changes only Pi's interaction layer. It does not weaken or replace the canonical workflow.

## Pi interaction

- Invoke as `/skill:publish [patch|minor|major|x.y.z]`.
- When invoked without a version argument, inspect the commits since the latest release, present the semver recommendation, and use `ask_user_question` to choose `patch`, `minor`, `major`, or an explicit version. Do not bump, push, merge, tag, or publish before that answer.
- Treat an explicit version argument as the user's release-version authorization, while still enforcing every canonical precondition and stopping on any discrepancy.
- Use Pi's normal tools (`read` and `bash`) for inspection and execution. Keep long-running workflow watches and published-runtime smokes in the foreground so they remain cancelable.
- Close release PR bodies with `🤖 Generated with [Pi](https://github.com/badlogic/pi-mono)` rather than another harness's signature.
- If the current checkout contains user changes, preserve it untouched. Perform the canonical clean-`main` release from an isolated worktree based on the fetched `origin/main`, and report the original checkout state at the end.
