import { existsSync } from 'node:fs'
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { BICUBIC, createICNS, createICO } from 'png2icons'

/** waica's own icon, shipped with the CLI as .png, .ico and .icns (CA-11). */
export const DEFAULT_ICON_DIR = path.resolve(import.meta.dirname, '..', '..', 'assets')

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])
const FORMATS = ['png', 'ico', 'icns'] as const

/** --icon, else the Project's src/art/icon.png, else null: waica's default. */
function customIcon(project: string, iconFlag: string | null): string | null {
  if (iconFlag !== null) return path.resolve(iconFlag)
  const projectIcon = path.join(project, 'src', 'art', 'icon.png')
  return existsSync(projectIcon) ? projectIcon : null
}

async function convertPng(source: string, outDir: string): Promise<void> {
  const png = await readFile(source).catch((error: unknown) => {
    throw new Error(`cannot read the icon ${source}`, { cause: error })
  })
  const ico = png.subarray(0, 8).equals(PNG_SIGNATURE) ? createICO(png, BICUBIC, 0, true, true) : null
  const icns = ico ? createICNS(png, BICUBIC, 0) : null
  if (!ico || !icns) throw new Error(`the icon ${source} is not a PNG image`)
  await writeFile(path.join(outDir, 'icon.png'), png)
  await writeFile(path.join(outDir, 'icon.ico'), ico)
  await writeFile(path.join(outDir, 'icon.icns'), icns)
}

/**
 * Writes icon.png, icon.ico and icon.icns into `outDir` and returns the .png:
 * @electron/packager swaps its extension for the target's format (.ico on
 * Windows, .icns on macOS), and the shell sets the .png as the Linux window icon.
 */
export async function prepareIcons(project: string, iconFlag: string | null, outDir: string): Promise<string> {
  await mkdir(outDir, { recursive: true })
  const source = customIcon(project, iconFlag)
  if (source) await convertPng(source, outDir)
  else for (const format of FORMATS) await copyFile(path.join(DEFAULT_ICON_DIR, `icon.${format}`), path.join(outDir, `icon.${format}`))
  return path.join(outDir, 'icon.png')
}
