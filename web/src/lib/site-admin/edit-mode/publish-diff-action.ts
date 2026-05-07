"use server";

import { requireStaff } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";

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
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
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
  };
}
