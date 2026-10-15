// Test support for the desktop export, excluded from builds: temporary
// Projects, a fake `vite build`, a fake @electron/packager that writes the
// tree the real one writes, and readers for what the export leaves behind.
import { createHash } from 'node:crypto'
import { cp, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { deflateSync } from 'node:zlib'
import type { ExportDeps, PackagerCall } from './export.js'

const roots: string[] = []

/** A fresh temporary directory, removed by cleanupTemp(). */
export async function tempDir(prefix = 'waica-export-test-'): Promise<string> {
  const root = await mkdtemp(path.join(os.tmpdir(), prefix))
  roots.push(root)
  return root
}

export async function cleanupTemp(): Promise<void> {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })))
}

export async function writeTree(root: string, files: Readonly<Record<string, string | Uint8Array>>): Promise<void> {
  for (const [relative, contents] of Object.entries(files)) {
    const target = path.join(root, relative)
    await mkdir(path.dirname(target), { recursive: true })
    await writeFile(target, contents)
  }
}

/** A minimal waica Project, installed (it has node_modules), with `game` merged into its game.json. */
export async function makeProject(
  game: Record<string, unknown> = {},
  files: Readonly<Record<string, string | Uint8Array>> = {},
): Promise<string> {
  const root = await tempDir('waica-export-project-')
  await writeTree(root, {
    'package.json': JSON.stringify({ name: 'hero-quest', version: '1.2.3', private: true, type: 'module' }),
    'src/game.json': JSON.stringify({
      waicaGame: 1,
      archetype: 'platformer',
      resolution: { mode: 'fixed', width: 640, height: 360 },
      pixelsPerUnit: 16,
      ...game,
    }),
    'node_modules/.keep': '',
    ...files,
  })
  return root
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1
  }
  return (crc ^ 0xffffffff) >>> 0
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

/** A valid size×size RGBA PNG whose pixels are `rgb`. */
export function makePng(size: number, rgb: [number, number, number]): Buffer {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(size, 0)
  header.writeUInt32BE(size, 4)
  header[8] = 8
  header[9] = 6
  const row = Buffer.alloc(1 + size * 4)
  for (let x = 0; x < size; x += 1) row.set([...rgb, 255], 1 + x * 4)
  const pixels = Buffer.concat(Array.from({ length: size }, () => row))
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(pixels)),
    pngChunk('IEND', Buffer.alloc(0)),
  ])
}

export async function sha256(file: string): Promise<string> {
  return createHash('sha256').update(await readFile(file)).digest('hex')
}

/** Where a fake packaged app keeps resources/app, as the real packager lays it out per platform. */
export function appResources(folder: string, platform: string, name: string): string {
  return platform === 'darwin'
    ? path.join(folder, `${name}.app`, 'Contents', 'Resources', 'app')
    : path.join(folder, 'resources', 'app')
}

/** Writes what @electron/packager writes for one target: the executable, a stamp that changes per build, and resources/app. */
async function fakePackage(call: PackagerCall, build: number): Promise<string> {
  const folder = path.join(call.out, `${call.name}-${call.platform}-${call.arch}`)
  await cp(call.dir, appResources(folder, call.platform, call.executableName), { recursive: true })
  await writeFile(path.join(folder, 'build-stamp.txt'), `build ${build}`)
  if (call.platform === 'win32') await writeFile(path.join(folder, `${call.executableName}.exe`), 'MZ')
  if (call.platform === 'linux') await writeFile(path.join(folder, call.executableName), '#!/bin/sh\n', { mode: 0o755 })
  if (call.platform === 'darwin') {
    const framework = path.join(folder, `${call.name}.app`, 'Contents', 'Frameworks', 'Electron Framework.framework')
    await mkdir(path.join(framework, 'Versions', 'A'), { recursive: true })
    await symlink('A', path.join(framework, 'Versions', 'Current'))
  }
  return folder
}

/** A stand-in for the compiled shell (dist/export-desktop/shell): its entry and one module it imports. */
async function fakeShellDir(): Promise<string> {
  const shellDir = await tempDir('waica-export-shell-')
  await writeTree(shellDir, {
    'main.js': "import './shell.js'\n",
    'shell.js': 'export {}\n',
  })
  return shellDir
}

/** Fake dependencies: a build that writes a tiny dist, a packager that records its calls, and a log. */
export async function fakeDeps(overrides: Partial<ExportDeps> = {}) {
  const shellDir = await fakeShellDir()
  const packaged: PackagerCall[] = []
  const lines: { info: string[]; warn: string[] } = { info: [], warn: [] }
  const builds: { project: string; outDir: string }[] = []
  const deps: ExportDeps = {
    build: async (project, outDir) => {
      builds.push({ project, outDir })
      await writeTree(outDir, {
        'index.html': '<!doctype html><canvas id="game"></canvas>',
        'waica.params.json': '{}',
        'assets/index-abc.js': 'console.log(1)',
      })
    },
    packager: async (call) => [await fakePackage(call, packaged.push(call))],
    log: { info: (line) => lines.info.push(line), warn: (line) => lines.warn.push(line) },
    shellDir,
    electronVersion: '44.7.2',
    ...overrides,
  }
  return { deps, packaged, lines, builds }
}

/** sha256 of every file below `root`, by path relative to it. */
export async function treeDigests(root: string): Promise<Record<string, string>> {
  const digests: Record<string, string> = {}
  for (const entry of await readdir(root, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile()) continue
    const file = path.join(entry.parentPath, entry.name)
    digests[path.relative(root, file)] = await sha256(file)
  }
  return digests
}

export interface ZipEntry {
  name: string
  /** The Unix mode yazl stores in the high half of the external attributes. */
  mode: number
}

/** The entries of a zip's central directory: enough to check names, modes and symlinks. */
export function zipEntries(zip: Buffer): ZipEntry[] {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]))
  const count = zip.readUInt16LE(end + 10)
  let offset = zip.readUInt32LE(end + 16)
  const entries: ZipEntry[] = []
  for (let index = 0; index < count; index += 1) {
    const nameLength = zip.readUInt16LE(offset + 28)
    const extraLength = zip.readUInt16LE(offset + 30)
    const commentLength = zip.readUInt16LE(offset + 32)
    const mode = zip.readUInt32LE(offset + 38) >>> 16
    entries.push({ name: zip.toString('utf8', offset + 46, offset + 46 + nameLength), mode })
    offset += 46 + nameLength + extraLength + commentLength
  }
  return entries
}
