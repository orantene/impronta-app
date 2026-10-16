"use client";

/**
 * shell-error-boundary.tsx — the shell's crash screen, kept import-light so it
 * can be rendered in tests without the shell state / server chain.
 */

import { unstable_rethrow } from "next/navigation";
import { Component, type ReactNode } from "react";

// ─── Error boundary (#26) ─────────────────────────────────────────────
// Catches render-time exceptions and shows a friendly fallback page.

export class ErrorBoundary extends Component<
  { children: ReactNode },
  { caught: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { caught: null };
  }
  static getDerivedStateFromError(err: Error) {
    // notFound() / redirect() / forbidden() from a page below travel as
    // errors; they belong to Next's boundaries, not this crash screen. Throwing
    // here (as Next's own boundaries do) hands them to the parent boundary
    // before any fallback state exists; throwing in render crashed the page.
    unstable_rethrow(err);
    return { caught: err };
  }
  override render() {
    if (this.state.caught) {
      // Tailwind rather than `style={{…}}`: the shell's inline-style ratchet
      // treats this moved file as new code, and a static fallback screen is the
      // easiest possible place to pay that debt off instead of carrying it.
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center font-[system-ui,sans-serif]">
          <div className="text-[40px]">⚠️</div>
          <h1 className="m-0 text-[22px] font-semibold">Something broke</h1>
          <p className="m-0 text-[14px] text-[rgba(11,11,13,0.6)]">
            {this.state.caught.message || "An unexpected error occurred."}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-2 cursor-pointer rounded-[10px] border-none bg-admin-accent px-[22px] py-[10px] text-[14px] font-semibold text-white"
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
