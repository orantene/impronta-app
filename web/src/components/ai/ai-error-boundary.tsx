"use client";
import { improntaLog } from "@/lib/server/structured-log";

import { Component, type ErrorInfo, type ReactNode } from "react";

import { AIEmptyState } from "./ai-empty-state";

type Props = {
  children: ReactNode;
  /** Render when a child throws (e.g. `AIEmptyState`). */
  fallback?: ReactNode;
};

type State = { hasError: boolean };

/**
 * Isolates AI subtree failures so directory/profile/inquiry shells keep working.
 * See plan hard rules §11.
 */
export class AIErrorBoundary extends Component<Props, State> {
  override state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    if (process.env.NODE_ENV === "development") {
      void improntaLog("ai_error_boundary.warn", {
        message: "[AIErrorBoundary]",
        error: error.message,
        info: info.componentStack,
      });
    }
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <AIEmptyState
            title="AI unavailable"
            description="This section had a problem. You can keep using the rest of the page."
          />
        )
      );
    }
    return this.props.children;
  }
}
