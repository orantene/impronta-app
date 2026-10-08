"use server";

/**
 * Server actions for the "Who pays the card fee" setting (talent side).
 *
 * Storage is `talent_profiles.processing_fee_payer` ('seller' default | 'client'),
 * applied on remote by migration 20261231299600 and read by the commission
 * engine. Reads/writes go through getProcessingFeePayer / setProcessingFeePayer
 * (./processing-fee-payer), the same seam the engine uses. Those helpers do not
 * authorize, so the ownership check (requireTalentSelf) stays here.
 *
 * TODO(engine): workspace-level setting (agencies.processing_fee_payer) needs
 * an owner/admin guard and its own action; not wired in this talent-first slice.
 */

import { assertNotImpersonating } from "@/lib/impersonation/readonly-guard";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { requireTalentSelf } from "@/lib/server/talent-self-guard";
import { logServerError } from "@/lib/server/safe-error";

import type { FeePayer } from "./fee-payer-setting";
import { getProcessingFeePayer, setProcessingFeePayer } from "./processing-fee-payer";

export type SetFeePayerResult =
  | { ok: true; feePayer: FeePayer }
  | { ok: false; error: string };

export async function getFeePayer(): Promise<FeePayer> {
  try {
    const guard = await requireTalentSelf();
    if (!guard.ok) return "seller";
    const admin = createServiceRoleClient() as unknown as SupabaseClient | null;
    if (!admin) return "seller";
    return await getProcessingFeePayer(admin, { kind: "talent", id: guard.talentProfile.id });
  } catch (err) {
    logServerError("billing.getFeePayer", err);
    return "seller";
  }
}

export async function setFeePayer(value: FeePayer): Promise<SetFeePayerResult> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return readOnly;
  try {
    if (value !== "seller" && value !== "client") return { ok: false, error: "invalid_payer" };
    const guard = await requireTalentSelf();
    if (!guard.ok) return { ok: false, error: guard.error };
    const admin = createServiceRoleClient() as unknown as SupabaseClient | null;
    if (!admin) return { ok: false, error: "Server configuration error" };
    const res = await setProcessingFeePayer(admin, { kind: "talent", id: guard.talentProfile.id }, value);
    if (!res.ok) {
      logServerError("billing.setFeePayer", new Error(res.error));
      return { ok: false, error: "Could not save." };
    }
    return { ok: true, feePayer: value };
  } catch (err) {
    logServerError("billing.setFeePayer", err);
    return { ok: false, error: "Unexpected error" };
  }
}
