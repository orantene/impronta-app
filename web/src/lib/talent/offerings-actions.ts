"use server";

/**
 * Talent Services (storefront) — load/save server actions.
 *
 * CONFIGURATION ONLY. Reads/writes `talent_offerings` (+ media join). Never
 * charges anything — money flows through the inquiry/offer/booking rail.
 *
 * Authorization mirrors services-menu-actions: allowed when the caller is
 * EITHER (a) the talent (talent_profiles.user_id === session user) OR
 * (b) agency staff editing on their behalf. Backs the talent Services tab
 * and the admin profile-drawer mount. Writes are service-role (RLS on the
 * table is read-only for anon/owner); auth is enforced here at the app layer.
 */

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  rowToOffering,
  offeringToRowPatch,
  validateOffering,
  type TalentOffering,
  type TalentOfferingRow,
} from "@/lib/talent/offerings-types";
import { normalizeServicesMenu } from "@/lib/talent/services-menu-types";
import { loadOfferingChildren, MAX_OPTIONS_PER_OFFERING } from "@/lib/talent/offerings-children";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { resolveDefaultCurrencyForUI } from "@/lib/billing/currencies";
import { readBlobFieldValuesFromCatalog } from "@/lib/talent/blob-field-values-catalog";
import { parseTalentBookingTerms } from "@/lib/billing/commercial-terms";
import { parsePackageTeasers } from "@/lib/talent/services-menu-legacy";

/**
 * Untyped write surface for talent_offerings (+ media join). The tables ARE in
 * database.types now, but the hand-written write shape (offeringToRowPatch,
 * `attributes: Record<string, unknown>`) doesn't line up with the generated
 * Insert type (`attributes: Json`), so these wrappers keep one deliberate cast
 * instead of scattering per-call casts. validateOffering + the DB CHECKs guard
 * correctness; read typing lives in rowToOffering.
 */
function offeringsTable(client: unknown) {
  return (client as SupabaseClient).from("talent_offerings");
}
function offeringMediaTable(client: unknown) {
  return (client as SupabaseClient).from("talent_offering_media");
}

type AuthResult =
  | {
      ok: true;
      userId: string;
      isStaff: boolean;
      defaultCurrency: string;
      tenantId: string | null;
    }
  | { ok: false; error: string };

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
    if (error) logServerError("talent.offerings.authorize", error);
    return { ok: false, error: "Profile not found." };
  }

  const isOwner = tp.user_id === session.user.id;

  // Prefer the active workspace when the actor is staff/owner there and the
  // talent is on that roster. is_primary-first inference would pin a studio
  // owner's new offerings to their exclusive agency.
  const staff = await requireWorkspaceStaffAction();
  let isStaff = false;
  let staffTenantId: string | null = null;
  if (staff.ok) {
    const adminForCheck = createServiceRoleClient();
    if (!adminForCheck) return { ok: false, error: "Server configuration error." };
    const { data: rosterRow } = await adminForCheck
      .from("agency_talent_roster")
      .select("id")
      .eq("tenant_id", staff.tenantId)
      .eq("talent_profile_id", talentProfileId)
      .neq("status", "removed")
      .maybeSingle();
    if (rosterRow) {
      isStaff = !isOwner;
      staffTenantId = staff.tenantId;
    } else if (!isOwner) {
      return { ok: false, error: "Talent not on this roster." };
    }
  } else if (!isOwner) {
    return { ok: false, error: "Forbidden." };
  }

  let tenantId: string | null = staffTenantId;
  const admin = createServiceRoleClient();
  if (admin && !tenantId) {
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
    userId: session.user.id,
    isStaff,
    defaultCurrency: resolveDefaultCurrencyForUI(tp.default_currency),
    tenantId,
  };
}

