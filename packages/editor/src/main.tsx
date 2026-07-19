import { createRoot } from 'react-dom/client'
import { App } from './App'
import './monaco'
import './styles.css'

const root = document.querySelector('#root')
if (!root) throw new Error('falta #root')
createRoot(root).render(<App />)
