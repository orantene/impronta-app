"use client";

/**
 * In-shell Talent Payouts section.
 *
 * Thin wrapper — the actual UI (status card + embedded Stripe Connect
 * onboarding) lives in the route dir's `PayoutsShell`, which is inline-styled;
 * this `components/admin/shell` directory is under a frozen
 * `ratchet/no-new-inline-style` rule, so we only resolve the bridge data here
 * and delegate rendering. Mirrors the workspace `PayoutsPage` page-module.
 *
 * The talent's payout snapshot is pre-loaded server-side in the talent layout
 * bridge (`talentPayoutSnapshot`), so this renders with no client fetch / no
 * loading state — and inside the talent dashboard nav (not a standalone page).
 */

import { PayoutsShell } from "@/app/(workspace)/[tenantSlug]/talent/settings/payouts/PayoutsShell";
import { useAdminShell } from "../state";

export function TalentPayoutsPage() {
  const { bridgeTalentPayoutSnapshot } = useAdminShell();
  const snap = bridgeTalentPayoutSnapshot;
  const snapshot = snap?.ok ? snap.data : null;
  const loadError = snap && !snap.ok ? snap.error : null;
  return (
    <PayoutsShell
      snapshot={snapshot}
      loadError={loadError}
      justReturned={false}
      justRefreshed={false}
    />
  );
}
