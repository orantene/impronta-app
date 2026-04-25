/**
 * Phase 5 / M1 — agency_business_identity server operations.
 *
 * Core library used by Next Server Actions. Not directly exposed — the admin
 * route imports `saveIdentity()` from a `"use server"` wrapper.
 *
 * Responsibilities:
 *   1. Capability check (phase-5, tenant-scoped).
 *   2. Optimistic concurrency — compare expectedVersion against the current
 *      row; if mismatch → VERSION_CONFLICT.
 *   3. Upsert (insert if missing, update-and-increment-version if present).
 *   4. Append a revision row with the post-mutation snapshot.
 *   5. Emit a Phase-5 audit event.
 *   6. Revalidate the identity cache tag + storefront tag (public surface
 *      affected by identity edits: header, footer, meta).
 *
 * No UI concerns. Returns a `Phase5Result`.
 */

import { randomUUID, createHash } from "node:crypto";
import { updateTag } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  scheduleAuditEvent,
  requirePhase5Capability,
  tagFor,
  versionConflict,
  fail,
  ok,
  type Phase5Result,
} from "@/lib/site-admin";
import type { IdentityFormValues } from "@/lib/site-admin/forms/identity";
import { invalidateTenantLocaleSettings } from "@/lib/site-admin/server/locale-resolver";

// ---- row shape (storage form) --------------------------------------------

