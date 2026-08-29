"use client";

/**
 * shell-boundary.tsx — everything that must sit ABOVE `AdminShellProvider`.
 *
 * `AdminShellClient` (workspace) and `TalentShellClient` (talent) both mount
 * the same provider stack. Keeping it in one component means neither shell can
 * be given a different set by accident, which matters most for
 * `UpgradeModalProvider`: it is load-bearing, not decoration. The shell
 * context's `openUpgrade()` delegates into it (see `state/upgrade-bridge`), and
 * a shell mounted without it gets inert setters — every contextual upgrade CTA
 * in the product then goes quietly dead, with no error anywhere. That is not
 * hypothetical: the real upgrade modal already spent its whole life mounted
 * inside a component nothing imported.
 *
 * Extracted from `admin-shell-client.tsx` together with the error boundary it
 * wraps, which nothing else used.
 */

import { Component, Suspense, type ReactNode } from "react";

import { UpgradeModalProvider } from "@/components/admin/site-control-center/upgrade-context";

import { SupportSlotContext } from "./support-slot-gate";

// ─── Error boundary (#26) ─────────────────────────────────────────────
// Catches render-time exceptions and shows a friendly fallback page.

class ErrorBoundary extends Component<
  { children: ReactNode },
  { caught: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { caught: null };
  }
  static getDerivedStateFromError(err: Error) {
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
            className="mt-2 cursor-pointer rounded-[10px] border-none bg-[#0F4F3E] px-[22px] py-[10px] text-[14px] font-semibold text-white"
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export function ShellBoundary({
  supportSlot,
  children,
}: {
  /** In-app support launcher, published to descendants via context. */
  supportSlot?: ReactNode;
  children: ReactNode;
}) {
  return (
    <ErrorBoundary>
      <Suspense fallback={null}>
        <SupportSlotContext.Provider value={supportSlot ?? null}>
          <UpgradeModalProvider>{children}</UpgradeModalProvider>
        </SupportSlotContext.Provider>
      </Suspense>
    </ErrorBoundary>
  );
}
