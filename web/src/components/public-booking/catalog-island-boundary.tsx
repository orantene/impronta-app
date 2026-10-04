"use client";

/**
 * Keeps a `services_catalog` client-island failure from taking down the whole
 * Max-site page (vanity hosts were hard-500ing with "Algo no cargó" when the
 * catalog island threw during SSR/hydrate). Fallback is the server-rendered
 * static list the parent already built — booking CTAs may be inert, but the
 * page stays up.
 */

import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
  fallback: ReactNode;
};

type State = { failed: boolean };

export class CatalogIslandBoundary extends Component<Props, State> {
  override state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  override componentDidCatch(_error: Error, _info: ErrorInfo): void {
    // Intentionally quiet — page stays up via fallback; Sentry is wired at
    // the route error boundary if this ever bubbles.
  }

  override render(): ReactNode {
    if (this.state.failed) return this.props.fallback;
    return this.props.children;
  }
}
