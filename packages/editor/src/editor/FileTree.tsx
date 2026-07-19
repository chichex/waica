import { useEffect, useState } from 'react'
import type { ProjectFS, TreeNode } from '../fs/project-fs'

function Node({
  node,
  open,
  onOpen,
}: {
  node: TreeNode
  open: string | null
  onOpen(path: string): void
}) {
  if (node.kind === 'dir') {
    return (
      <details open={node.name === 'src'}>
        <summary className="ed-tree-dir">📁 {node.name}</summary>
        <div className="ed-tree-children">
          {(node.children ?? []).map((child) => (
            <Node key={child.path} node={child} open={open} onOpen={onOpen} />
          ))}
        </div>
      </details>
    )
  }
  return (
    <button
      className={`ed-tree-file ${open === node.path ? 'is-open' : ''}`}
      onClick={() => onOpen(node.path)}
    >
      📄 {node.name}
    </button>
  )
}

export function FileTree({
  fs,
  refreshKey,
  open,
  onOpen,
}: {
  fs: ProjectFS
  refreshKey: number
  open: string | null
  onOpen(path: string): void
}) {
  const [nodes, setNodes] = useState<TreeNode[]>([])
  useEffect(() => {
    void fs.tree().then(setNodes)
  }, [fs, refreshKey])

  return (
    <section className="ed-panel ed-files">
      <header className="ed-panel-head">
        <span>Archivos</span>
      </header>
      <div className="ed-tree">
        {nodes.map((node) => (
          <Node key={node.path} node={node} open={open} onOpen={onOpen} />
        ))}
      </div>
    </section>
  )
}
