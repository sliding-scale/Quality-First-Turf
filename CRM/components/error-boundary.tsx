"use client";

import { Component, type ReactNode } from "react";

/** Catches an error thrown while rendering its children (for instance a backend query that was rejected) and shows `fallback` instead. */
export class ErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
