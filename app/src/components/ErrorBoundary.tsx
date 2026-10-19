import React from 'react';
import { reportError } from '../lib/perf';
import { currentRequestId, logger } from '../lib/logger';
import { captureRouteError } from '../lib/sentry';

/** Catches render crashes per route — shows the existing Empty pattern,
 *  records a PII-free entry for Settings → Diagnostics. No visual change
 *  unless a crash actually happens. */
export class ErrorBoundary extends React.Component<
  { children: React.ReactNode; route: string },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(err: unknown): void {
    reportError(err, this.props.route);
    // Friendly UI stays in render(); full detail goes to tracking, never PII.
    const requestId = currentRequestId();
    const name = err instanceof Error ? err.name : 'Error';
    const message = err instanceof Error ? err.message.slice(0, 200) : 'Unknown error';
    logger.error('route-crash', `Route crashed: ${this.props.route}`, {
      route: this.props.route,
      error_name: name,
      error_message: message,
    });
    captureRouteError(err, this.props.route, requestId);
  }

  componentDidUpdate(prev: { route: string }): void {
    if (prev.route !== this.props.route && this.state.failed) {
      this.setState({ failed: false });
    }
  }

  render(): React.ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <section className="card rise" role="alert">
        <div className="card-pad" style={{ display: 'grid', gap: 10, textAlign: 'center', padding: '30px 16px' }}>
          <p className="muted" style={{ margin: 0 }}>Something went wrong on this page.</p>
          <div>
            <button className="btn" onClick={() => this.setState({ failed: false })}>
              Try again
            </button>
          </div>
        </div>
      </section>
    );
  }
}
