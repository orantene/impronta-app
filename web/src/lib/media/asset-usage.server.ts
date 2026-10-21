import "server-only";

/**
 * asset-usage.server.ts — where a workspace's media is IN USE (TUL-1637).
 *
 * Deleting a library asset is a soft delete (`deleted_at`), so nothing cascades: a photo that a
 * page section, a page share image or a service still points at would silently turn into a
 * broken image. The delete action used to check only the wordmark and favicon. This answers
 * the wider question for a set of asset ids, and fails CLOSED: if a lookup errors, or the page
 * scan is cut short, the asset is reported as "could not check" and the delete is refused,
 * never waved through as unused.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import { listProtectedBrandAssetIds } from "@/lib/site-admin/server/brand-library";

/** Sections scanned per workspace. Hitting it means the answer is incomplete, so we refuse. */
export const ASSET_USAGE_SECTION_SCAN_LIMIT = 1000;

export type AssetUsage = {
  /** Wordmark or favicon. */
  brand: string[];
  /** Page sections (props) or a page share image. */
  pages: string[];
  /** A product or service photo. */
  services: string[];
  /** Lookups that failed or were cut short: treated as in use. */
  unchecked: boolean;
};

export type AssetUsageResult = AssetUsage & {
  /** Every id that must not be deleted, for any reason above. */
  blocked: string[];
};

type TargetRow = { id: string; storage_path: string | null };

async function pageUsage(
  admin: SupabaseClient,
  tenantId: string,
  targets: TargetRow[],
): Promise<{ ids: Set<string>; complete: boolean }> {
  const ids = new Set<string>();
  const [sections, shareImages] = await Promise.all([
    admin
      .from("cms_sections")
      .select("props_jsonb")
      .eq("tenant_id", tenantId)
      .neq("status", "archived")
      .limit(ASSET_USAGE_SECTION_SCAN_LIMIT),
    admin
      .from("cms_pages")
      .select("og_image_media_asset_id")
      .eq("tenant_id", tenantId)
      .in("og_image_media_asset_id", targets.map((t) => t.id)),
  ]);
  if (sections.error || !sections.data || shareImages.error) {
    logServerError("media.assetUsage.pages", sections.error ?? shareImages.error);
    return { ids, complete: false };
  }
  for (const row of (shareImages.data ?? []) as { og_image_media_asset_id: string | null }[]) {
    if (row.og_image_media_asset_id) ids.add(row.og_image_media_asset_id);
  }
  // Same strategy as the Media page's "used on N pages" badge: sections store either the asset
  // id or its storage path / public URL, so match on either.
  const haystacks = (sections.data as { props_jsonb: unknown }[]).map((r) => JSON.stringify(r.props_jsonb ?? null));
  for (const t of targets) {
    if (haystacks.some((h) => h.includes(t.id) || (t.storage_path ? h.includes(t.storage_path) : false))) {
      ids.add(t.id);
    }
  }
  return { ids, complete: sections.data.length < ASSET_USAGE_SECTION_SCAN_LIMIT };
}

async function serviceUsage(
  admin: SupabaseClient,
  tenantId: string,
  assetIds: string[],
): Promise<{ ids: Set<string>; complete: boolean }> {
  const ids = new Set<string>();
  const links = await admin
    .from("talent_offering_media")
    .select("offering_id, media_asset_id")
    .in("media_asset_id", assetIds);
  if (links.error || !links.data) {
    logServerError("media.assetUsage.serviceLinks", links.error);
    return { ids, complete: false };
  }
  const rows = links.data as { offering_id: string; media_asset_id: string }[];
  if (rows.length === 0) return { ids, complete: true };
  // The link table has no tenant column: count only offerings that belong to this workspace.
  const offerings = await admin
    .from("talent_offerings")
    .select("id")
    .eq("tenant_id", tenantId)
    .in("id", [...new Set(rows.map((r) => r.offering_id))]);
  if (offerings.error || !offerings.data) {
    logServerError("media.assetUsage.offerings", offerings.error);
    return { ids, complete: false };
  }
  const mine = new Set((offerings.data as { id: string }[]).map((o) => o.id));
  for (const r of rows) if (mine.has(r.offering_id)) ids.add(r.media_asset_id);
  return { ids, complete: true };
}

export async function findAssetUsage(
  admin: SupabaseClient,
  tenantId: string,
  assetIds: string[],
): Promise<AssetUsageResult> {
  const wanted = [...new Set(assetIds.filter(Boolean))];
  if (wanted.length === 0) return { brand: [], pages: [], services: [], unchecked: false, blocked: [] };

  const targetsRes = await admin
    .from("media_assets")
    .select("id, storage_path")
    .eq("tenant_id", tenantId)
    .in("id", wanted);
  if (targetsRes.error || !targetsRes.data) {
    logServerError("media.assetUsage.targets", targetsRes.error);
    return { brand: [], pages: [], services: [], unchecked: true, blocked: wanted };
  }
  const targets = targetsRes.data as TargetRow[];
  const targetIds = targets.map((t) => t.id);
  if (targetIds.length === 0) return { brand: [], pages: [], services: [], unchecked: false, blocked: [] };

  const [brand, pages, services] = await Promise.all([
    listProtectedBrandAssetIds(admin, tenantId, targetIds),
    pageUsage(admin, tenantId, targets),
    serviceUsage(admin, tenantId, targetIds),
  ]);
  const unchecked = !pages.complete || !services.complete;
  const blocked = new Set<string>([...brand, ...pages.ids, ...services.ids]);
  // A lookup we could not finish cannot clear anything: every asset it did not already
  // flag stays blocked too.
  if (unchecked) for (const id of targetIds) blocked.add(id);
  return {
    brand,
    pages: [...pages.ids],
    services: [...services.ids],
    unchecked,
    blocked: [...blocked],
  };
}

/** The refusal shown when a delete is blocked. Plain words, says where and what to do. */
export function describeAssetUsageRefusal(usage: AssetUsageResult): string {
  if (usage.unchecked) {
    return "We could not check whether these images are in use. Nothing was deleted. Try again in a moment.";
  }
  const where: string[] = [];
  if (usage.brand.length > 0) where.push(`${usage.brand.length} as your wordmark or favicon (Settings → Brand identity)`);
  if (usage.pages.length > 0) where.push(`${usage.pages.length} on your site pages`);
  if (usage.services.length > 0) where.push(`${usage.services.length} as a service or product photo`);
  return `Nothing was deleted: ${usage.blocked.length} selected image(s) are in use (${where.join("; ")}). Replace them there first.`;
}
