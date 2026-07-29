import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  message: string | null
}

/**
 * Last line of defense for the editor shell. Project code reaches React
 * render (param rows instantiate project component classes to read their
 * defaults), so one throwing class used to leave a blank page with the
 * failure only in the console. Show it, and offer a way back.
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { message: null }

  static getDerivedStateFromError(error: unknown): State {
    return { message: error instanceof Error ? error.message : String(error) }
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error('[waica] editor crashed:', error, info.componentStack)
  }

  override render(): ReactNode {
    const { message } = this.state
    if (message == null) return this.props.children
    return (
      <div className="ed-crash">
        <h2>The editor hit an error</h2>
        <p className="ed-crash-msg">{message}</p>
        <p className="ed-hint">
          This usually comes from a component in <code>src/components/</code> — check its
          constructor and <code>onReady</code>.
        </p>
        <div className="ed-crash-actions">
          <button type="button" onClick={() => this.setState({ message: null })}>
            try again
          </button>
          <button type="button" onClick={() => window.location.reload()}>
            reload
          </button>
        </div>
      </div>
    )
  }
}
