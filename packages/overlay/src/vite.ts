import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { Connect, Plugin } from 'vite'

function paramsMiddleware(root: string): Connect.NextHandleFunction {
  return (req, res, next) => {
    if (req.method === 'POST' && req.url === '/__waica/params') {
      let raw = ''
      req.on('data', (chunk: Buffer) => (raw += chunk))
      req.on('end', () => {
        void (async () => {
          try {
            const file = join(root, 'public', 'waica.params.json')
            await mkdir(dirname(file), { recursive: true })
            await writeFile(file, JSON.stringify(JSON.parse(raw), null, 2) + '\n')
            res.statusCode = 204
            res.end()
          } catch (err) {
            res.statusCode = 500
            res.end(String(err))
          }
        })()
      })
      return
    }
    next()
  }
}

/**
 * Waica dev plugin: receives the overlay inspector's overrides and
 * persists them to public/waica.params.json — which ships with the build,
 * so what you tuned while playing is what you export.
 */
export function waicaDev(): Plugin {
  return {
    name: 'waica-dev',
    config() {
      // Saving must not reload the page (the game would just keep going).
      return { server: { watch: { ignored: ['**/waica.params.json'] } } }
    },
    configureServer(server) {
      server.middlewares.use(paramsMiddleware(server.config.root))
    },
    configurePreviewServer(server) {
      server.middlewares.use(paramsMiddleware(server.config.root))
    },
  }
}
