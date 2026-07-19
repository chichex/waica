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
    label: 'Platformer',
    hint: 'run and jump — coyote time, stomp and lookahead camera out of the box',
  },
]

interface Answers {
  dir: string
  archetype: string
}

async function ask(): Promise<Answers> {
  p.intro('🐕 waica — make your game')

  const dir = await p.text({
    message: "What's your game called?",
    placeholder: 'my-game',
    defaultValue: 'my-game',
    validate: (value) => {
      if (value && !/^[a-z0-9][a-z0-9-_.]*$/.test(value)) {
        return 'use lowercase letters, numbers and dashes (it becomes the folder and package name)'
      }
      return undefined
    },
  })
  if (p.isCancel(dir)) return cancel()

  const archetype = await p.select({
    message: 'What kind of game do you want to make?',
    options: ARCHETYPES,
  })
  if (p.isCancel(archetype)) return cancel()

  p.note('top-down and isometric are on the way 🚧', 'archetypes')

  return { dir: dir || 'my-game', archetype: archetype as string }
}

function cancel(): never {
  p.cancel('cancelled — nothing happened here')
  process.exit(0)
}

async function scaffold(answers: Answers): Promise<string> {
  const target = path.resolve(process.cwd(), answers.dir)
  if (existsSync(target) && (await readdir(target)).length > 0) {
    p.cancel(`the "${answers.dir}" folder already exists and is not empty`)
    process.exit(1)
  }

  await mkdir(target, { recursive: true })
  await cp(TEMPLATE_DIR, target, { recursive: true })

  // npm renames .gitignore to .npmignore on publish; that's why it ships as _gitignore.
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
    : { dir: args[0] ?? 'my-game', archetype: 'platformer' }

  const target = await scaffold(answers)
  const dirName = path.relative(process.cwd(), target) || '.'
  const pm = process.env.npm_config_user_agent?.split('/')[0] ?? 'npm'
  const run = pm === 'npm' ? 'npm run' : pm

  if (interactive) {
    p.outro(`done 🎉  your platformer awaits:

   cd ${dirName}
   ${pm} install
   ${run} dev

  ← → to move · space to jump · ~ opens the inspector`)
  } else {
    console.log(`waica: project created in ${dirName}`)
    console.log(`  cd ${dirName} && ${pm} install && ${run} dev`)
  }
}

void main()