/** Resolve hero-first image URLs for a set of offerings in one query. */
async function loadImageAssets(
  admin: NonNullable<ReturnType<typeof createServiceRoleClient>>,
  offeringIds: string[],
): Promise<Map<string, { id: string; url: string }[]>> {
  const out = new Map<string, { id: string; url: string }[]>();
  if (offeringIds.length === 0) return out;
  const { data } = await offeringMediaTable(admin)
.select("offering_id, sort_order, media_asset_id, media_assets:media_asset_id ( public_url, bucket_id, storage_path )")
    .in("offering_id", offeringIds)
    .order("sort_order", { ascending: true });
  type MediaJoin = { id?: string; public_url: string | null; bucket_id: string | null; storage_path: string | null };
  type Row = { offering_id: string; sort_order: number; media_asset_id: string; media_assets: MediaJoin | MediaJoin[] | null };
  for (const r of (data ?? []) as Row[]) {
    const m = Array.isArray(r.media_assets) ? r.media_assets[0] : r.media_assets;
    if (!m) continue;
    let url = m.public_url ?? null;
    if (!url && m.bucket_id === "media-public" && m.storage_path) {
      url = (admin as SupabaseClient).storage.from("media-public").getPublicUrl(m.storage_path).data.publicUrl;
    }
    if (!url) continue;
    const list = out.get(r.offering_id) ?? [];
    list.push({ id: r.media_asset_id, url });
    out.set(r.offering_id, list);
  }
  return out;
}

type LoadResult =
  | { ok: true; items: TalentOffering[]; defaultCurrency: string; legacyImportable: boolean }
  | { ok: false; error: string };

/** Editor load: ALL statuses (drafts included), hero-first images resolved. */
export async function loadTalentOfferingsForEditor(talentProfileId: string): Promise<LoadResult> {
  try {
    const auth = await authorizeForTalent(talentProfileId);
    if (!auth.ok) return { ok: false, error: auth.error };
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Server configuration error." };

    const { data, error } = await offeringsTable(admin)
      .select("*")
      .eq("talent_profile_id", talentProfileId)
      .neq("status", "archived")
      .order("sort_order", { ascending: true });
    if (error) {
      logServerError("talent.offerings.load", error);
      return { ok: false, error: "Could not load your services." };
    }
    const rows = (data ?? []) as TalentOfferingRow[];
    const images = await loadImageAssets(admin, rows.map((r) => r.id));
    const children = await loadOfferingChildren(admin, rows.map((r) => r.id));
    const items = rows.map((r) => {
      const assets = images.get(r.id) ?? [];
      const item = rowToOffering(r, "en", assets.map((a) => a.url));
      item.imageAssets = assets;
      item.variants = children.variants.get(r.id) ?? [];
      item.addOns = children.addOns.get(r.id) ?? [];
      return item;
    });

    // Offer a one-shot legacy import only when the catalog is empty AND any
    // legacy pricing exists (services_menu, fixed rate, teasers, rate blobs).
    let legacyImportable = false;
    if (items.length === 0) {
      legacyImportable = (await collectLegacySources(admin, talentProfileId, auth.defaultCurrency)).length > 0;
    }
    return { ok: true, items, defaultCurrency: auth.defaultCurrency, legacyImportable };
  } catch (err) {
    logServerError("talent.offerings.load", err);
    return { ok: false, error: "Unexpected error." };
  }
}

type SaveResult = { ok: true; item: TalentOffering } | { ok: false; error: string };

/** Create or update one offering (id === "" ⇒ insert). Validates first. */
export async function upsertTalentOffering(
  talentProfileId: string,
  offering: TalentOffering,
): Promise<SaveResult> {
  try {
    const auth = await authorizeForTalent(talentProfileId);
    if (!auth.ok) return { ok: false, error: auth.error };
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Server configuration error." };

    const errors = validateOffering(offering);
    if (errors.length > 0) return { ok: false, error: errors[0] };

    const patch = {
      ...offeringToRowPatch({ ...offering, tenantId: auth.tenantId }),
      talent_profile_id: talentProfileId,
      updated_at: new Date().toISOString(),
    };

    let saved: TalentOfferingRow | null = null;
    if (offering.id) {
      const { data, error } = await offeringsTable(admin)
        .update(patch)
        .eq("id", offering.id)
        .eq("talent_profile_id", talentProfileId)
        .select("*")
        .maybeSingle();
      if (error) {
        logServerError("talent.offerings.update", error);
        return { ok: false, error: "Failed to save." };
      }
      saved = data as TalentOfferingRow | null;
    } else {
      const { data, error } = await offeringsTable(admin).insert(patch).select("*").maybeSingle();
      if (error) {
        logServerError("talent.offerings.insert", error);
        return { ok: false, error: "Failed to save." };
      }
      saved = data as TalentOfferingRow | null;
    }
    if (!saved) return { ok: false, error: "Failed to save." };

    revalidatePath("/talent/services");
    return { ok: true, item: rowToOffering(saved, "en", offering.imageUrls ?? []) };
  } catch (err) {
    logServerError("talent.offerings.upsert", err);
    return { ok: false, error: "Unexpected error." };
  }
}

