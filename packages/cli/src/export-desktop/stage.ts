import { cp, copyFile, mkdir, readdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { DesktopShellConfig } from './desktop-config.js'
import { preloadSource } from './shell/desktop-bridge.js'

export interface StageInput {
  /** Where resources/app is assembled. */
  appDir: string
  /** The Project's `vite build` output. */
  distDir: string
  /** The compiled shell modules: main.js and what it imports. */
  shellDir: string
  config: DesktopShellConfig
  packageName: string
  version: string
  iconPng: string
}

function json(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`
}

/**
 * Assembles resources/app (CA-8): dist/ (the build), the shell's modules with
 * main.js as the entry, the generated preload.js, package.json, the window
 * icon and waica-desktop.json.
 */
export async function stageApp(input: StageInput): Promise<void> {
  const { appDir, config } = input
  await mkdir(appDir, { recursive: true })
  await cp(input.distDir, path.join(appDir, 'dist'), { recursive: true })
  for (const entry of await readdir(input.shellDir, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith('.js')) {
      await copyFile(path.join(input.shellDir, entry.name), path.join(appDir, entry.name))
    }
  }
  await writeFile(path.join(appDir, 'preload.js'), preloadSource())
  await writeFile(
    path.join(appDir, 'package.json'),
    json({ name: input.packageName, productName: config.name, version: input.version, main: 'main.js', type: 'module', private: true }),
  )
  await writeFile(path.join(appDir, 'waica-desktop.json'), json(config))
  await copyFile(input.iconPng, path.join(appDir, 'icon.png'))
}
