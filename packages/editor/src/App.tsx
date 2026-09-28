import { Home } from './home/Home'
import { Editor } from './editor/Editor'
import { reportRejection } from './report-rejection'
import { useProjectSession } from './use-project-session'

export function App() {
  const session = useProjectSession()
  if (!session.checked && !session.project) return null
  return session.project ? (
    <Editor fs={session.project} onClose={session.close} />
  ) : (
    <Home
      onOpen={session.open}
      resume={session.resume}
      onResume={() => reportRejection(session.resumeLast(), 'resume last project')}
      onDeleted={session.forgetDeleted}
    />
  )
}
