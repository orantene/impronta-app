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

import { Suspense, type ReactNode } from "react";

import { DashboardDocumentLang } from "@/components/i18n/DashboardDocumentLang";

import { UpgradeModalProvider } from "@/components/admin/site-control-center/upgrade-context";

import { ErrorBoundary } from "./shell-error-boundary";
import { SupportSlotContext } from "./support-slot-gate";

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
          <DashboardDocumentLang />
          <UpgradeModalProvider>{children}</UpgradeModalProvider>
        </SupportSlotContext.Provider>
      </Suspense>
    </ErrorBoundary>
  );
}
