// Rewrites the five @waica libraries' package.json in place into the shape npm
// should serve, then prints their directories to stdout in dependency order so
// CI can publish them one by one.
//
// This exists because the release publishes with `npm publish`, not `pnpm
// publish`: npm trusted publishing signs the request through the workflow's
// OIDC identity, and npm is the client that knows how to do that. npm, however,
// has no idea what `workspace:^` means — it would publish that string verbatim
// and put an uninstallable package on the registry. So the manifest is lowered
// to its published form first, exactly the way the CLI lowers it when it
// vendors the same libraries (scripts/published-manifest.mjs).
//
// Destructive by design: it edits the checkout. CI runs it on a throwaway
// clone, after every test has already passed. Run it locally and `git checkout
// packages/*/package.json` afterwards.
import { existsSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import {
  libraryVersions,
  publishedManifest,
  readLibraryManifests,
} from './published-manifest.mjs'

function fail(message) {
  console.error(`waica: ${message}`)
  process.exit(1)
}

const manifests = readLibraryManifests()
const versions = libraryVersions(manifests)

for (const { directory, root, source } of manifests) {
  for (const published of source.files) {
    if (!existsSync(path.join(root, published))) {
      fail(`${source.name} is missing its published ${published}/ directory — run \`pnpm build\``)
    }
  }
  if (!existsSync(path.join(root, 'dist', 'index.js'))) {
    fail(`${source.name} was not built — run \`pnpm build\` before publishing`)
  }

  writeFileSync(
    path.join(root, 'package.json'),
    `${JSON.stringify(publishedManifest(source, versions), null, 2)}\n`,
  )
  console.error(`waica: prepared ${source.name}@${source.version} for publishing`)
  console.log(path.join('packages', directory))
}
