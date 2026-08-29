"use client";

/**
 * ShellUpgradeModal — the SPA shell's mount of the one real upgrade modal.
 *
 * WHY THIS FILE EXISTS
 * ────────────────────
 * Two upgrade modals used to be mounted in the workspace admin:
 *
 *   • `site-control-center/global-upgrade-modal.tsx` — the real one. It calls
 *     `startWorkspaceUpgrade` and redirects to Stripe Checkout. It was mounted
 *     only inside `shell/admin-shell.tsx`, a component nothing imports, so in
 *     the live product it never rendered.
 *   • `shell/internal/drawers/UpgradeModal.tsx` — the one users actually saw.
 *     Its CTA called a `useState` plan setter and toasted "upgrade applied".
 *     Nothing was written to the database and nothing was charged: the shell
 *     re-rendered as if the tenant were on Agency, every server-side gate kept
 *     refusing, and one reload undid it. Deleted.
 *
 * So the fix is a mount, not a rewrite. `openUpgrade()` in the shell context
 * hands its offer to `UpgradeModalProvider`, and this component renders the
 * real modal with the two facts it needs from the shell but cannot get from
 * `AdminWorkspaceProvider` (which is not mounted in this tree): the tenant
 * slug for the checkout session, and the live plan tier for "Current plan".
 *
 * `state.plan` is primed from `tenantIdentity.planTier` — the real
 * `agencies.plan_tier` row — and can no longer be moved by any click handler
 * on a live workspace (see `devSetPlan` in `state/context.tsx`).
 */

import { GlobalUpgradeModal } from "@/components/admin/site-control-center/global-upgrade-modal";

import { useAdminShell } from "./state";

export function ShellUpgradeModal() {
  const { state, tenantSlug } = useAdminShell();

  return (
    <GlobalUpgradeModal tenantSlug={tenantSlug} activePlan={state.plan} />
  );
}
