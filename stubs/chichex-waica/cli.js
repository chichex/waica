#!/usr/bin/env node
'use strict'

// Final version of @chichex/waica: the package was renamed to @waica/cli, and
// existing installs check their own name for updates, so they can only learn
// about the rename from a newer version published under the old name — this
// one. It carries no editor; it migrates the install and hands over.

const { spawn, spawnSync } = require('node:child_process')
const readline = require('node:readline/promises')

const NEW_PKG = '@waica/cli'
const shell = process.platform === 'win32'

async function confirm(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  try {
    return /^y(es)?$/i.test((await rl.question(question)).trim())
  } catch {
    return false // Ctrl+C / Ctrl+D at the prompt means no
  } finally {
    rl.close()
  }
}

async function main() {
  const args = process.argv.slice(2)

  if (args[0] === 'mcp') {
    // stdout would be the MCP protocol channel — keep it clean.
    console.error(`waica: @chichex/waica was renamed to ${NEW_PKG}`)
    console.error(`waica: update your MCP server command to: npx ${NEW_PKG} mcp`)
    process.exit(1)
  }

  console.log()
  console.log(`  @chichex/waica is now ${NEW_PKG}`)
  console.log('  this package no longer ships the editor — the new one does')

  const interactive = process.stdin.isTTY === true && process.stdout.isTTY === true
  if (!interactive) {
    console.log(`  run: npm install -g ${NEW_PKG}@latest`)
    process.exit(1)
  }

  if (!(await confirm(`  install ${NEW_PKG} now? [y/N] `))) {
    console.log(`  run: npm install -g ${NEW_PKG}@latest`)
    process.exit(1)
  }

  // Remove the old package first: both packages install the same `waica`
  // binary, and npm refuses to overwrite another package's bin without it.
  const uninstall = spawnSync('npm', ['uninstall', '-g', '@chichex/waica'], { stdio: 'inherit', shell })
  const install =
    uninstall.status === 0
      ? spawnSync('npm', ['install', '-g', `${NEW_PKG}@latest`], { stdio: 'inherit', shell })
      : uninstall
  if (install.status !== 0) {
    console.error('waica: migration failed — run it manually:')
    console.error(`  npm uninstall -g @chichex/waica && npm install -g ${NEW_PKG}@latest`)
    process.exit(1)
  }

  console.log('  ✔ installed — restarting…')
  const child = spawn('waica', args, { stdio: 'inherit', shell })
  child.on('error', () => {
    // PATH did not pick up the new binary in this process — a fresh shell will.
    console.log('  installed — run: waica')
    process.exit(0)
  })
  process.exit(await new Promise((resolve) => child.on('exit', (code) => resolve(code ?? 0))))
}

main()
