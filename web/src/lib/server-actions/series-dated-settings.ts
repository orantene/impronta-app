"use server";

/**
 * Dated-places settings of a repeating class (TUL-1344 slice 3): stop selling N
 * minutes before the start, and an optional cap per tier per date.
 *
 * Works with or without the held migration. Reading a missing column answers
 * "not set"; SAVING with the column missing answers `unavailable` honestly
 * rather than pretending it saved. Only the two new columns are written here,
 * so the rest of the series is untouched.
 */

import { z } from "zod";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { userHasCapability } from "@/lib/access";
import { requireNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { logServerError } from "@/lib/server/safe-error";
import { DEFAULT_POOL_KEY } from "@/lib/sessions/session-plan";
import { MAX_SALES_CLOSE_MINUTES, parseSalesCloseMinutes, parseTierQuotas } from "@/lib/sessions/series-tiers";

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

export type SeriesDatedSettings = {
  salesCloseMinutes: number | null;
  tierQuotas: Record<string, number>;
  /** The tiers of the series' item, in display order. Empty: single price. */
  tiers: Array<{ poolKey: string; label: string }>;
};

export async function loadSeriesDatedSettingsAction(input: {
  seriesId: string;
}): Promise<{ ok: true; settings: SeriesDatedSettings } | { ok: false; reason: "invalid" | "unavailable" | "not_allowed" | "not_found" }> {
  const parsed = z.object({ seriesId: uuid }).safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const g = await staff();
  if (!g.ok) return g;

  const { data: base, error: baseErr } = await g.admin
    .from("session_series")
    .select("id, offering_id")
    .eq("id", parsed.data.seriesId)
    .eq("tenant_id", g.tenantId)
    .maybeSingle();
  if (baseErr) {
    logServerError("series.datedSettings.base", baseErr);
    return { ok: false, reason: "unavailable" };
  }
  if (!base) return { ok: false, reason: "not_found" };

  // Held-migration columns: a failed read is "not set", never an error.
  let salesCloseMinutes: number | null = null;
  let tierQuotas: Record<string, number> = {};
  const { data: extra, error: extraErr } = await g.admin
    .from("session_series")
    .select("sales_close_minutes, tier_quotas")
    .eq("id", parsed.data.seriesId)
    .eq("tenant_id", g.tenantId)
    .maybeSingle();
  if (!extraErr && extra) {
    salesCloseMinutes = parseSalesCloseMinutes((extra as { sales_close_minutes?: unknown }).sales_close_minutes);
    tierQuotas = parseTierQuotas((extra as { tier_quotas?: unknown }).tier_quotas) ?? {};
  }

  const tiers: SeriesDatedSettings["tiers"] = [];
  if (base.offering_id) {
    const { data: variants, error: vErr } = await g.admin
      .from("talent_offering_variants")
      .select("label, pool_key, sort_order")
      .eq("offering_id", String(base.offering_id))
      .order("sort_order", { ascending: true });
    if (vErr) logServerError("series.datedSettings.tiers", vErr);
    for (const v of variants ?? []) {
      const key = typeof v.pool_key === "string" ? v.pool_key.trim() : "";
      if (key && key !== DEFAULT_POOL_KEY) tiers.push({ poolKey: key, label: String(v.label ?? key) });
    }
  }
  return { ok: true, settings: { salesCloseMinutes, tierQuotas, tiers } };
}

export async function saveSeriesDatedSettingsAction(input: {
  seriesId: string;
  salesCloseMinutes: number | null;
  tierQuotas: Record<string, number>;
}): Promise<{ ok: true } | { ok: false; reason: "invalid" | "unavailable" | "not_allowed" | "not_found" }> {
  await requireNotImpersonating();
  const parsed = z
    .object({
      seriesId: uuid,
      salesCloseMinutes: z.number().int().min(0).max(MAX_SALES_CLOSE_MINUTES).nullable(),
      tierQuotas: z.record(z.string().min(1).max(60), z.number().int().min(1).max(100_000)),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, reason: "invalid" };
  const g = await staff();
  if (!g.ok) return g;

  const { data, error } = await g.admin
    .from("session_series")
    .update({
      sales_close_minutes: parsed.data.salesCloseMinutes,
      tier_quotas: Object.keys(parsed.data.tierQuotas).length > 0 ? parsed.data.tierQuotas : null,
    })
    .eq("id", parsed.data.seriesId)
    .eq("tenant_id", g.tenantId)
    .select("id")
    .maybeSingle();
  if (error) {
    // Column missing (migration not applied yet) lands here: say so, do not pretend.
    logServerError("series.datedSettings.save", error);
    return { ok: false, reason: "unavailable" };
  }
  if (!data) return { ok: false, reason: "not_found" };
  return { ok: true };
}
