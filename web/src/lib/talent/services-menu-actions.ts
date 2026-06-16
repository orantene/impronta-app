"use server";

/**
 * Talent services menu — load / save actions (S3, S20). Wave: services-menu.
 *
 * CONFIGURATION ONLY. Reads/writes talent_profiles.services_menu jsonb
 * (ServiceMenuItem[]). Does NOT charge a card or alter offer/booking math — a
 * selected service later PRE-FILLS an offer line through the existing rail.
 *
 * Authorization mirrors talent-booking-terms-actions.ts: a read/write is allowed
 * when the caller is EITHER (a) the talent (talent_profiles.user_id === session
 * user) OR (b) agency staff editing on their behalf. Backs both the talent-self
 * Settings card and the admin profile-editor drawer.
 *
 * A "use server" module exports ONLY async functions — shared types + the
 * normaliser live in @/lib/talent/services-menu-types.
 */

import { revalidatePath } from "next/cache";
import {
  normalizeServicesMenu,
  validateServicesMenu,
  type ServiceMenuItem,
} from "@/lib/talent/services-menu-types";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { isStaffRole } from "@/lib/auth-flow";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import {
  syncBlobFieldValuesToCatalog,
  readBlobFieldValuesFromCatalog,
} from "@/lib/talent/blob-field-values-catalog";
import { resolveDefaultCurrencyForUI } from "@/lib/billing/currencies";
import {
  legacyToServiceMenuItems,
  hasImportableLegacy,
  parsePackageTeasers,
  type LegacyRateSources,
} from "@/lib/talent/services-menu-legacy";
import { parseTalentBookingTerms } from "@/lib/billing/commercial-terms";

type AuthResult =
  | {
      ok: true;
      supabase: NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;
      userId: string;
      isStaff: boolean;
      defaultCurrency: string;
      /** The talent's active-roster tenant — the scope under which the catalog
       *  value row is written. null for an independent (no-roster) talent →
       *  the dual-write SKIPs and the column stays the source. */
      tenantId: string | null;
    }
  | { ok: false; error: string };

/** Owner (user_id match) OR staff. Returns an RLS-bound client for reads + the
 *  talent's active-roster tenant for the catalog dual-write. */
async function authorizeForTalent(talentProfileId: string): Promise<AuthResult> {
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false, error: "Not authenticated." };

  const supabase = await createSupabaseServerClient();
  if (!supabase) return { ok: false, error: "Database unavailable." };

  const { data: tp, error } = await supabase
    .from("talent_profiles")
    .select("id, user_id, default_currency")
    .eq("id", talentProfileId)
    .maybeSingle();

  if (error || !tp) {
    if (error) logServerError("talent.servicesMenu.authorize", error);
    return { ok: false, error: "Profile not found." };
  }

  const isStaff = !!session.profile && isStaffRole(session.profile.app_role);
  const isOwner = tp.user_id === session.user.id;
  if (!isOwner && !isStaff) return { ok: false, error: "Forbidden." };

  // Resolve the active-roster tenant (service-role, so RLS edges don't hide the
  // row) — the catalog value is scoped to it, like every other Tier-B blob.
  let tenantId: string | null = null;
  const admin = createServiceRoleClient();
  if (admin) {
    const { data: rosterRows } = await admin
      .from("agency_talent_roster")
      .select("tenant_id, is_primary")
      .eq("talent_profile_id", talentProfileId)
      .eq("status", "active");
    const rows = (rosterRows ?? []) as { tenant_id: string; is_primary: boolean }[];
    rows.sort((a, b) => Number(b.is_primary) - Number(a.is_primary));
    tenantId = rows[0]?.tenant_id ?? null;
  }

  return {
    ok: true,
    supabase,
    userId: session.user.id,
    isStaff,
    defaultCurrency: resolveDefaultCurrencyForUI(tp.default_currency),
    tenantId,
  };
}

/** A talent discipline (talent_type taxonomy term) for per-service scoping (S6). */
export type TalentDiscipline = { id: string; label: string };

/**
 * The talent's talent_type taxonomy terms (their disciplines), for the editor's
 * per-service scoping picker. Deduped by term id, labelled by name_en.
 */
async function loadTalentDisciplines(
  admin: NonNullable<ReturnType<typeof createServiceRoleClient>>,
  talentProfileId: string,
): Promise<TalentDiscipline[]> {
  // name_en folded into name_i18n {en,es} (WS4); label off the English value.
  const { data } = await admin
    .from("talent_profile_taxonomy")
    .select("taxonomy_terms:taxonomy_term_id ( id, name_i18n, kind, term_type )")
    .eq("talent_profile_id", talentProfileId);
  type Term = {
    id: string;
    name_i18n: Record<string, string | null> | null;
    kind: string | null;
    term_type: string | null;
  };
  const rows = (data ?? []) as { taxonomy_terms: Term | Term[] | null }[];
  const out = new Map<string, string>();
  for (const r of rows) {
    const terms = Array.isArray(r.taxonomy_terms)
      ? r.taxonomy_terms
      : r.taxonomy_terms
        ? [r.taxonomy_terms]
        : [];
    for (const t of terms) {
      const nameEn = t?.name_i18n?.en ?? null;
      if (!t?.id || !nameEn) continue;
      if (t.kind === "talent_type" || t.term_type === "talent_type") out.set(t.id, nameEn);
    }
  }
  return [...out].map(([id, label]) => ({ id, label }));
}

