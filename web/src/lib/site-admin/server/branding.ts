/**
 * Phase 5 / M1 — agency_branding server operations (basics only).
 *
 * M1 writes: logo/dark-logo/favicon/og_image + primary/secondary/accent/
 *            neutral color + font_preset/heading_font/body_font.
 *
 * M1 does NOT write theme_json. The token registry + design UI ship with M6;
 * theme_json stays '{}'::jsonb unless the tenant later opts into design
 * controls.
 *
 * Concurrency: same pattern as identity (compare-and-set UPDATE). Branding
 * rows are seeded per tenant (Phase 1 + M0 migrations), so there is no
 * INSERT path here — first edit arrives at version 1 already.
 */

import { randomUUID } from "node:crypto";
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
import type { BrandingFormValues } from "@/lib/site-admin/forms/branding";

// ---- row shape (storage form) --------------------------------------------

export interface BrandingRow {
  tenant_id: string;
  primary_color: string | null;
  secondary_color: string | null;
  accent_color: string | null;
  neutral_color: string | null;
  logo_media_asset_id: string | null;
  logo_dark_media_asset_id: string | null;
  favicon_media_asset_id: string | null;
  og_image_media_asset_id: string | null;
  font_preset: string | null;
  heading_font: string | null;
  body_font: string | null;
  brand_mark_svg: string | null;
  theme_json: Record<string, unknown>;
  /** M7 — optional; null on legacy / never-applied rows. Metadata only. */
  theme_preset_slug?: string | null;
  version: number;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

const BRANDING_SELECT = `
  tenant_id,
  primary_color,
  secondary_color,
  accent_color,
  neutral_color,
  logo_media_asset_id,
  logo_dark_media_asset_id,
  favicon_media_asset_id,
  og_image_media_asset_id,
  font_preset,
  heading_font,
  body_font,
  brand_mark_svg,
  theme_json,
  version,
  updated_by,
  created_at,
  updated_at
`;

function diffSummary(
  before: BrandingRow | null,
  after: BrandingRow,
): string {
  if (!before) return `branding seeded (v${after.version})`;
  const keys: Array<keyof BrandingRow> = [
    "primary_color",
    "secondary_color",
    "accent_color",
    "neutral_color",
    "logo_media_asset_id",
    "logo_dark_media_asset_id",
    "favicon_media_asset_id",
    "og_image_media_asset_id",
    "font_preset",
    "heading_font",
    "body_font",
    "brand_mark_svg",
  ];
  const changed = keys.filter(
    (k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]),
  );
  return changed.length
    ? `branding updated: ${changed.join(", ")}`
    : `branding touched (no field change)`;
}

export async function saveBranding(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    values: BrandingFormValues;
    actorProfileId: string | null;
    correlationId?: string;
  },
): Promise<Phase5Result<{ version: number }>> {
  const { tenantId, values, actorProfileId } = params;
  const correlationId = params.correlationId ?? randomUUID();

  await requirePhase5Capability("agency.site_admin.branding.edit", tenantId);

  // 1. Load current row.
  const { data: currentRow, error: loadError } = await supabase
    .from("agency_branding")
    .select(BRANDING_SELECT)
    .eq("tenant_id", tenantId)
    .maybeSingle<BrandingRow>();

  if (loadError) {
    return fail("FORBIDDEN", loadError.message);
  }

  const beforeRow = currentRow ?? null;
  const beforeVersion = beforeRow?.version ?? 0;

  if (beforeVersion !== values.expectedVersion) {
    return versionConflict(beforeVersion);
  }

  const nextVersion = beforeVersion + 1;

  const dbValues = {
    tenant_id: tenantId,
    primary_color: values.primaryColor ?? null,
    secondary_color: values.secondaryColor ?? null,
    accent_color: values.accentColor ?? null,
    neutral_color: values.neutralColor ?? null,
    logo_media_asset_id: values.logoMediaAssetId ?? null,
    logo_dark_media_asset_id: values.logoDarkMediaAssetId ?? null,
    favicon_media_asset_id: values.faviconMediaAssetId ?? null,
    og_image_media_asset_id: values.ogImageMediaAssetId ?? null,
    font_preset: values.fontPreset ?? null,
    heading_font: values.headingFont ?? null,
    body_font: values.bodyFont ?? null,
    brand_mark_svg: values.brandMarkSvg ?? null,
    updated_by: actorProfileId,
  };

  // 2. Apply mutation. Insert if missing (tenant not seeded); compare-and-set
  //    UPDATE otherwise.
  let afterRow: BrandingRow | null = null;
  if (beforeRow == null) {
    const { data, error } = await supabase
      .from("agency_branding")
      .insert({ ...dbValues, version: nextVersion })
      .select(BRANDING_SELECT)
      .single<BrandingRow>();
    if (error || !data) {
      return fail("FORBIDDEN", error?.message ?? "Insert failed");
    }
    afterRow = data;
  } else {
    const { data, error } = await supabase
      .from("agency_branding")
      .update({ ...dbValues, version: nextVersion })
      .eq("tenant_id", tenantId)
      .eq("version", beforeVersion)
      .select(BRANDING_SELECT)
      .maybeSingle<BrandingRow>();
    if (error) {
      return fail("FORBIDDEN", error.message);
    }
    if (!data) {
      return versionConflict(beforeVersion + 1);
    }
    afterRow = data;
  }

  // 3. Revision snapshot.
  {
    const { error } = await supabase
      .from("agency_branding_revisions")
      .insert({
        tenant_id: tenantId,
        version: nextVersion,
        snapshot: afterRow,
        created_by: actorProfileId,
      });
    if (error) {
      console.warn("[site-admin/branding] revision insert failed", {
        tenantId,
        version: nextVersion,
        error: error.message,
      });
    }
  }

  // 4. Audit.
  scheduleAuditEvent(supabase, {
    tenantId,
    actorProfileId,
    action: "agency.site_admin.branding.edit",
    entityType: "agency_branding",
    entityId: tenantId,
    diffSummary: diffSummary(beforeRow, afterRow),
    beforeSnapshot: beforeRow,
    afterSnapshot: afterRow,
    correlationId,
  });

  // 5. Bust cache tags. Branding flows into the storefront (logo/favicon/
  // colors) AND the admin chrome header. updateTag (Next 16) gives read-
  // your-own-writes semantics.
  updateTag(tagFor(tenantId, "branding"));
  updateTag(tagFor(tenantId, "storefront"));

  return ok({ version: nextVersion });
}
