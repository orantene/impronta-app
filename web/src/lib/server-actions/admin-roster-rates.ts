"use server";

/**
 * admin-roster-rates.ts — bulk day-rate editing across the whole roster.
 *
 * WHY THIS EXISTS
 * A starting price is the strongest signal a client uses to shortlist, but
 * entering one meant opening each talent's Services tab in turn — 40+ page
 * loads. This edits the HEADLINE rate for every talent from one table.
 *
 * WHY IT WRITES REAL CATALOG ROWS (not a display string)
 * The amount lands on the talent's featured `talent_offerings` row, so it also
 * feeds the inquiry/offer flow and the profile storefront — the same number
 * everywhere. A "cheap" display-only field would have drifted from what a
 * client is actually quoted.
 *
 * SAFETY
 * - capability-gated (`manage_agency_settings`), like every money-adjacent write
 * - every read AND write goes through `tenantScopedQuery`, which applies the
 *   tenant filter itself: `talent_offerings`
 *   is tenant-scoped and a talent can sit on several agencies' rosters with
 *   different negotiated rates (see lib/directory/price-from.ts)
 * - a talent who deliberately publishes "quote on request" is reported as such
 *   and is SKIPPED by writes; the agency has to change that on the profile
 *   itself, not sweep over it from a bulk table
 * - a talent with NO public catalog gets a standard "Day rate" service
 *   CREATED on save (roster-membership re-checked server-side) — the earlier
 *   behaviour dropped the input silently while reporting success
 * - created rates are ALWAYS USD (the product is USD-only per the owner's
 *   2026-07-11 ruling; see feedback_primary_currency_usd) — never derive the
 *   currency from talent/tenant default_currency columns
 * - amounts are bounded, so a fat-fingered 999999 can't publish
 *
 * Eslint note: `.from("agencies")` is the tenants table (its `id` IS the
 * tenant_id) so `tenantScopedQuery` does not model it — same documented
 * exception as admin-pricing-defaults.ts.
 */

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireStaffTenantAction } from "@/lib/saas/admin-scope";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import { AccessDeniedError, requireCapability } from "@/lib/access/has-capability";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import {
  MAX_DEFAULT_PRICE_CENTS,
  MIN_DEFAULT_PRICE_CENTS,
} from "@/lib/directory/pricing-defaults-shape";
import type {
  LoadRosterRatesResult,
  RosterRateRow,
  SaveRosterRatesResult,
} from "@/lib/directory/pricing-defaults-shape";
import { pickHeadlinePrice } from "@/lib/directory/headline-price";

type OfferingRow = {
  id: string;
  talent_profile_id: string;
  title: string | null;
  amount_cents: number | null;
  currency: string | null;
  price_type: string;
  price_display: string;
  is_featured: boolean | null;
  status: string;
  moderation_state: string;
  visibility: string;
};

/** Priced public rows a bulk save may edit (quote/custom stay untouchable). */
function pricedEditableRows(catalog: OfferingRow[]): OfferingRow[] {
  return catalog.filter(
    (o) =>
      o.price_display !== "quote" &&
      o.price_type !== "custom" &&
      ["public", "on_request"].includes(o.visibility),
  );
}

/**
 * The row a save actually writes: featured first, else the cheapest — the
 * same precedence the directory card uses, so editing the number here changes
 * the number a visitor sees.
 */
function resolveSaveTarget(priced: OfferingRow[]): OfferingRow | null {
  const featured = priced.filter((o) => o.is_featured === true);
  return (
    (featured.length > 0 ? featured : priced).sort(
      (a, b) => (a.amount_cents ?? 0) - (b.amount_cents ?? 0),
    )[0] ?? null
  );
}

const changeSchema = z
  .object({
    talentProfileId: z.string().uuid(),
    amountCents: z
      .number()
      .int()
      .min(MIN_DEFAULT_PRICE_CENTS)
      .max(MAX_DEFAULT_PRICE_CENTS),
  })
  .strict();

const saveSchema = z.array(changeSchema).min(1).max(500);

