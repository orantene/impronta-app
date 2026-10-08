"use server";

import { logServerError } from "@/lib/server/safe-error";
import { requireSession } from "@/lib/server/action-guards";
import { requireEditSurfaceTenantScope } from "@/lib/saas";
import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";
import { parseBuilderTreeFromSnapshot } from "@/lib/site-admin/edit-mode/composition-revision-snapshot";
import { talentPublishedSnapshotResult } from "@/lib/site-admin/edit-mode/talent-published-snapshot";

export interface PublishedSnapshotRow {
  slotKey: string;
  sortOrder: number;
  sectionId: string;
  sectionTypeKey: string;
  name: string;
}

export type LoadPublishedSnapshotResult =
  | {
      ok: true;
      rows: ReadonlyArray<PublishedSnapshotRow>;
      publishedAt: string | null;
      /**
       * W1-L2 — the builder tree baked into the published snapshot (`null`
       * when never published or the snapshot predates builder trees). Lets the
       * publish drawer compute an HONEST "changes since last publish" count for
       * FREEFORM pages, whose slot-row diff is always empty.
       */
      publishedBuilderTree: BuilderNodeTree | null;
      /** Whether a published snapshot exists at all (never published → false). */
      hasPublishedSnapshot: boolean;
    }
  | { ok: false; error: string };

function parseSnapshotRows(value: unknown): PublishedSnapshotRow[] {
  if (!value || typeof value !== "object") return [];
  const slots = (value as { slots?: unknown }).slots;
  if (!Array.isArray(slots)) return [];
  const out: PublishedSnapshotRow[] = [];
  for (const raw of slots) {
    if (!raw || typeof raw !== "object") continue;
    const slot = raw as Record<string, unknown>;
    if (
      typeof slot.slotKey !== "string" ||
      typeof slot.sortOrder !== "number" ||
      typeof slot.sectionId !== "string" ||
      typeof slot.sectionTypeKey !== "string" ||
      typeof slot.name !== "string"
    ) {
      continue;
    }
    out.push({
      slotKey: slot.slotKey,
      sortOrder: slot.sortOrder,
      sectionId: slot.sectionId,
      sectionTypeKey: slot.sectionTypeKey,
      name: slot.name,
    });
  }
  return out;
}

export async function loadPublishedSnapshotRowsAction(input: {
  pageId: string;
}): Promise<LoadPublishedSnapshotResult> {
  const auth = await requireSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  // F95/F95b - a talent's page or shell (talent_pages / talent_sites, owner RLS)
  // is looked up BEFORE the agency scope: an agency-rostered talent also has a
  // tenant scope, so gating on "no scope" sent her page id to cms_pages and the
  // load failed on an already-published site. Ids are uuids, so no collision.
  const { data: tp, error: tpErr } = await auth.supabase
    .from("talent_pages")
    .select("blocks_published, published_at")
    .eq("id", input.pageId)
    .maybeSingle<{ blocks_published: unknown; published_at: string | null }>();
  if (tpErr) logServerError("publishDiff.talentPage", tpErr);
  if (tp) return talentPublishedSnapshotResult(tp);
  const { data: ts, error: tsErr } = await auth.supabase
    .from("talent_sites")
    .select("shell_published, site_published_at")
    .eq("id", input.pageId)
    .maybeSingle<{ shell_published: unknown; site_published_at: string | null }>();
  if (tsErr) logServerError("publishDiff.talentSite", tsErr);
  if (ts) return talentPublishedSnapshotResult({ blocks_published: ts.shell_published, published_at: ts.site_published_at });
  const scope = await requireEditSurfaceTenantScope().catch(() => null);
  if (!scope) return { ok: false, error: "Pick an agency workspace first." };

  const { data: row, error } = await auth.supabase
    .from("cms_pages")
    .select("system_template_key, published_homepage_snapshot, published_page_snapshot, published_at")
    .eq("tenant_id", scope.tenantId)
    .eq("id", input.pageId)
    .maybeSingle<{
      system_template_key: string | null;
      published_homepage_snapshot: unknown;
      published_page_snapshot: unknown;
      published_at: string | null;
    }>();
  if (error || !row) return { ok: false, error: "Published snapshot not found." };

  const snapshot =
    row.system_template_key === "homepage"
      ? row.published_homepage_snapshot
      : row.published_page_snapshot;
  return {
    ok: true,
    rows: parseSnapshotRows(snapshot),
    publishedAt: row.published_at ?? null,
    publishedBuilderTree: parseBuilderTreeFromSnapshot(snapshot) ?? null,
    hasPublishedSnapshot:
      snapshot !== null && snapshot !== undefined && typeof snapshot === "object",
  };
}
