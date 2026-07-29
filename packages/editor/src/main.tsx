import { createRoot } from 'react-dom/client'
import { App } from './App'
import { ErrorBoundary } from './ErrorBoundary'
import './monaco'
import './styles.css'

const root = document.querySelector('#root')
if (!root) throw new Error('missing #root')
createRoot(root).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
)