export async function loadRosterRates(): Promise<LoadRosterRatesResult> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, tenantId } = auth;

  const { data: roster, error: rosterErr } = await tenantScopedQuery(
    supabase,
    "agency_talent_roster",
    tenantId,
  )
    .select(
      "talent_profile_id, talent_profiles ( display_name ), status, removed_at",
    )
    .eq("status", "active")
    .is("removed_at", null);

  if (rosterErr || !roster) {
    logServerError("admin-roster-rates.roster", rosterErr);
    return { ok: false, error: CLIENT_ERROR.generic };
  }

  type RosterJoin = {
    talent_profile_id: string;
    talent_profiles:
      | { display_name: string | null }
      | { display_name: string | null }[]
      | null;
  };
  const names = new Map<string, string>();
  for (const row of roster as RosterJoin[]) {
    const tp = Array.isArray(row.talent_profiles)
      ? row.talent_profiles[0]
      : row.talent_profiles;
    names.set(row.talent_profile_id, tp?.display_name ?? "Untitled");
  }
  const ids = [...names.keys()];
  if (ids.length === 0) return { ok: true, rows: [], currency: "USD" };

  // Published catalog for THIS tenant only.
  const { data: offerings } = await tenantScopedQuery(
    supabase,
    "talent_offerings",
    tenantId,
  )
    .select(
      "id, talent_profile_id, title, amount_cents, currency, price_type, price_display, is_featured, status, moderation_state, visibility",
    )
    .in("talent_profile_id", ids)
    .eq("status", "published")
    .eq("moderation_state", "approved");

  const byTalent = new Map<string, OfferingRow[]>();
  for (const row of (offerings ?? []) as OfferingRow[]) {
    const list = byTalent.get(row.talent_profile_id) ?? [];
    list.push(row);
    byTalent.set(row.talent_profile_id, list);
  }

  // Roles, for grouping the table the way an operator thinks about rates.
  const { data: taxonomy } = await tenantScopedQuery(
    supabase,
    "talent_profile_taxonomy",
    tenantId,
  )
    .select("talent_profile_id, taxonomy_terms ( kind, name_i18n )")
    .eq("is_primary", true);

  const roles = new Map<string, string>();
  for (const row of (taxonomy ?? []) as Array<{
    talent_profile_id: string;
    taxonomy_terms:
      | { kind: string; name_i18n: Record<string, string | null> | null }
      | Array<{ kind: string; name_i18n: Record<string, string | null> | null }>
      | null;
  }>) {
    const terms = row.taxonomy_terms
      ? Array.isArray(row.taxonomy_terms)
        ? row.taxonomy_terms
        : [row.taxonomy_terms]
      : [];
    for (const term of terms) {
      if (term?.kind === "talent_type" && term.name_i18n?.en) {
        roles.set(row.talent_profile_id, term.name_i18n.en);
      }
    }
  }

  const rows: RosterRateRow[] = ids.map((id) => {
    const catalog = byTalent.get(id) ?? [];
    const publicRows = catalog.filter((o) =>
      ["public", "on_request"].includes(o.visibility),
    );
    const headline = pickHeadlinePrice(
      publicRows
        .filter(
          (o) =>
            o.price_display !== "quote" &&
            o.price_type !== "custom" &&
            typeof o.amount_cents === "number" &&
            o.amount_cents > 0,
        )
        .map((o) => ({
          amountCents: o.amount_cents as number,
          currency: (o.currency ?? "USD").toUpperCase(),
          priceType: o.price_type,
          isFeatured: o.is_featured === true,
        })),
    );
    // Deliberate "ask me": they published services but withheld every number.
    const quoteOnly =
      headline === null &&
      publicRows.some(
        (o) =>
          o.price_display === "quote" ||
          o.price_type === "custom" ||
          o.amount_cents == null ||
          o.amount_cents === 0,
      );
    const target = resolveSaveTarget(pricedEditableRows(catalog));
    return {
      talentProfileId: id,
      displayName: names.get(id) ?? "Untitled",
      roleLabel: roles.get(id) ?? null,
      headlineCents: headline?.amountCents ?? null,
      // USD-only product (owner ruling 2026-07-11, reaffirmed 2026-08-06):
      // an unpriced row is always labelled — and later created — in USD.
      // Existing priced rows keep their stored currency (all USD in prod).
      currency: headline?.currency ?? "USD",
      quoteOnly,
      targetTitle: target?.title ?? null,
      // No public catalog at all → a save CREATES a "Day rate" service.
      // (Quote-only talents have public rows, so they can never hit this.)
      willCreate: publicRows.length === 0,
    };
  });

  rows.sort(
    (a, b) =>
      (a.roleLabel ?? "zzz").localeCompare(b.roleLabel ?? "zzz") ||
      a.displayName.localeCompare(b.displayName),
  );
  return { ok: true, rows, currency: rows[0]?.currency ?? "USD" };
}

