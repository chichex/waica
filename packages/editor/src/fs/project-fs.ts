export interface TreeNode {
  name: string
  path: string
  kind: 'file' | 'dir'
  children?: TreeNode[]
}

export const SCENE_PATH = 'src/scenes/main.scene.json'
const EXCLUDED_DIRS = new Set(['node_modules', '.git', 'dist', '.vite', '.DS_Store'])

/**
 * File system of a project opened in the editor. Two implementations:
 * a real disk folder (File System Access API, Chromium) and in-memory
 * (demo mode / browsers without the API).
 */
export interface ProjectFS {
  readonly name: string
  readonly kind: 'real' | 'memory'
  readText(path: string): Promise<string | null>
  writeText(path: string, content: string): Promise<void>
  /** Raw bytes of a file (for binary assets like images), or null if missing. */
  readFile(path: string): Promise<Uint8Array<ArrayBuffer> | null>
  writeFile(path: string, bytes: Uint8Array<ArrayBuffer>): Promise<void>
  deleteFile(path: string): Promise<void>
  tree(): Promise<TreeNode[]>
}

function sortTree(nodes: TreeNode[]): TreeNode[] {
  return nodes.sort((a, b) =>
    a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'dir' ? -1 : 1,
  )
}

export class RealFS implements ProjectFS {
  readonly kind = 'real'

  constructor(
    readonly name: string,
    private readonly root: FileSystemDirectoryHandle,
  ) {}

  get handle(): FileSystemDirectoryHandle {
    return this.root
  }

  private async dir(path: string[], create: boolean): Promise<FileSystemDirectoryHandle | null> {
    let current = this.root
    for (const part of path) {
      try {
        current = await current.getDirectoryHandle(part, { create })
      } catch {
        return null
      }
    }
    return current
  }

  async readText(path: string): Promise<string | null> {
    const parts = path.split('/')
    const file = parts.pop()
    if (!file) return null
    const dir = await this.dir(parts, false)
    if (!dir) return null
    try {
      const handle = await dir.getFileHandle(file)
      return await (await handle.getFile()).text()
    } catch {
      return null
    }
  }

  async writeText(path: string, content: string): Promise<void> {
    const parts = path.split('/')
    const file = parts.pop()
    if (!file) throw new Error(`invalid path: ${path}`)
    const dir = await this.dir(parts, true)
    if (!dir) throw new Error(`could not create the directory for ${path}`)
    const handle = await dir.getFileHandle(file, { create: true })
    const writable = await handle.createWritable()
    await writable.write(content)
    await writable.close()
  }

  async readFile(path: string): Promise<Uint8Array<ArrayBuffer> | null> {
    const parts = path.split('/')
    const file = parts.pop()
    if (!file) return null
    const dir = await this.dir(parts, false)
    if (!dir) return null
    try {
      const handle = await dir.getFileHandle(file)
      return new Uint8Array(await (await handle.getFile()).arrayBuffer())
    } catch {
      return null
    }
  }

  async writeFile(path: string, bytes: Uint8Array<ArrayBuffer>): Promise<void> {
    const parts = path.split('/')
    const file = parts.pop()
    if (!file) throw new Error(`invalid path: ${path}`)
    const dir = await this.dir(parts, true)
    if (!dir) throw new Error(`could not create the directory for ${path}`)
    const handle = await dir.getFileHandle(file, { create: true })
    const writable = await handle.createWritable()
    await writable.write(bytes)
    await writable.close()
  }

  async deleteFile(path: string): Promise<void> {
    const parts = path.split('/')
    const file = parts.pop()
    if (!file) throw new Error(`invalid path: ${path}`)
    const dir = await this.dir(parts, false)
    if (!dir) throw new Error(`no such directory for ${path}`)
    await dir.removeEntry(file)
  }

  async tree(): Promise<TreeNode[]> {
    const walk = async (dir: FileSystemDirectoryHandle, base: string): Promise<TreeNode[]> => {
      const nodes: TreeNode[] = []
      for await (const [name, handle] of dir.entries()) {
        if (EXCLUDED_DIRS.has(name)) continue
        const path = base ? `${base}/${name}` : name
        if (handle.kind === 'directory') {
          nodes.push({
            name,
            path,
            kind: 'dir',
            children: await walk(handle as FileSystemDirectoryHandle, path),
          })
        } else {
          nodes.push({ name, path, kind: 'file' })
        }
      }
      return sortTree(nodes)
    }
    return walk(this.root, '')
  }
}

export class MemFS implements ProjectFS {
  readonly kind = 'memory'
  private readonly files: Map<string, string>
  private readonly blobs = new Map<string, Uint8Array<ArrayBuffer>>()

  constructor(
    readonly name: string,
    initial: Record<string, string>,
  ) {
    this.files = new Map(Object.entries(initial))
  }

  readText(path: string): Promise<string | null> {
    return Promise.resolve(this.files.get(path) ?? null)
  }

  writeText(path: string, content: string): Promise<void> {
    this.files.set(path, content)
    return Promise.resolve()
  }

  readFile(path: string): Promise<Uint8Array<ArrayBuffer> | null> {
    const blob = this.blobs.get(path)
    if (blob) return Promise.resolve(blob)
    const text = this.files.get(path)
    return Promise.resolve(text != null ? new TextEncoder().encode(text) : null)
  }

  writeFile(path: string, bytes: Uint8Array<ArrayBuffer>): Promise<void> {
    this.blobs.set(path, bytes)
    return Promise.resolve()
  }

  deleteFile(path: string): Promise<void> {
    this.files.delete(path)
    this.blobs.delete(path)
    return Promise.resolve()
  }

  tree(): Promise<TreeNode[]> {
    const root: TreeNode[] = []
    for (const path of [...this.files.keys(), ...this.blobs.keys()].sort()) {
      const parts = path.split('/')
      let level = root
      let acc = ''
      for (let i = 0; i < parts.length; i++) {
        const name = parts[i]
        if (!name) continue
        acc = acc ? `${acc}/${name}` : name
        const isFile = i === parts.length - 1
        let node = level.find((n) => n.name === name)
        if (!node) {
          node = isFile
            ? { name, path: acc, kind: 'file' }
            : { name, path: acc, kind: 'dir', children: [] }
          level.push(node)
        }
        if (!isFile) level = node.children ?? []
      }
    }
    const sortAll = (nodes: TreeNode[]): TreeNode[] => {
      for (const n of nodes) if (n.children) sortAll(n.children)
      return sortTree(nodes)
    }
    return Promise.resolve(sortAll(root))
  }
}
