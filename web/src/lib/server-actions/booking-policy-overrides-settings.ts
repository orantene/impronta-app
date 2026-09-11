"use server";

/**
 * Settings › Booking policies › Per-item overrides (W24, Package 2).
 *
 * The read: the workspace's own items (`talent_offerings`, owner_kind
 * workspace) beside the override each carries (`booking_policy_overrides`).
 * The write is the engine's `writePolicyOverrideAction`, never re-exported
 * from here. Staff-guarded and tenant-scoped; a failure is a reason code.
 */

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { logServerError } from "@/lib/server/safe-error";

export type PolicyOverrideItem = {
  offeringId: string;
  title: string;
  kind: string;
  depositBps: number | null;
  cancelFreeHours: number | null;
  noShowFeeCents: number | null;
  currency: string;
};

export async function loadPolicyOverridesAction(): Promise<
  { ok: true; items: PolicyOverrideItem[] } | { ok: false; reason: "not_allowed" | "unavailable" }
> {
  const staff = await requireWorkspaceStaffAction();
  if (!staff.ok) return { ok: false, reason: "not_allowed" };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, reason: "unavailable" };
  const [offerings, overrides] = await Promise.all([
    admin
      .from("talent_offerings")
      .select("id, title, kind, currency")
      .eq("tenant_id", staff.tenantId)
      .eq("owner_kind", "workspace")
      .neq("kind", "product")
      .order("title", { ascending: true }),
    admin
      .from("booking_policy_overrides")
      .select("offering_id, deposit_bps, cancel_free_hours, no_show_fee_cents")
      .eq("tenant_id", staff.tenantId),
  ]);
  if (offerings.error || overrides.error) {
    logServerError("settings.loadPolicyOverrides", offerings.error ?? overrides.error);
    return { ok: false, reason: "unavailable" };
  }
  const byOffering = new Map(
    ((overrides.data ?? []) as Array<{
      offering_id: string;
      deposit_bps: number | null;
      cancel_free_hours: number | null;
      no_show_fee_cents: number | null;
    }>).map((r) => [r.offering_id, r]),
  );
  const items = ((offerings.data ?? []) as Array<{ id: string; title: string | null; kind: string; currency: string | null }>).map((o) => {
    const row = byOffering.get(o.id);
    return {
      offeringId: o.id,
      title: o.title ?? "",
      kind: o.kind,
      depositBps: row?.deposit_bps ?? null,
      cancelFreeHours: row?.cancel_free_hours ?? null,
      noShowFeeCents: row?.no_show_fee_cents ?? null,
      currency: (o.currency ?? "USD").toUpperCase(),
    };
  });
  return { ok: true, items };
}