export async function saveRosterRates(
  changes: { talentProfileId: string; amountCents: number }[],
): Promise<SaveRosterRatesResult> {
  const auth = await requireStaffTenantAction();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { tenantId, tenantSlug } = auth;

  const parsed = saveSchema.safeParse(changes);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid rate change.",
    };
  }

  try {
    await requireCapability("manage_agency_settings", tenantId);
  } catch (err) {
    if (err instanceof AccessDeniedError) {
      return { ok: false, error: "You don't have permission to change this." };
    }
    throw err;
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    logServerError("admin-roster-rates.service-role", null);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  const ids = parsed.data.map((c) => c.talentProfileId);
  // Re-read inside the tenant scope: never trust the client about which
  // offering row belongs to which talent, or to this agency.
  const { data: offerings, error: readErr } = await tenantScopedQuery(
    admin,
    "talent_offerings",
    tenantId,
  )
    .select(
      "id, talent_profile_id, title, amount_cents, currency, price_type, price_display, is_featured, status, moderation_state, visibility",
    )
    .in("talent_profile_id", ids)
    .eq("status", "published")
    .eq("moderation_state", "approved");

  if (readErr) {
    logServerError("admin-roster-rates.read", readErr);
    return { ok: false, error: CLIENT_ERROR.update };
  }

  const byTalent = new Map<string, OfferingRow[]>();
  for (const row of (offerings ?? []) as OfferingRow[]) {
    const list = byTalent.get(row.talent_profile_id) ?? [];
    list.push(row);
    byTalent.set(row.talent_profile_id, list);
  }

  // Membership check for creates: only talents on THIS tenant's active roster
  // may receive a new catalog row (mirrors the loadRosterRates population).
  const { data: rosterRows } = await tenantScopedQuery(
    admin,
    "agency_talent_roster",
    tenantId,
  )
    .select("talent_profile_id")
    .in("talent_profile_id", ids)
    .eq("status", "active")
    .is("removed_at", null);
  const onRoster = new Set(
    ((rosterRows ?? []) as { talent_profile_id: string }[]).map(
      (r) => r.talent_profile_id,
    ),
  );

  let updated = 0;
  let created = 0;
  for (const change of parsed.data) {
    const catalog = byTalent.get(change.talentProfileId) ?? [];
    const publicRows = catalog.filter((o) =>
      ["public", "on_request"].includes(o.visibility),
    );
    const priced = pricedEditableRows(catalog);

    if (priced.length === 0) {
      // Quote-only stays their call: they published services and deliberately
      // withheld every number — a bulk table never overrides that.
      if (publicRows.length > 0) continue;
      if (!onRoster.has(change.talentProfileId)) continue;

      // No public catalog at all. The old behaviour silently dropped the
      // input (the admin saw "Saved" while nothing happened). Create the
      // standard "Day rate" service instead — same defaults the storefront
      // and directory already understand (published/public/approved).
      // tenantScopedQuery forces tenant_id onto the inserted row.
      const { error: insErr } = await tenantScopedQuery(
        admin,
        "talent_offerings",
        tenantId,
      ).insert({
        talent_profile_id: change.talentProfileId,
        kind: "service",
        title: "Day rate",
        title_i18n: { en: "Day rate", es: "Tarifa por día" },
        price_type: "day",
        price_display: "exact",
        amount_cents: change.amountCents,
        // USD-only product (owner ruling 2026-07-11, reaffirmed 2026-08-06
        // after this path briefly honoured talent_profiles.default_currency —
        // whose DDL default was the buggy 'EUR', fixed in migration
        // 20260806151524). Created rates are always dollars.
        currency: "USD",
        sort_order: 0,
      });
      if (insErr) {
        logServerError("admin-roster-rates.insert", insErr);
        return { ok: false, error: CLIENT_ERROR.update };
      }
      created += 1;
      continue;
    }

    const target = resolveSaveTarget(priced);
    if (!target) continue;

    // tenantScopedQuery applies the tenant filter itself, so a row from
    // another agency's catalog can never be reached even by id.
    const { error } = await tenantScopedQuery(admin, "talent_offerings", tenantId)
      .update({
        amount_cents: change.amountCents,
        updated_at: new Date().toISOString(),
      })
      .eq("id", target.id);

    if (error) {
      logServerError("admin-roster-rates.update", error);
      return { ok: false, error: CLIENT_ERROR.update };
    }
    updated += 1;
  }

  revalidatePath(`/${tenantSlug}`, "layout");
  return { ok: true, updated, created };
}
