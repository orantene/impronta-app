"use server";

/**
 * Read and save the info fields of an item sold as dated places (TUL-1344
 * slice 5). Tenant staff only; the item must belong to the caller's workspace.
 * Saving before the held migration is applied answers `unavailable` honestly.
 */

import { z } from "zod";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { userHasCapability } from "@/lib/access";
import { requireNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { logServerError } from "@/lib/server/safe-error";
import { parseDatedDetails, sanitizeDatedDetails, type DatedDetails } from "@/lib/offerings/dated-details";

const uuid = z.string().uuid();

async function staff() {
  const guard = await requireWorkspaceStaffAction();
  if (!guard.ok) return { ok: false as const, reason: "unavailable" as const };
  const allowed = await userHasCapability("booking.payment.request", guard.tenantId);
  if (!allowed) return { ok: false as const, reason: "not_allowed" as const };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false as const, reason: "unavailable" as const };
  return { ok: true as const, tenantId: guard.tenantId, admin };
}

type Refusal = { ok: false; reason: "invalid" | "unavailable" | "not_allowed" | "not_found" };

export async function loadDatedDetailsAction(input: {
  offeringId: string;
}): Promise<({ ok: true; details: DatedDetails; privateOnRequest: boolean }) | Refusal> {
  const parsed = z.object({ offeringId: uuid }).safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const g = await staff();
  if (!g.ok) return g;
  const { data: own, error: ownErr } = await g.admin
    .from("talent_offerings")
    .select("id")
    .eq("id", parsed.data.offeringId)
    .eq("tenant_id", g.tenantId)
    .maybeSingle();
  if (ownErr) {
    logServerError("datedDetails.load.own", ownErr);
    return { ok: false, reason: "unavailable" };
  }
  if (!own) return { ok: false, reason: "not_found" };
  // Held-migration columns: a failed read is "not set".
  const { data, error } = await g.admin
    .from("talent_offerings")
    .select("dated_details_i18n, private_on_request")
    .eq("id", parsed.data.offeringId)
    .eq("tenant_id", g.tenantId)
    .maybeSingle();
  if (error || !data) return { ok: true, details: {}, privateOnRequest: false };
  return {
    ok: true,
    details: parseDatedDetails((data as { dated_details_i18n?: unknown }).dated_details_i18n),
    privateOnRequest: (data as { private_on_request?: unknown }).private_on_request === true,
  };
}

export async function saveDatedDetailsAction(input: {
  offeringId: string;
  details: unknown;
  privateOnRequest: boolean;
}): Promise<{ ok: true } | Refusal> {
  await requireNotImpersonating();
  const parsed = z.object({ offeringId: uuid, details: z.unknown(), privateOnRequest: z.boolean() }).safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const g = await staff();
  if (!g.ok) return g;
  const { data, error } = await g.admin
    .from("talent_offerings")
    .update({
      dated_details_i18n: sanitizeDatedDetails(parsed.data.details),
      private_on_request: parsed.data.privateOnRequest,
    })
    .eq("id", parsed.data.offeringId)
    .eq("tenant_id", g.tenantId)
    .select("id")
    .maybeSingle();
  if (error) {
    // Column missing (migration not applied yet) lands here: say so, do not pretend.
    logServerError("datedDetails.save", error);
    return { ok: false, reason: "unavailable" };
  }
  if (!data) return { ok: false, reason: "not_found" };
  return { ok: true };
}
