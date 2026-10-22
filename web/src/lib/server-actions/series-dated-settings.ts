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
import type { CapabilityKey } from "@/lib/access";
import { requireNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import { logServerError } from "@/lib/server/safe-error";
import { DEFAULT_POOL_KEY } from "@/lib/sessions/session-plan";
import { MAX_SALES_CLOSE_MINUTES, parseSalesCloseMinutes, parseTierQuotas } from "@/lib/sessions/series-tiers";

const uuid = z.string().uuid();

/**
 * TUL-1708: the capability each action requires, passed to the staff guard itself. The default guard
 * capability is `agency.workspace.view`, which a `viewer` holds, so a writer must name its own.
 * `booking.payment.request` is manager+ (the same bar these series settings always had).
 */
const SERIES_DATED_CAPABILITY = {
  load: "booking.payment.request",
  save: "booking.payment.request",
} as const satisfies Record<string, CapabilityKey>;

async function staff(action: keyof typeof SERIES_DATED_CAPABILITY) {
  const guard = await requireWorkspaceStaffAction({ capability: SERIES_DATED_CAPABILITY[action] });
  if (!guard.ok) return { ok: false as const, reason: guard.error === "Not authorized." ? ("not_allowed" as const) : ("unavailable" as const) };
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
  const g = await staff("load");
  if (!g.ok) return g;

  const { data: base, error: baseErr } = await tenantScopedQuery(g.admin, "session_series", g.tenantId)
    .select("id, offering_id")
    .eq("id", parsed.data.seriesId)
    .maybeSingle();
  if (baseErr) {
    logServerError("series.datedSettings.base", baseErr);
    return { ok: false, reason: "unavailable" };
  }
  if (!base) return { ok: false, reason: "not_found" };
  // The loosely typed select returns `{}`: say what the one selected column is.
  const baseOfferingId = (base as { offering_id?: string | null }).offering_id ?? null;

  // Held-migration columns: ONLY a missing column (42703, migration not applied) reads as
  // "not set". Any other error must not show an empty form: saving it would wipe the settings.
  let salesCloseMinutes: number | null = null;
  let tierQuotas: Record<string, number> = {};
  const { data: extra, error: extraErr } = await tenantScopedQuery(g.admin, "session_series", g.tenantId)
    .select("sales_close_minutes, tier_quotas")
    .eq("id", parsed.data.seriesId)
    .maybeSingle();
  if (extraErr && extraErr.code !== "42703") {
    logServerError("series.datedSettings.columns", extraErr);
    return { ok: false, reason: "unavailable" };
  }
  if (!extraErr && extra) {
    salesCloseMinutes = parseSalesCloseMinutes((extra as { sales_close_minutes?: unknown }).sales_close_minutes);
    tierQuotas = parseTierQuotas((extra as { tier_quotas?: unknown }).tier_quotas) ?? {};
  }

  const tiers: SeriesDatedSettings["tiers"] = [];
  if (baseOfferingId) {
    // Variants have no tenant column of their own: read them through the tenant's offering.
    const { data: offering, error: vErr } = await tenantScopedQuery(g.admin, "talent_offerings", g.tenantId)
      .select("id, talent_offering_variants(label, pool_key, sort_order)")
      .eq("id", baseOfferingId)
      .maybeSingle();
    if (vErr) logServerError("series.datedSettings.tiers", vErr);
    const variants = (
      ((offering as { talent_offering_variants?: Array<{ label?: string; pool_key?: string | null; sort_order?: number | null }> } | null)
        ?.talent_offering_variants ?? [])
    ).slice().sort((a, b) => Number(a.sort_order ?? 0) - Number(b.sort_order ?? 0));
    for (const v of variants) {
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
  const g = await staff("save");
  if (!g.ok) return g;

  const { data, error } = await tenantScopedQuery(g.admin, "session_series", g.tenantId)
    .update({
      sales_close_minutes: parsed.data.salesCloseMinutes,
      tier_quotas: Object.keys(parsed.data.tierQuotas).length > 0 ? parsed.data.tierQuotas : null,
    })
    .eq("id", parsed.data.seriesId)
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
