import "server-only";

import { logServerError } from "@/lib/server/safe-error";

type Admin = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

export type PolicyOverrideRow = {
  depositBps: number | null;
  cancelFreeHours: number | null;
  noShowFeeCents: number | null;
};

export async function readPolicyOverride(
  admin: Admin,
  input: { tenantId: string; offeringId: string },
): Promise<{ ok: true; row: PolicyOverrideRow | null } | { ok: false; reason: "unavailable" }> {
  const { data, error } = await admin
    .from("booking_policy_overrides")
    .select("deposit_bps, cancel_free_hours, no_show_fee_cents")
    .eq("tenant_id", input.tenantId)
    .eq("offering_id", input.offeringId)
    .maybeSingle();
  if (error) {
    logServerError("bookings.readPolicyOverride", error);
    return { ok: false, reason: "unavailable" };
  }
  if (!data) return { ok: true, row: null };
  const row = data as {
    deposit_bps: number | null;
    cancel_free_hours: number | null;
    no_show_fee_cents: number | null;
  };
  return {
    ok: true,
    row: {
      depositBps: row.deposit_bps,
      cancelFreeHours: row.cancel_free_hours,
      noShowFeeCents: row.no_show_fee_cents,
    },
  };
}

export async function writePolicyOverride(
  admin: Admin,
  input: {
    tenantId: string;
    offeringId: string;
    depositBps?: number | null;
    cancelFreeHours?: number | null;
    noShowFeeCents?: number | null;
  },
): Promise<{ ok: true } | { ok: false; reason: "invalid" | "unavailable" }> {
  if (input.depositBps != null && (!Number.isInteger(input.depositBps) || input.depositBps < 0 || input.depositBps > 10000)) {
    return { ok: false, reason: "invalid" };
  }
  if (input.cancelFreeHours != null && (!Number.isInteger(input.cancelFreeHours) || input.cancelFreeHours < 0)) {
    return { ok: false, reason: "invalid" };
  }
  if (input.noShowFeeCents != null && (!Number.isInteger(input.noShowFeeCents) || input.noShowFeeCents < 0)) {
    return { ok: false, reason: "invalid" };
  }
  const { error } = await admin.from("booking_policy_overrides").upsert(
    {
      tenant_id: input.tenantId,
      offering_id: input.offeringId,
      deposit_bps: input.depositBps ?? null,
      cancel_free_hours: input.cancelFreeHours ?? null,
      no_show_fee_cents: input.noShowFeeCents ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "tenant_id, offering_id" },
  );
  if (error) {
    logServerError("bookings.writePolicyOverride", error);
    return { ok: false, reason: "unavailable" };
  }
  return { ok: true };
}

export function depositCentsFromBps(totalCents: number, depositBps: number | null | undefined): number | null {
  if (depositBps == null || !Number.isInteger(depositBps) || depositBps < 0) return null;
  return Math.floor((Math.max(0, Math.trunc(totalCents)) * depositBps) / 10000);
}