export interface IdentityRow {
  tenant_id: string;
  public_name: string;
  legal_name: string | null;
  tagline: string | null;
  footer_tagline: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  whatsapp: string | null;
  address_city: string | null;
  address_country: string | null;
  service_area: string | null;
  social_instagram: string | null;
  social_tiktok: string | null;
  social_facebook: string | null;
  social_linkedin: string | null;
  social_youtube: string | null;
  social_x: string | null;
  default_locale: string;
  supported_locales: string[];
  seo_default_title: string | null;
  seo_default_description: string | null;
  seo_default_share_image_media_asset_id: string | null;
  primary_cta_label: string | null;
  primary_cta_href: string | null;
  version: number;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

/** Columns returned by SELECT *; we pull the full row for snapshotting. */
const IDENTITY_SELECT = `
  tenant_id,
  public_name,
  legal_name,
  tagline,
  footer_tagline,
  contact_email,
  contact_phone,
  whatsapp,
  address_city,
  address_country,
  service_area,
  social_instagram,
  social_tiktok,
  social_facebook,
  social_linkedin,
  social_youtube,
  social_x,
  default_locale,
  supported_locales,
  seo_default_title,
  seo_default_description,
  seo_default_share_image_media_asset_id,
  primary_cta_label,
  primary_cta_href,
  version,
  updated_by,
  created_at,
  updated_at
`;

function diffSummary(
  before: IdentityRow | null,
  after: IdentityRow,
): string {
  if (!before) return `identity created (v${after.version})`;
  const changed: string[] = [];
  const keys = Object.keys(after) as Array<keyof IdentityRow>;
  for (const k of keys) {
    if (k === "updated_at" || k === "created_at" || k === "version") continue;
    const b = JSON.stringify(before[k]);
    const a = JSON.stringify(after[k]);
    if (b !== a) changed.push(String(k));
  }
  return changed.length
    ? `identity updated: ${changed.join(", ")}`
    : `identity touched (no field change)`;
}

function toDbValues(
  values: IdentityFormValues,
  tenantId: string,
  actorProfileId: string | null,
): Omit<IdentityRow, "version" | "created_at" | "updated_at"> {
  return {
    tenant_id: tenantId,
    public_name: values.publicName,
    legal_name: values.legalName ?? null,
    tagline: values.tagline ?? null,
    footer_tagline: values.footerTagline ?? null,
    contact_email: values.contactEmail ?? null,
    contact_phone: values.contactPhone ?? null,
    whatsapp: values.whatsapp ?? null,
    address_city: values.addressCity ?? null,
    address_country: values.addressCountry ?? null,
    service_area: values.serviceArea ?? null,
    social_instagram: values.socialInstagram ?? null,
    social_tiktok: values.socialTiktok ?? null,
    social_facebook: values.socialFacebook ?? null,
    social_linkedin: values.socialLinkedin ?? null,
    social_youtube: values.socialYoutube ?? null,
    social_x: values.socialX ?? null,
    default_locale: values.defaultLocale,
    supported_locales: values.supportedLocales,
    seo_default_title: values.seoDefaultTitle ?? null,
    seo_default_description: values.seoDefaultDescription ?? null,
    seo_default_share_image_media_asset_id:
      values.seoDefaultShareImageMediaAssetId ?? null,
    primary_cta_label: values.primaryCtaLabel ?? null,
    primary_cta_href: values.primaryCtaHref ?? null,
    updated_by: actorProfileId,
  };
}

/**
 * Save the business identity for a tenant.
 *
 *   - `expectedVersion === 0` → insert a new row (first-time edit).
 *   - `expectedVersion >= 1`  → compare-and-set update.
 *
 * On success: returns `{version}` of the new row. On stale write: returns
 * VERSION_CONFLICT. Failures in audit or cache-bust are logged but do not
 * roll back the mutation (the mutation already succeeded).
 */
export async function saveIdentity(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    values: IdentityFormValues;
    actorProfileId: string | null;
    correlationId?: string;
  },
): Promise<Phase5Result<{ version: number }>> {
  const { tenantId, values, actorProfileId } = params;
  const correlationId = params.correlationId ?? randomUUID();

  // 1. Capability gate. Throws on failure — surfaced by the action wrapper.
  await requirePhase5Capability("agency.site_admin.identity.edit", tenantId);

  // 2. Load current row for concurrency compare + before-snapshot.
  const { data: currentRow, error: loadError } = await supabase
    .from("agency_business_identity")
    .select(IDENTITY_SELECT)
    .eq("tenant_id", tenantId)
    .maybeSingle<IdentityRow>();

  if (loadError) {
    return fail("FORBIDDEN", loadError.message);
  }

  const beforeRow = currentRow ?? null;
  const beforeVersion = beforeRow?.version ?? 0;

  if (beforeVersion !== values.expectedVersion) {
    return versionConflict(beforeVersion);
  }

  const nextVersion = beforeVersion + 1;
  const dbValues = toDbValues(values, tenantId, actorProfileId);

  // 3. Apply mutation. INSERT on first edit; compare-and-set UPDATE otherwise.
  let afterRow: IdentityRow | null = null;
  if (beforeRow == null) {
    const { data, error } = await supabase
      .from("agency_business_identity")
      .insert({ ...dbValues, version: nextVersion })
      .select(IDENTITY_SELECT)
      .single<IdentityRow>();
    if (error || !data) {
      return fail("FORBIDDEN", error?.message ?? "Insert failed");
    }
    afterRow = data;
  } else {
    const { data, error } = await supabase
      .from("agency_business_identity")
      .update({ ...dbValues, version: nextVersion })
      .eq("tenant_id", tenantId)
      .eq("version", beforeVersion) // compare-and-set
      .select(IDENTITY_SELECT)
      .maybeSingle<IdentityRow>();
    if (error) {
      return fail("FORBIDDEN", error.message);
    }
    if (!data) {
      // Another writer bumped version between SELECT and UPDATE.
      return versionConflict(beforeVersion + 1);
    }
    afterRow = data;
  }

  // 4. Append revision snapshot (best-effort; mutation already committed).
  {
    const { error } = await supabase
      .from("agency_business_identity_revisions")
      .insert({
        tenant_id: tenantId,
        version: nextVersion,
        snapshot: afterRow,
        created_by: actorProfileId,
      });
    if (error) {
      console.warn("[site-admin/identity] revision insert failed", {
        tenantId,
        version: nextVersion,
        error: error.message,
      });
    }
  }

  // 5. Audit.
  scheduleAuditEvent(supabase, {
    tenantId,
    actorProfileId,
    action: "agency.site_admin.identity.edit",
    entityType: "agency_business_identity",
    entityId: tenantId,
    diffSummary: diffSummary(beforeRow, afterRow),
    beforeSnapshot: beforeRow,
    afterSnapshot: afterRow,
    correlationId,
  });

  // 6. Bust cache tags. Identity is consumed by storefront header, footer,
  // metadata, and the locale fallback in middleware — so bust the storefront
  // tag too. updateTag (Next 16) gives read-your-own-writes semantics within
  // a server action (vs. revalidateTag's eventual refresh).
  updateTag(tagFor(tenantId, "identity"));
  updateTag(tagFor(tenantId, "storefront"));

  // The middleware locale cache is an in-memory map (edge-safe; not covered
  // by updateTag). Bust it explicitly so a save immediately affects locale
  // resolution on the next request.
  invalidateTenantLocaleSettings(tenantId);

  return ok({ version: nextVersion });
}

/**
 * Utility: compute a stable hash of the identity snapshot. Consumed by the
 * audit diff-forensics helpers in `lib/site-admin/audit.ts`; exported here
 * for admin + storefront reads that want a cache-key derivative.
 */
export function hashIdentity(row: IdentityRow | null): string {
  return createHash("sha256")
    .update(JSON.stringify(row ?? null))
    .digest("hex");
}