/** Read the talent's legacy rate columns into the mapper's input shape (S11). */
async function readLegacyRateSources(
  admin: NonNullable<ReturnType<typeof createServiceRoleClient>>,
  talentProfileId: string,
  currency: string,
): Promise<LegacyRateSources> {
  const { data } = await admin
    .from("talent_profiles")
    .select("package_teasers, booking_terms")
    .eq("id", talentProfileId)
    .maybeSingle();
  const row = (data ?? {}) as { package_teasers?: unknown; booking_terms?: unknown };
  const terms = parseTalentBookingTerms(row.booking_terms ?? null);
  return {
    packageTeasers: parsePackageTeasers(row.package_teasers),
    fixedRateCents: terms?.fixedRateCents ?? null,
    currency,
  };
}

type LoadResult =
  | {
      ok: true;
      items: ServiceMenuItem[];
      defaultCurrency: string;
      disciplines: TalentDiscipline[];
      /** S11 — menu is empty AND legacy rate data exists, so an import is offered. */
      legacyImportable: boolean;
    }
  | { ok: false; error: string };

/** Load the talent's services menu (normalized). */
export async function loadTalentServicesMenu(talentProfileId: string): Promise<LoadResult> {
  try {
    const auth = await authorizeForTalent(talentProfileId);
    if (!auth.ok) return { ok: false, error: auth.error };

    // Catalog is the live source (commerce.servicesMenu, storage_mode
    // 'field_values'); the dedicated column is the safety-net fallback via ??.
    const catalog = await readBlobFieldValuesFromCatalog(auth.supabase, talentProfileId);

    // services_menu may be unknown to the generated row type until the next
    // regen — assert the shape.
    const { data, error } = await auth.supabase
      .from("talent_profiles")
      .select("services_menu")
      .eq("id", talentProfileId)
      .returns<{ services_menu: unknown }[]>()
      .maybeSingle();

    if (error) {
      logServerError("talent.servicesMenu.load", error);
      return { ok: false, error: "Could not load services." };
    }

    const raw = catalog.services_menu ?? data?.services_menu;
    const items = normalizeServicesMenu(raw, auth.defaultCurrency);
    // S6 — the talent's disciplines, for the editor's per-service scoping picker.
    const admin = createServiceRoleClient();
    const disciplines = admin ? await loadTalentDisciplines(admin, talentProfileId) : [];
    // S11 — offer a legacy import only when the menu is empty and there's
    // something to import (a fixed rate or named package teasers).
    let legacyImportable = false;
    if (admin && items.length === 0) {
      legacyImportable = hasImportableLegacy(
        await readLegacyRateSources(admin, talentProfileId, auth.defaultCurrency),
      );
    }
    return {
      ok: true,
      items,
      defaultCurrency: auth.defaultCurrency,
      disciplines,
      legacyImportable,
    };
  } catch (err) {
    logServerError("talent.servicesMenu.load", err);
    return { ok: false, error: "Unexpected error." };
  }
}

type UpdateResult = { ok: true; items: ServiceMenuItem[] } | { ok: false; error: string };

/**
 * Persist the talent's services menu. Normalizes + validates (S20) before the
 * service-role write (the talent may lack RLS update on every column; staff
 * writes are gated above).
 */
export async function updateTalentServicesMenu(
  talentProfileId: string,
  items: ServiceMenuItem[],
): Promise<UpdateResult> {
  try {
    const auth = await authorizeForTalent(talentProfileId);
    if (!auth.ok) return { ok: false, error: auth.error };

    const clean = normalizeServicesMenu(items, auth.defaultCurrency);
    const errors = validateServicesMenu(clean);
    if (errors.length > 0) return { ok: false, error: errors[0] };

    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Server configuration error." };

    const patch = {
      services_menu: clean,
      updated_at: new Date().toISOString(),
    } as unknown as Record<string, never>;

    const { error } = await admin.from("talent_profiles").update(patch).eq("id", talentProfileId);

    if (error) {
      logServerError("talent.servicesMenu.update", error);
      return { ok: false, error: "Failed to save services." };
    }

    // Dual-write into the catalog (commerce.servicesMenu) so the services menu
    // lives in the field-engine like every other Tier-B blob — one source of
    // truth. Fire-and-forget (mirrors updateTalentRates); skips for an
    // independent talent (tenantId null), where the column stays the source.
    await syncBlobFieldValuesToCatalog(admin, talentProfileId, auth.tenantId, {
      services_menu: clean,
    });

    revalidatePath("/talent/settings");
    revalidatePath(`/admin/talent/${talentProfileId}`);
    return { ok: true, items: clean };
  } catch (err) {
    logServerError("talent.servicesMenu.update", err);
    return { ok: false, error: "Unexpected error." };
  }
}

