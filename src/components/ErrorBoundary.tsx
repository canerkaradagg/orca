import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props   { children: ReactNode }
interface State   { hasError: boolean; error?: Error }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '2rem', color: '#b00020' }}>
          <strong>Bir hata oluştu.</strong>
          <pre style={{ marginTop: '0.5rem', fontSize: '0.85rem', whiteSpace: 'pre-wrap' }}>
            {this.state.error?.message}
          </pre>
          <button onClick={() => this.setState({ hasError: false })} style={{ marginTop: '1rem' }}>
            Tekrar Dene
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
