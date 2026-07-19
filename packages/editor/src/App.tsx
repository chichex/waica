import { useState } from 'react'
import type { ProjectFS } from './fs/project-fs'
import { Home } from './home/Home'
import { Editor } from './editor/Editor'

export function App() {
  const [project, setProject] = useState<ProjectFS | null>(null)
  return project ? (
    <Editor fs={project} onClose={() => setProject(null)} />
  ) : (
    <Home onOpen={setProject} />
  )
}