/**
 * S11 — one-shot import of the talent's legacy rate data (fixed rate + package
 * teasers) into the services menu. Idempotent + non-destructive: refuses when
 * the menu already has items, so it can never clobber a hand-authored menu.
 * Goes through updateTalentServicesMenu, so the imported items get the same
 * normalize + validate + dual-write treatment.
 */
export async function importLegacyServicesMenu(talentProfileId: string): Promise<UpdateResult> {
  try {
    const auth = await authorizeForTalent(talentProfileId);
    if (!auth.ok) return { ok: false, error: auth.error };

    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Server configuration error." };

    // Guard: never overwrite an existing menu.
    const existing = await loadTalentServicesMenu(talentProfileId);
    if (existing.ok && existing.items.length > 0) {
      return { ok: false, error: "Your menu already has services — import skipped." };
    }

    const sources = await readLegacyRateSources(admin, talentProfileId, auth.defaultCurrency);
    const mapped = legacyToServiceMenuItems(sources);
    if (mapped.length === 0) return { ok: false, error: "Nothing to import." };

    return await updateTalentServicesMenu(talentProfileId, mapped);
  } catch (err) {
    logServerError("talent.servicesMenu.importLegacy", err);
    return { ok: false, error: "Unexpected error." };
  }
}

/** Per-service performance counts (consumes the S18 source_service_id stamp). */
export type ServicePerformanceStat = { timesQuoted: number; timesBooked: number };
type ServicePerformanceResult =
  | { ok: true; stats: Record<string, ServicePerformanceStat> }
  | { ok: false; error: string };

/**
 * "Which services book best" — aggregates the talent's offer line items by the
 * S18 source_service_id stamp. timesQuoted = line items prefilled from that
 * service; timesBooked = those whose inquiry produced an agency_bookings row
 * (the ground-truth conversion signal via source_inquiry_id). Counts only:
 * line items carry no currency (the offer does), so a cross-currency gross sum
 * would mislead. Read-only; authorized like the menu (owner or staff).
 */
export async function loadTalentServicePerformance(
  talentProfileId: string,
): Promise<ServicePerformanceResult> {
  try {
    const auth = await authorizeForTalent(talentProfileId);
    if (!auth.ok) return { ok: false, error: auth.error };

    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Server configuration error." };

    // Stamped line items for this talent, with their inquiry id (via the offer).
    // Owner (the talent) sees the aggregate across all their agencies; a STAFF
    // viewer is scoped to their own tenant so cross-tenant counts don't leak in
    // the admin profile drawer (skip when tenantId is null = independent talent).
    let q = admin
      .from("inquiry_offer_line_items")
      .select("source_service_id, inquiry_offers!inner ( inquiry_id )")
      .eq("talent_profile_id", talentProfileId)
      .not("source_service_id", "is", null);
    if (auth.isStaff && auth.tenantId) q = q.eq("tenant_id", auth.tenantId);
    const { data: lineRows, error: liErr } = await q;
    if (liErr) {
      logServerError("talent.servicesMenu.performance", liErr);
      return { ok: false, error: "Could not load performance." };
    }

    type Row = {
      source_service_id: string | null;
      inquiry_offers: { inquiry_id: string | null } | { inquiry_id: string | null }[] | null;
    };
    const rows = (lineRows ?? []) as Row[];
    const inquiryIdOf = (r: Row): string | null => {
      const o = Array.isArray(r.inquiry_offers) ? r.inquiry_offers[0] : r.inquiry_offers;
      return o?.inquiry_id ?? null;
    };

    // Which of those inquiries actually became bookings.
    const inquiryIds = [...new Set(rows.map(inquiryIdOf).filter((x): x is string => Boolean(x)))];
    const bookedInquiryIds = new Set<string>();
    if (inquiryIds.length > 0) {
      const { data: bookings } = await admin
        .from("agency_bookings")
        .select("source_inquiry_id")
        .in("source_inquiry_id", inquiryIds);
      for (const b of (bookings ?? []) as { source_inquiry_id: string | null }[]) {
        if (b.source_inquiry_id) bookedInquiryIds.add(b.source_inquiry_id);
      }
    }

    const stats: Record<string, ServicePerformanceStat> = {};
    for (const r of rows) {
      const sid = r.source_service_id;
      if (!sid) continue;
      const stat = (stats[sid] ??= { timesQuoted: 0, timesBooked: 0 });
      stat.timesQuoted += 1;
      const inqId = inquiryIdOf(r);
      if (inqId && bookedInquiryIds.has(inqId)) stat.timesBooked += 1;
    }

    return { ok: true, stats };
  } catch (err) {
    logServerError("talent.servicesMenu.performance", err);
    return { ok: false, error: "Unexpected error." };
  }
}
