"use server";

/**
 * Phase 7 (M-19) — admin composer for non-homepage pages.
 *
 * Parallel to the homepage composer. Each non-homepage page row in
 * `cms_pages` already supports section composition via cms_page_sections
 * (page_id is the foreign key — homepage just happens to be one
 * specific page). The Phase-7 migration added `published_page_snapshot`
 * so the public reader can paint sections for any page, not just the
 * homepage.
 *
 * This module wraps three operations:
 *
 *   1. listComposablePages()       — pages the operator can compose
 *      (excludes archived; includes homepage as informational).
 *   2. loadPageComposition(pageId) — draft + live slot rows + section
 *      facts, ready to render in a per-page composer.
 *   3. publishPageSnapshot(pageId) — bake the current draft composition
 *      into `published_page_snapshot`, bump version, cache-bust.
 *
 * The full inline composer UI (drag/drop slot reorder, section pickers)
 * is the next iteration — for now operators get a list view with a
 * one-click "publish current draft" button so existing draft slots
 * (created via the API or directly in DB) can be promoted.
 *
 * The whole-pages CRUD (create / archive / metadata) keeps living in
 * `pages.ts`; this is just composition + snapshot.
 */

import { revalidateTag } from "next/cache";

import { requireStaff } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { tagFor } from "@/lib/site-admin/cache-tags";
import { DEFAULT_PLATFORM_LOCALE } from "@/lib/site-admin";
import type { HomepageSnapshot } from "@/lib/site-admin/server/homepage";

export interface ComposablePageRow {
  id: string;
  slug: string | null;
  locale: string;
  title: string;
  status: "draft" | "published" | "archived";
  isHomepage: boolean;
  draftSlotCount: number;
  liveSlotCount: number;
  hasSnapshot: boolean;
  publishedAt: string | null;
  version: number;
}

export type ListPagesResult =
  | { ok: true; pages: ReadonlyArray<ComposablePageRow> }
  | { ok: false; error: string };

export type PublishSnapshotResult =
  | { ok: true; sectionCount: number; pageVersion: number; publishedAt: string }
  | { ok: false; error: string };

// ── 1. listComposablePages ──────────────────────────────────────────────

export async function listComposablePages(): Promise<ListPagesResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) return { ok: false, error: "Pick an agency workspace first." };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server is missing service-role credentials." };

  const { data: pageRows, error: pErr } = await admin
    .from("cms_pages")
    .select(
      "id, slug, locale, title, status, system_template_key, is_system_owned, version, published_at, published_page_snapshot, published_homepage_snapshot",
    )
    .eq("tenant_id", scope.tenantId)
    .neq("status", "archived")
    .order("system_template_key", { ascending: false }) // homepage first
    .order("title", { ascending: true });
  if (pErr) return { ok: false, error: "Couldn't load pages." };

  const ids = (pageRows ?? []).map((r) => r.id as string);
  const draftCounts: Map<string, number> = new Map();
  const liveCounts: Map<string, number> = new Map();
  if (ids.length > 0) {
    const { data: slotRows } = await admin
      .from("cms_page_sections")
      .select("page_id, is_draft")
      .eq("tenant_id", scope.tenantId)
      .in("page_id", ids);
    for (const r of slotRows ?? []) {
      const target = r.is_draft ? draftCounts : liveCounts;
      target.set(r.page_id as string, (target.get(r.page_id as string) ?? 0) + 1);
    }
  }

  const out: ComposablePageRow[] = (pageRows ?? []).map((r) => {
    const isHomepage = r.system_template_key === "homepage";
    const snapshot = isHomepage
      ? (r.published_homepage_snapshot ?? null)
      : (r.published_page_snapshot ?? null);
    return {
      id: r.id as string,
      slug: r.slug as string | null,
      locale: r.locale as string,
      title: r.title as string,
      status: r.status as ComposablePageRow["status"],
      isHomepage,
      draftSlotCount: draftCounts.get(r.id as string) ?? 0,
      liveSlotCount: liveCounts.get(r.id as string) ?? 0,
      hasSnapshot: snapshot !== null,
      publishedAt: r.published_at as string | null,
      version: r.version as number,
    };
  });
  return { ok: true, pages: out };
}

// ── 2. publishPageSnapshot ──────────────────────────────────────────────

/**
 * Bake the page's current draft composition into `published_page_snapshot`,
 * also flipping `is_draft=true` rows to `is_draft=false` so the live
 * composition matches what we just snapshotted.
 *
 * This is a non-homepage variant of the homepage publish flow. Homepage
 * publish lives in homepage.ts and writes to `published_homepage_snapshot`
 * — we deliberately don't touch that here.
 */
