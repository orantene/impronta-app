"use client";

/**
 * PhoneWorkspaceMessages — the workspace's Messages tab on a phone
 * (`docs/plans/program/engine/messaging.md`, seam 5; boards MM01 to MM06).
 *
 * The bottom bar's Messages row and the More sheet's chip both land on the
 * `messages` page. Under the shell's mobile breakpoint that page is the
 * POS Messages surface in its `compact` shape (D-POS-88: the phone reuses
 * the tablet's components), reading the same inquiry store through the
 * same server actions; above it the three-pane operations shell stays.
 * Without a real tenant on the bridge (the standalone prototype) there is
 * nothing for the actions to scope to, so the caller keeps the legacy shell.
 */

import { MessagesShell as MessagesClient } from "@/components/admin/pos/messages/MessagesShell";
import { useAdminShell } from "../state";

export function PhoneWorkspaceMessages({ tenantId }: { tenantId: string }) {
  const { adminBasePath } = useAdminShell();
  return (
    // The tab owns the space between the top bar and the bottom bar, so the
    // thread's composer is on screen and the list scrolls inside it (MM02).
    // 136px = the top bar, the bottom tab bar and the surface's gutters.
    <div data-tulala-phone-messages className="-mx-[14px] -mt-[14px] flex h-[calc(100dvh-136px)] min-h-0 flex-col">
      <MessagesClient mode="counter" tenantId={tenantId} locationSlug="default" adminBasePath={adminBasePath} compact />
    </div>
  );
}
