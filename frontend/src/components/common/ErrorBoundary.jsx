import { Component } from 'react';
import { ErrorState } from './States';
export class ErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <ErrorState error={{ message: 'The workspace could not be displayed. Reload to reconnect.' }} retry={() => window.location.reload()}/> : this.props.children; }
}
