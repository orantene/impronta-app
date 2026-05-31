"use client";

/**
 * In-shell Payouts section.
 *
 * Thin wrapper — the actual UI lives in the payouts route dir
 * (`payouts-section-client.tsx`) because this `components/admin/shell`
 * directory is under a frozen `ratchet/no-new-inline-style` rule and the
 * ported markup is inline-styled (matching its siblings
 * `payouts-actions-client.tsx` / `base-fee-client.tsx`).
 *
 * This wrapper's only job is to resolve the live tenant slug + the
 * server-pre-fetched payouts payload from the shell context and hand them to
 * the UI component. The payload is loaded once in the admin layout's bridge
 * `Promise.all` (no client fetch). The shell's `PageRouter` renders this
 * inside the dashboard `<main>` for `page === "payouts"`, so Payouts now sits
 * inside the top nav (Overview / Messages / … / Settings) instead of as a
 * bare standalone page.
 */

import { PayoutsSectionClient } from "@/app/(workspace)/[tenantSlug]/admin/payouts/payouts-section-client";
import { useAdminShell } from "../state";

export function PayoutsPage() {
  const { tenantSlug, payoutsSurface } = useAdminShell();
  return <PayoutsSectionClient tenantSlug={tenantSlug ?? ""} surface={payoutsSurface} />;
}
