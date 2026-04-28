"use client";

/**
 * EditErrorBoundary — keeps render errors inside the product surface.
 *
 * T1-4 — The audit found that clicking the "Issues" badge surfaced the
 * Next.js dev overlay (a framework diagnostic) instead of an in-product
 * panel. Root cause: a hydration error (nested <button>) was being
 * caught by the framework, not the product, so the operator was
 * dropped into developer tooling.
 *
 * The nested-button violations are fixed at the source (InfoTip pulled
 * out of toggle buttons in inspector-group; chip elements changed to
 * div[role=radio] in visual-chip-group). This boundary is the safety
 * net for any future render error: it catches, logs, and renders a
 * graceful in-product fallback that the operator can recover from
 * without ever seeing the framework overlay.
 *
 * The boundary is intentionally narrow — it wraps just the EditShell
 * content, not the whole page. A failure inside the editor leaves the
 * underlying storefront untouched. The "Reload editor" affordance
 * resets the boundary's error state, giving the operator a clean
 * mounting attempt without a full page navigation.
 *
 * In production builds Next.js suppresses its dev overlay automatically,
 * but this boundary still matters: without it, a thrown error inside
 * the editor would unmount the whole subtree and leave a blank pane.
 * The fallback gives explicit feedback and a recovery path.
 */

import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class EditErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    // Log to console for dev diagnostics — production logging hooks
    // (Sentry, etc.) plug in here later. We deliberately avoid sending
    // anything to a server endpoint by default so this file stays
    // dependency-free.
    console.error(
      "[EditErrorBoundary] caught:",
      error.message,
      info.componentStack ?? "",
    );
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div
        role="alert"
        className="fixed inset-x-0 top-[54px] z-[120] mx-auto mt-4 max-w-md rounded-xl border border-rose-200 bg-rose-50/95 p-4 text-sm text-rose-900 shadow-lg backdrop-blur"
      >
        <div className="mb-1 font-semibold">Editor hit an error</div>
        <p className="mb-3 text-xs leading-relaxed text-rose-800">
          Something went wrong rendering the editor. Your published page is
          unaffected. Reload the editor to retry — if it keeps happening,
          send the message below to support.
        </p>
        <pre className="mb-3 max-h-24 overflow-auto rounded border border-rose-200 bg-white/60 p-2 text-[10px] text-rose-900">
          {this.state.error.message}
        </pre>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={this.reset}
            className="rounded-lg bg-rose-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-rose-800"
          >
            Reload editor
          </button>
          <button
            type="button"
            onClick={() => {
              if (typeof window !== "undefined") window.location.reload();
            }}
            className="rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-semibold text-rose-900 hover:bg-rose-100"
          >
            Reload page
          </button>
        </div>
      </div>
    );
  }
}
