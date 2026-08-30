declare module '*?raw' {
  const content: string
  export default content
}

declare module '*.png' {
  const url: string
  export default url
}

// File System Access API (Chromium). Minimal declarations in case
// TypeScript's DOM lib doesn't ship them completely.
interface Window {
  showDirectoryPicker?: (options?: {
    mode?: 'read' | 'readwrite'
    id?: string
  }) => Promise<FileSystemDirectoryHandle>
}

interface FileSystemHandle {
  queryPermission?: (descriptor: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>
  requestPermission?: (descriptor: { mode: 'read' | 'readwrite' }) => Promise<PermissionState>
  /** Chromium 110+: deletes the entry this handle points at. Optional on purpose. */
  remove?: (options?: { recursive?: boolean }) => Promise<void>
}

interface FileSystemDirectoryHandle {
  entries(): AsyncIterableIterator<[string, FileSystemDirectoryHandle | FileSystemFileHandle]>
}