export async function deleteTalentOffering(
  talentProfileId: string,
  offeringId: string,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await authorizeForTalent(talentProfileId);
  if (!auth.ok) return { ok: false, error: auth.error };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };
  const { error } = await offeringsTable(admin)
    .delete()
    .eq("id", offeringId)
    .eq("talent_profile_id", talentProfileId);
  if (error) {
    logServerError("talent.offerings.delete", error);
    return { ok: false, error: "Failed to delete." };
  }
  revalidatePath("/talent/services");
  return { ok: true };
}

/** Persist a drag-reorder: the array order IS the public order. */
export async function reorderTalentOfferings(
  talentProfileId: string,
  orderedIds: string[],
): Promise<{ ok: boolean; error?: string }> {
  const auth = await authorizeForTalent(talentProfileId);
  if (!auth.ok) return { ok: false, error: auth.error };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };
  for (let i = 0; i < orderedIds.length; i++) {
    const { error } = await offeringsTable(admin)
      .update({ sort_order: i, updated_at: new Date().toISOString() })
      .eq("id", orderedIds[i])
      .eq("talent_profile_id", talentProfileId);
    if (error) {
      logServerError("talent.offerings.reorder", error);
      return { ok: false, error: "Failed to reorder." };
    }
  }
  revalidatePath("/talent/services");
  return { ok: true };
}

/** Replace an offering's gallery (hero = first id). */
export async function setOfferingImages(
  talentProfileId: string,
  offeringId: string,
  mediaAssetIds: string[],
): Promise<{ ok: boolean; error?: string }> {
  const auth = await authorizeForTalent(talentProfileId);
  if (!auth.ok) return { ok: false, error: auth.error };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server configuration error." };

  // Guard: the offering must belong to this talent.
  const { data: own } = await offeringsTable(admin)
    .select("id")
    .eq("id", offeringId)
    .eq("talent_profile_id", talentProfileId)
    .maybeSingle();
  if (!own) return { ok: false, error: "Not found." };

  const { error: delErr } = await offeringMediaTable(admin).delete().eq("offering_id", offeringId);
  if (delErr) {
    logServerError("talent.offerings.mediaClear", delErr);
    return { ok: false, error: "Failed to update photos." };
  }
  if (mediaAssetIds.length > 0) {
    const rows = mediaAssetIds.slice(0, 12).map((mid, i) => ({
      offering_id: offeringId,
      media_asset_id: mid,
      sort_order: i,
    }));
    const { error: insErr } = await offeringMediaTable(admin).insert(rows);
    if (insErr) {
      logServerError("talent.offerings.mediaSet", insErr);
      return { ok: false, error: "Failed to update photos." };
    }
  }
  revalidatePath("/talent/services");
  return { ok: true };
}

/**
 * Replace an offering's OPTIONS (variants) and EXTRAS (add-ons) — Lane D4.
 * Array order IS the display order. Labels are required; a variant without a
 * price falls back to the offering's base price; an add-on must carry one.
 * Returns the saved children (fresh ids) so the editor can re-sync.
 */
export async function setOfferingOptions(
  talentProfileId: string,
  offeringId: string,
  input: {
    variants: { label: string; amountCents: number | null }[];
    addOns: { label: string; amountCents: number }[];
  },
): Promise<
  | { ok: true; variants: { id: string; label: string; amountCents: number | null }[]; addOns: { id: string; label: string; amountCents: number }[] }
  | { ok: false; error: string }
