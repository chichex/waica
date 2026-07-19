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
 * Plugin de dev de Waica: recibe los overrides del inspector overlay y los
 * persiste en public/waica.params.json — que viaja al build, así lo que
 * tuneaste jugando es lo que exportás.
 */
export function waicaDev(): Plugin {
  return {
    name: 'waica-dev',
    config() {
      // El guardado no debe recargar la página (el juego seguiría de largo).
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
