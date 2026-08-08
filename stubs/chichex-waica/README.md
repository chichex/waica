# @chichex/waica → @waica/cli

waica was renamed to [`@waica/cli`](https://www.npmjs.com/package/@waica/cli) at 0.4.0.

This directory holds the final version published under the old name. It exists
because installed copies of `@chichex/waica` check *their own name* for updates,
so the only way to tell them about the rename is to publish something newer
under the old name. Its `waica` binary ships no editor: it explains the rename
and, in an interactive global install, offers to replace itself with
`@waica/cli` and re-run the original command.

It is published by the `publish-rename-stub` job in
`.github/workflows/publish.yml`, triggered by a `chichex-waica-v*` tag. It is
not part of the pnpm workspace and does not release in lockstep with the
`@waica/*` packages — barring registry accidents, it never needs another
version.