> {
  try {
    const auth = await authorizeForTalent(talentProfileId);
    if (!auth.ok) return { ok: false, error: auth.error };
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Server configuration error." };

    // Guard: the offering must belong to this talent.
    const { data: own } = await offeringsTable(admin)
      .select("id")
      .eq("id", offeringId)
      .eq("talent_profile_id", talentProfileId)
      .maybeSingle();
    if (!own) return { ok: false, error: "Not found." };

    const variants = (input.variants ?? [])
      .map((v) => ({
        label: (v.label ?? "").trim().slice(0, 80),
        amount_cents:
          typeof v.amountCents === "number" && Number.isFinite(v.amountCents) && v.amountCents >= 0
            ? Math.round(v.amountCents)
            : null,
      }))
      .filter((v) => v.label)
      .slice(0, MAX_OPTIONS_PER_OFFERING);
    const addOns = (input.addOns ?? [])
      .map((a) => ({
        label: (a.label ?? "").trim().slice(0, 80),
        amount_cents:
          typeof a.amountCents === "number" && Number.isFinite(a.amountCents) && a.amountCents >= 0
            ? Math.round(a.amountCents)
            : null,
      }))
      .filter((a): a is { label: string; amount_cents: number } => Boolean(a.label) && a.amount_cents != null)
      .slice(0, MAX_OPTIONS_PER_OFFERING);

    // Replace-all (same semantics as setOfferingImages).
    const { error: delV } = await admin.from("talent_offering_variants").delete().eq("offering_id", offeringId);
    const { error: delA } = await admin.from("talent_offering_addons").delete().eq("offering_id", offeringId);
    if (delV || delA) {
      logServerError("talent.offerings.optionsClear", delV ?? delA);
      return { ok: false, error: "Failed to save options." };
    }
    let savedVariants: { id: string; label: string; amount_cents: number | null }[] = [];
    let savedAddOns: { id: string; label: string; amount_cents: number }[] = [];
    if (variants.length > 0) {
      const { data, error } = await admin
        .from("talent_offering_variants")
        .insert(variants.map((v, i) => ({ offering_id: offeringId, label: v.label, amount_cents: v.amount_cents, sort_order: i })))
        .select("id, label, amount_cents");
      if (error) {
        logServerError("talent.offerings.variantsSet", error);
        return { ok: false, error: "Failed to save options." };
      }
      savedVariants = (data ?? []) as typeof savedVariants;
    }
    if (addOns.length > 0) {
      const { data, error } = await admin
        .from("talent_offering_addons")
        .insert(addOns.map((a, i) => ({ offering_id: offeringId, label: a.label, amount_cents: a.amount_cents, sort_order: i })))
        .select("id, label, amount_cents");
      if (error) {
        logServerError("talent.offerings.addonsSet", error);
        return { ok: false, error: "Failed to save extras." };
      }
      savedAddOns = (data ?? []) as typeof savedAddOns;
    }

    revalidatePath("/talent/services");
    return {
      ok: true,
      variants: savedVariants.map((v) => ({ id: v.id, label: v.label, amountCents: v.amount_cents })),
      addOns: savedAddOns.map((a) => ({ id: a.id, label: a.label, amountCents: a.amount_cents })),
    };
  } catch (err) {
    logServerError("talent.offerings.setOptions", err);
    return { ok: false, error: "Unexpected error." };
  }
}

/* ------------------------------------------------------------------ */
/* Legacy import — reads ALL FOUR legacy sources (fixes the audit's     */
/* import blind spot): services_menu items, booking_terms.fixedRate,    */
/* package_teasers, and the rates.cards / commercial.packageRates blobs.*/
/* ------------------------------------------------------------------ */

type LegacySeed = Pick<
  TalentOffering,
  "kind" | "title" | "description" | "priceType" | "priceDisplay" | "amountCents" | "currency"
>;

