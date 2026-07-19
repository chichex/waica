#!/usr/bin/env node
import * as p from '@clack/prompts'
import { cp, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const TEMPLATE_DIR = path.join(here, '..', 'template')

const ARCHETYPES = [
  {
    value: 'platformer',
    label: 'Plataformero',
    hint: 'correr y saltar — coyote time, stomp y cámara con lookahead de fábrica',
  },
]

interface Answers {
  dir: string
  archetype: string
}

async function ask(): Promise<Answers> {
  p.intro('🐕 waica — creá tu juego')

  const dir = await p.text({
    message: '¿Cómo se llama tu juego?',
    placeholder: 'mi-juego',
    defaultValue: 'mi-juego',
    validate: (value) => {
      if (value && !/^[a-z0-9][a-z0-9-_.]*$/.test(value)) {
        return 'usá minúsculas, números y guiones (será el nombre de la carpeta y del paquete)'
      }
      return undefined
    },
  })
  if (p.isCancel(dir)) return cancel()

  const archetype = await p.select({
    message: '¿Qué tipo de juego querés hacer?',
    options: ARCHETYPES,
  })
  if (p.isCancel(archetype)) return cancel()

  p.note('top-down e isométrico vienen en camino 🚧', 'arquetipos')

  return { dir: dir || 'mi-juego', archetype: archetype as string }
}

function cancel(): never {
  p.cancel('cancelado — acá no pasó nada')
  process.exit(0)
}

async function scaffold(answers: Answers): Promise<string> {
  const target = path.resolve(process.cwd(), answers.dir)
  if (existsSync(target) && (await readdir(target)).length > 0) {
    p.cancel(`la carpeta "${answers.dir}" ya existe y no está vacía`)
    process.exit(1)
  }

  await mkdir(target, { recursive: true })
  await cp(TEMPLATE_DIR, target, { recursive: true })

  // npm renombra .gitignore a .npmignore al publicar; por eso viaja como _gitignore.
  await rename(path.join(target, '_gitignore'), path.join(target, '.gitignore'))

  const own = JSON.parse(await readFile(path.join(here, '..', 'package.json'), 'utf8')) as {
    version: string
  }
  const pkgTpl = await readFile(path.join(target, 'package.json.tpl'), 'utf8')
  const pkg = pkgTpl
    .replaceAll('__PROJECT_NAME__', path.basename(target))
    .replaceAll('__WAICA_VERSION__', own.version)
  await writeFile(path.join(target, 'package.json'), pkg)
  await rm(path.join(target, 'package.json.tpl'))

  return target
}

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('-'))
  const interactive = args.length === 0

  const answers: Answers = interactive
    ? await ask()
    : { dir: args[0] ?? 'mi-juego', archetype: 'platformer' }

  const target = await scaffold(answers)
  const dirName = path.relative(process.cwd(), target) || '.'
  const pm = process.env.npm_config_user_agent?.split('/')[0] ?? 'npm'
  const run = pm === 'npm' ? 'npm run' : pm

  if (interactive) {
    p.outro(`listo 🎉  tu plataformero te espera:

   cd ${dirName}
   ${pm} install
   ${run} dev

  ← → para moverte · espacio salta · ~ abre el inspector`)
  } else {
    console.log(`waica: proyecto creado en ${dirName}`)
    console.log(`  cd ${dirName} && ${pm} install && ${run} dev`)
  }
}

void main()
