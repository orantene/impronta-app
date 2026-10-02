"use server";

/**
 * Server actions for the "Who pays the card fee" setting (talent side).
 *
 * Storage is `talent_profiles.processing_fee_payer` ('seller' default | 'client'),
 * applied on remote by migration 20261231299600 and read by the commission
 * engine. This is the single seam: when the engine branch merges, swap the two
 * direct queries for getProcessingFeePayer / setProcessingFeePayer from
 * ./processing-fee-payer with the same signatures. Those helpers do not
 * authorize, so the ownership check (requireTalentSelf) stays here.
 *
 * TODO(engine): workspace-level setting (agencies.processing_fee_payer) needs
 * an owner/admin guard and its own action; not wired in this talent-first slice.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { requireTalentSelf } from "@/lib/server/talent-self-guard";
import { logServerError } from "@/lib/server/safe-error";

import type { FeePayer } from "./fee-payer-setting";

export type SetFeePayerResult =
  | { ok: true; feePayer: FeePayer }
  | { ok: false; error: string };

/** Anything that is not exactly 'client' is the default 'seller'. */
function parse(v: unknown): FeePayer {
  return v === "client" ? "client" : "seller";
}

export async function getFeePayer(): Promise<FeePayer> {
  try {
    const guard = await requireTalentSelf();
    if (!guard.ok) return "seller";
    const admin = createServiceRoleClient() as unknown as SupabaseClient | null;
    if (!admin) return "seller";
    const { data } = await admin
      .from("talent_profiles")
      .select("processing_fee_payer")
      .eq("id", guard.talentProfile.id)
      .maybeSingle();
    return parse((data as { processing_fee_payer?: unknown } | null)?.processing_fee_payer);
  } catch (err) {
    logServerError("billing.getFeePayer", err);
    return "seller";
  }
}

export async function setFeePayer(value: FeePayer): Promise<SetFeePayerResult> {
  try {
    if (value !== "seller" && value !== "client") return { ok: false, error: "invalid_payer" };
    const guard = await requireTalentSelf();
    if (!guard.ok) return { ok: false, error: guard.error };
    const admin = createServiceRoleClient() as unknown as SupabaseClient | null;
    if (!admin) return { ok: false, error: "Server configuration error" };
    const { error } = await admin
      .from("talent_profiles")
      .update({ processing_fee_payer: value })
      .eq("id", guard.talentProfile.id);
    if (error) {
      logServerError("billing.setFeePayer", error);
      return { ok: false, error: "Could not save." };
    }
    return { ok: true, feePayer: value };
  } catch (err) {
    logServerError("billing.setFeePayer", err);
    return { ok: false, error: "Unexpected error" };
  }
}