export async function publishPageSnapshot(input: {
  pageId: string;
  expectedVersion: number;
}): Promise<PublishSnapshotResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) return { ok: false, error: "Pick an agency workspace first." };

  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: "Server is missing service-role credentials." };

  const { data: page, error: pErr } = await admin
    .from("cms_pages")
    .select(
      "id, tenant_id, locale, title, status, version, system_template_key, template_schema_version, meta_description",
    )
    .eq("id", input.pageId)
    .eq("tenant_id", scope.tenantId)
    .maybeSingle();
  if (pErr || !page) return { ok: false, error: "Page not found." };
  if (page.system_template_key === "homepage") {
    return {
      ok: false,
      error: "Use the homepage publish flow for the homepage row.",
    };
  }
  if (page.version !== input.expectedVersion) {
    return {
      ok: false,
      error: `Page changed since you loaded it (now version ${page.version}). Reload and try again.`,
    };
  }

  // Pull all draft slot rows for this page.
  const { data: draftRowsRaw } = await admin
    .from("cms_page_sections")
    .select("section_id, slot_key, sort_order")
    .eq("tenant_id", scope.tenantId)
    .eq("page_id", input.pageId)
    .eq("is_draft", true)
    .order("slot_key", { ascending: true })
    .order("sort_order", { ascending: true });
  const draftRows = (draftRowsRaw ?? []) as Array<{
    section_id: string;
    slot_key: string;
    sort_order: number;
  }>;
  if (draftRows.length === 0) {
    return {
      ok: false,
      error: "No draft sections to publish — add some via the composer first.",
    };
  }

  // Resolve section facts.
  const sectionIds = draftRows.map((r) => r.section_id);
  const { data: sectionRowsRaw } = await admin
    .from("cms_sections")
    .select("id, section_type_key, schema_version, name, props_jsonb, status")
    .eq("tenant_id", scope.tenantId)
    .in("id", sectionIds);
  const factsById = new Map<
    string,
    { type: string; ver: number; name: string; props: Record<string, unknown> }
  >();
  for (const r of sectionRowsRaw ?? []) {
    if (r.status === "archived") continue;
    factsById.set(r.id as string, {
      type: r.section_type_key as string,
      ver: r.schema_version as number,
      name: r.name as string,
      props: (r.props_jsonb ?? {}) as Record<string, unknown>,
    });
  }

  const slots = [];
  for (const r of draftRows) {
    const f = factsById.get(r.section_id);
    if (!f) continue;
    slots.push({
      slotKey: r.slot_key,
      sortOrder: r.sort_order,
      sectionId: r.section_id,
      sectionTypeKey: f.type,
      schemaVersion: f.ver,
      name: f.name,
      props: f.props,
    });
  }
  if (slots.length === 0) {
    return {
      ok: false,
      error: "Draft references only archived sections — un-archive or remove them first.",
    };
  }

  const snapshot: HomepageSnapshot = {
    version: 1,
    publishedAt: new Date().toISOString(),
    pageVersion: page.version + 1,
    locale: (page.locale ?? DEFAULT_PLATFORM_LOCALE) as HomepageSnapshot["locale"],
    fields: {
      title: page.title as string,
      metaDescription: (page.meta_description ?? null) as string | null,
      introTagline: null,
    },
    templateSchemaVersion: (page.template_schema_version ?? 1) as number,
    slots,
  };

  // Atomic-ish: bump version + write snapshot + flip draft rows to live.
  const { error: updErr } = await admin
    .from("cms_pages")
    .update({
      status: "published",
      published_at: snapshot.publishedAt,
      published_page_snapshot: snapshot,
      version: page.version + 1,
      updated_by: auth.user.id,
    })
    .eq("id", input.pageId)
    .eq("tenant_id", scope.tenantId)
    .eq("version", page.version);
  if (updErr) {
    return { ok: false, error: "Couldn't publish — version conflict, reload and retry." };
  }

  // Replace live composition with the freshly-snapshotted draft.
  await admin
    .from("cms_page_sections")
    .delete()
    .eq("tenant_id", scope.tenantId)
    .eq("page_id", input.pageId)
    .eq("is_draft", false);
  const liveInserts = draftRows.map((r) => ({
    tenant_id: scope.tenantId,
    page_id: input.pageId,
    section_id: r.section_id,
    slot_key: r.slot_key,
    sort_order: r.sort_order,
    is_draft: false,
  }));
  if (liveInserts.length > 0) {
    await admin.from("cms_page_sections").insert(liveInserts);
  }

  // Cache-bust the public reader. Next.js 16 requires the second
  // freshness arg ("default" matches the rest of the codebase).
  try {
    revalidateTag(tagFor(scope.tenantId, "pages-all"), "default");
  } catch {
    // tag system not initialised in test contexts; safe to ignore.
  }

  return {
    ok: true,
    sectionCount: slots.length,
    pageVersion: page.version + 1,
    publishedAt: snapshot.publishedAt,
  };
}
