"use server";

/**
 * Edit-chrome assets actions — typed wrappers over the existing
 * media-library reads + a new server-side usage scanner.
 *
 * The shared MediaPicker today fetches `/api/admin/media/library` directly
 * via `fetch`, which is fine for in-form section pickers but adds a
 * round-trip + a JSON parse the AssetsDrawer doesn't need. These typed
 * actions keep the drawer in React state directly:
 *
 *   - loadAssetsLibraryAction()  — same data as the route, no fetch hop
 *   - scanAssetUsageAction()     — count cms_sections.props_jsonb
 *                                  references per asset id / public URL
 *
 * Both actions are staff-gated (`requireStaff`) and tenant-scoped
 * (`requireTenantScope`), matching the disciplines used by the design
 * + revisions edit-mode wrappers.
 *
 * Usage scanner: cms_sections.props_jsonb is a free-form jsonb column
 * holding the section's content (with media_asset_id + publicUrl
 * references inside). The scanner pulls every non-archived section
 * for the tenant once, stringifies each props_jsonb row, and counts
 * `assetId` / `storagePath` substring matches per asset.
 *
 * Cost: O(N_sections * M_assets) string scans, capped because both
 * sides are bounded (60 assets max, a few hundred sections per tenant).
 * Single Supabase round-trip per scan, sub-100ms in practice.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  listTenantMediaLibrary,
  type MediaLibraryItem,
} from "@/lib/site-admin/server/media-library";
import { requireStaff } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";
import { logServerError } from "@/lib/server/safe-error";

// ── types ─────────────────────────────────────────────────────────────────

export interface AssetsLibrarySnapshot {
  items: MediaLibraryItem[];
  /** Server-side wall-clock at fetch time so the drawer can show
   *  "synced 12s ago" without a second round-trip. */
  fetchedAt: string;
}

export type LoadAssetsLibraryResult =
  | { ok: true; snapshot: AssetsLibrarySnapshot }
  | { ok: false; error: string };

export interface AssetUsage {
  /** media_assets.id */
  assetId: string;
  /** Number of cms_sections rows whose props_jsonb references this asset
   *  (by id or by storage path). */
  refCount: number;
  /** First N section ids using this asset, ordered by section name. The
   *  drawer surfaces these as "Used in: Hero, Testimonials, …" chips and
   *  jumps the canvas to one of them on click. */
  sectionIds: string[];
}

export type ScanAssetUsageResult =
  | { ok: true; usage: Record<string, AssetUsage> }
  | { ok: false; error: string };

const MAX_SECTIONS_PER_TENANT = 500;
const MAX_SAMPLE_SECTIONS_PER_ASSET = 6;

// ── actions ───────────────────────────────────────────────────────────────

export async function loadAssetsLibraryAction(): Promise<LoadAssetsLibraryResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };

  const scope = await requireTenantScope().catch(() => null);
  if (!scope) {
    return {
      ok: false,
      error: "Select an agency workspace before opening the assets drawer.",
    };
  }

  try {
    const items = await listTenantMediaLibrary(auth.supabase, scope.tenantId);
    return {
      ok: true,
      snapshot: { items, fetchedAt: new Date().toISOString() },
    };
  } catch (error) {
    logServerError("assets-actions:loadAssetsLibraryAction", error);
    return { ok: false, error: "Could not load the asset library." };
  }
}

export async function scanAssetUsageAction(): Promise<ScanAssetUsageResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };

  const scope = await requireTenantScope().catch(() => null);
  if (!scope) {
    return {
      ok: false,
      error: "Select an agency workspace before scanning asset usage.",
    };
  }

  try {
    const items = await listTenantMediaLibrary(auth.supabase, scope.tenantId);
    if (items.length === 0) {
      return { ok: true, usage: {} };
    }
    const usage = await computeAssetUsage(auth.supabase, scope.tenantId, items);
    return { ok: true, usage };
  } catch (error) {
    logServerError("assets-actions:scanAssetUsageAction", error);
    return { ok: false, error: "Could not scan asset usage." };
  }
}

// ── internals ─────────────────────────────────────────────────────────────

/**
 * Pull every non-archived section for the tenant in one round-trip,
 * stringify each props_jsonb, and count substring matches per asset.
 *
 * The substring strategy matches both `media_asset_id` references and
 * inline `publicUrl` strings — both shapes appear in section schemas
 * (e.g. hero.backgroundMediaAssetId vs gallery.images[].url). Storage
 * path is the more stable signal and rarely repeats by accident, so we
 * lead with that and fall back to id.
 */
async function computeAssetUsage(
  supabase: SupabaseClient,
  tenantId: string,
  items: ReadonlyArray<MediaLibraryItem>,
): Promise<Record<string, AssetUsage>> {
  const { data, error } = await supabase
    .from("cms_sections")
    .select("id, name, props_jsonb")
    .eq("tenant_id", tenantId)
    .neq("status", "archived")
    .order("name", { ascending: true })
    .limit(MAX_SECTIONS_PER_TENANT);

  if (error || !data) {
    return Object.fromEntries(
      items.map((it) => [
        it.id,
        { assetId: it.id, refCount: 0, sectionIds: [] },
      ]),
    );
  }

  // Pre-stringify each section once — serializing per-asset would be
  // O(N*M) JSON encodes. The stringified form is what we substring-scan.
  const sections = data.map((row) => ({
    id: (row as { id: string }).id,
    haystack: JSON.stringify((row as { props_jsonb: unknown }).props_jsonb),
  }));

  const out: Record<string, AssetUsage> = {};
  for (const it of items) {
    const sectionIds: string[] = [];
    for (const s of sections) {
      if (
        s.haystack.includes(it.id) ||
        (it.storagePath && s.haystack.includes(it.storagePath))
      ) {
        sectionIds.push(s.id);
      }
    }
    out[it.id] = {
      assetId: it.id,
      refCount: sectionIds.length,
      sectionIds: sectionIds.slice(0, MAX_SAMPLE_SECTIONS_PER_ASSET),
    };
  }
  return out;
}
