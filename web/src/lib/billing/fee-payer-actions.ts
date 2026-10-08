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

import type { SupabaseClient } from "@supabase/supabase-js";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { requireTalentSelf } from "@/lib/server/talent-self-guard";
import { logServerError } from "@/lib/server/safe-error";

import type { FeePayer } from "./fee-payer-setting";
import {
  feePreviewConfigFromProcessingModeRow,
  readPlatformProcessingMode,
  type FeePreviewPlatformConfig,
} from "./platform-processing-mode";
import { getProcessingFeePayer, setProcessingFeePayer } from "./processing-fee-payer";

export type SetFeePayerResult =
  | { ok: true; feePayer: FeePayer }
  | { ok: false; error: string };

export type { FeePreviewPlatformConfig };

/**
 * Live platform fee inputs for the settings preview — same
 * `engine_platform_processing_mode` row (+ take floor) the booking engine uses.
 * Returns null when the RPC/rates are missing so the client never invents 150 bps.
 */
export async function getFeePreviewConfig(
  currency: string,
): Promise<FeePreviewPlatformConfig | null> {
  try {
    const guard = await requireTalentSelf();
    if (!guard.ok) return null;
    const admin = createServiceRoleClient() as unknown as SupabaseClient | null;
    if (!admin) return null;

    const row = await readPlatformProcessingMode(admin);
    if (!row) return null;

    // Floor is not on the processing-mode RPC; read the same singleton the
    // engine's platform_config carries so a non-zero floor is previewed too.
    let takeFloorCents = 0;
    try {
      const { data: floorRow } = await admin
        .from("platform_commission_config")
        .select("default_take_floor_cents")
        .eq("singleton_key", true)
        .maybeSingle();
      if (typeof floorRow?.default_take_floor_cents === "number") {
        takeFloorCents = floorRow.default_take_floor_cents;
      }
    } catch {
      /* floor stays 0 — rates/bps still authoritative */
    }

    return feePreviewConfigFromProcessingModeRow(row, currency, takeFloorCents);
  } catch (err) {
    logServerError("billing.getFeePreviewConfig", err);
    return null;
  }
}

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
