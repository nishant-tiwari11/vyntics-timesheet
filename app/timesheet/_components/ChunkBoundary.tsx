"use client";

import { Component, type ReactNode } from "react";
import "./skeleton.css";

// If a lazily loaded piece can't be fetched (bad connection, a new deploy), show a message with a retry
// instead of leaving a placeholder on screen forever. Reloading is the reliable retry for a missing chunk.
export default class ChunkBoundary extends Component<
  { children: ReactNode; label?: string; silent?: boolean },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) return this.props.children;
    if (this.props.silent) return null; // decoration only: nothing to retry
    return (
      <p className="ts-alert ts-chunk-error" role="alert">
        Couldn&apos;t load {this.props.label ?? "this part"}. Check your connection.
        <button type="button" className="ts-btn ts-btn-sm" onClick={() => window.location.reload()}>
          Try again
        </button>
      </p>
    );
  }
}