async function collectLegacySources(
  admin: NonNullable<ReturnType<typeof createServiceRoleClient>>,
  talentProfileId: string,
  currency: string,
): Promise<LegacySeed[]> {
  const seeds: LegacySeed[] = [];
  const { data } = await admin
    .from("talent_profiles")
    .select("services_menu, package_teasers, booking_terms")
    .eq("id", talentProfileId)
    .returns<{ services_menu: unknown; package_teasers: unknown; booking_terms: unknown }[]>()
    .maybeSingle();

  // 1) The services menu (the richest source) — map items 1:1.
  for (const it of normalizeServicesMenu(data?.services_menu, currency)) {
    seeds.push({
      kind: it.pricingType === "flat_package" && (it.childServiceIds?.length ?? 0) > 0 ? "package" : "service",
      title: it.name,
      description: it.description,
      priceType: it.pricingType,
      priceDisplay: it.pricingType === "custom" ? "quote" : "exact",
      amountCents: it.amountCents,
      currency: it.currency,
    });
  }

  // 2) booking_terms.fixedRateCents — one flat "Standard booking".
  const terms = parseTalentBookingTerms(data?.booking_terms ?? null);
  if (seeds.length === 0 && terms?.fixedRateCents && terms.fixedRateCents > 0) {
    seeds.push({
      kind: "service",
      title: "Standard booking",
      description: null,
      priceType: "flat_package",
      priceDisplay: "exact",
      amountCents: terms.fixedRateCents,
      currency,
    });
  }

  // 3) package_teasers — price-less quote packages.
  for (const t of parsePackageTeasers(data?.package_teasers)) {
    seeds.push({
      kind: "package",
      title: t.label,
      description: t.detail ?? null,
      priceType: "custom",
      priceDisplay: "quote",
      amountCents: null,
      currency,
    });
  }

  // 4) rates.cards + commercial.packageRates (the blobs the old import ignored).
  try {
    const supabase = await createSupabaseServerClient();
    if (supabase) {
      const blobs = await readBlobFieldValuesFromCatalog(supabase, talentProfileId);
      const cards = Array.isArray(blobs.rates_data) ? (blobs.rates_data as unknown[]) : [];
      for (const c of cards) {
        const o = c as { typeId?: string; amount?: number; currency?: string; unit?: string };
        if (typeof o.amount === "number" && o.amount > 0) {
          const unit = o.unit === "hour" ? "hour" : o.unit === "day" ? "day" : "event";
          seeds.push({
            kind: "service",
            title: o.typeId && o.typeId !== "default" ? `Rate — ${o.typeId}` : "Standard rate",
            description: null,
            priceType: unit,
            priceDisplay: "exact",
            amountCents: Math.round(o.amount * 100),
            currency: (o.currency || currency).toUpperCase(),
          });
        }
      }
      const pkgs = Array.isArray(blobs.package_rates_data) ? (blobs.package_rates_data as unknown[]) : [];
      for (const p of pkgs) {
        const o = p as { name?: string; description?: string; amount?: number; currency?: string };
        if (o.name) {
          seeds.push({
            kind: "package",
            title: o.name,
            description: o.description ?? null,
            priceType: "flat_package",
            priceDisplay: typeof o.amount === "number" && o.amount > 0 ? "exact" : "quote",
            amountCents: typeof o.amount === "number" && o.amount > 0 ? Math.round(o.amount * 100) : null,
            currency: (o.currency || currency).toUpperCase(),
          });
        }
      }
    }
  } catch (err) {
    logServerError("talent.offerings.legacyBlobs", err); // best-effort — menu/teasers still import
  }

  // Dedup by title (menu wins over derived seeds).
  const seen = new Set<string>();
  return seeds.filter((s) => {
    const k = s.title.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** One-shot, non-destructive: refuses when offerings already exist. */
export async function importLegacyToOfferings(talentProfileId: string): Promise<LoadResult> {
  try {
    const auth = await authorizeForTalent(talentProfileId);
    if (!auth.ok) return { ok: false, error: auth.error };
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Server configuration error." };

    const { count } = await offeringsTable(admin)
      .select("id", { count: "exact", head: true })
      .eq("talent_profile_id", talentProfileId);
    if ((count ?? 0) > 0) return { ok: false, error: "You already have services — import skipped." };

    const seeds = await collectLegacySources(admin, talentProfileId, auth.defaultCurrency);
    if (seeds.length === 0) return { ok: false, error: "Nothing to import." };

    const rows = seeds.slice(0, 40).map((s, i) => ({
      talent_profile_id: talentProfileId,
      tenant_id: auth.tenantId,
      kind: s.kind,
      title: s.title,
      description: s.description,
      price_type: s.priceType,
      price_display: s.priceDisplay,
      amount_cents: s.amountCents,
      currency: s.currency,
      sort_order: i,
      title_i18n: { en: s.title },
      description_i18n: s.description ? { en: s.description } : null,
    }));
    const { error } = await offeringsTable(admin).insert(rows);
    if (error) {
      logServerError("talent.offerings.import", error);
      return { ok: false, error: "Import failed." };
    }
    return await loadTalentOfferingsForEditor(talentProfileId);
  } catch (err) {
    logServerError("talent.offerings.import", err);
    return { ok: false, error: "Unexpected error." };
  }
}
