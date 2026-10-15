import { DEFAULT_PORT } from './server.js'

/** The signing and store-upload guide the export points at. */
export const DESKTOP_GUIDE = 'https://github.com/chichex/waica/blob/main/docs/desktop-export.md'

/** What `waica --help` prints. */
export const HELP = `waica — the waica editor, one command away

Usage: waica [options]
       waica mcp
       waica export desktop [dir] [export options]

Commands:
  mcp             serve the waica MCP server on stdio, for agent hosts:
                  claude mcp add waica -- npx -y @waica/cli mcp
  export desktop  package the project in [dir] (default .) as a desktop app,
                  one folder and one .zip per platform, unsigned. A project
                  without node_modules is installed first (npm, pnpm or yarn,
                  by its lockfile). Signing and store upload:
                  ${DESKTOP_GUIDE}

Export options:
  --platform <list>    linux,win32,darwin (default: all three)
  --out <dir>          output directory (default <dir>/export)
  --name <name>        app name (default: the project's package.json name)
  --icon <png>         app icon (default src/art/icon.png, else waica's)
  --steam-app-id <n>   Steam app id (default: game.json desktop.steam.appId)
  --no-steam           leave Steam out, even when game.json declares it
  --no-install         fail instead of installing a missing node_modules

Options:
  --port <n>   preferred port (default ${DEFAULT_PORT}; the next free one is used if taken)
  --no-open    do not open the browser
  --version    print the version
  --help       show this help`
