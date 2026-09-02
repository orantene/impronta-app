/**
 * Phase B.1 — public reader for the tenant site shell.
 *
 * The shell is a system-owned `cms_pages` row with `system_template_key =
 * 'site_shell'` and `slug = '__site_shell__'`. Section composition lives in
 * `cms_page_sections` keyed by `page_id` = shell-row-id, with slot keys
 * `header` and `footer`. The published JSONB snapshot lives in
 * `cms_pages.published_page_snapshot` (reusing the existing column shape).
 *
 * Returns null when:
 *   - the tenant has no shell row at all (default state pre-B.2 backfill)
 *   - the shell row exists but has never been published
 *   - the snapshot is empty — meaning NO slots AND NO freeform `builderTree`.
 *     A snapshot with zero slots but a real tree is a valid slots-free shell
 *     and renders; see `shellSnapshotHasContent`.
 *
 * Callers MUST treat null as "fall through to the hard-coded PublicHeader",
 * not as an error. Phase B.1 does not change any rendering — the wrapper
 * component that consumes this reader is feature-flag-gated and OFF by
 * default.
 *
 * Phase-3 note: this fallback is intentionally explicit while builder page
 * ownership expands; see `docs/saas/page-builder-package-audit-2026-05-06.md`
 * for backfill and removal sequencing.
 */

import { improntaLog } from "@/lib/server/structured-log";
import { unstable_cache } from "next/cache";

import { getSectionType } from "@/lib/site-admin/sections/registry";
import { coerceStyleClassRegistry } from "@/lib/site-admin/builder-node/style-registry-coerce";
import {
  hasFreeformShellTree,
  resolveShellSnapshotBuilderTree,
} from "@/lib/site-admin/edit-mode/site-shell-publish";
import { isPreviewActiveForTenant } from "@/lib/site-admin/server/homepage-reads";
import { createServiceRoleClient } from "@/lib/supabase/admin";

import { defaultLocale, type Locale } from "@/i18n/config";
import { tagFor } from "@/lib/site-admin/cache-tags";
import { loadTenantLocaleSettings } from "@/lib/site-admin/server/locale-resolver";
import { createPublicSupabaseClient } from "@/lib/supabase/public";
import type { HomepageSnapshot } from "./homepage";

export interface PublishedShell {
  pageId: string;
  locale: string;
  publishedAt: string | null;
  /** The snapshot's slot list. Header slot keys = "header"; footer = "footer". */
  snapshot: HomepageSnapshot;
}

interface ShellRow {
  id: string;
  locale: string;
  status: string;
  published_at: string | null;
  published_page_snapshot: HomepageSnapshot | null;
}

/**
 * SLOTS-FREE SHELL (2026-09-02) — does this published snapshot carry anything
 * the shell renderer can draw?
 *
 * This used to be `Array.isArray(snap.slots) && snap.slots.length > 0`, i.e.
 * legacy slot rows were the ONLY recognised way to have a shell. A shell
 * authored entirely on the freeform surface (all content in `builderTree`,
 * zero `cms_page_sections` rows) therefore read as EMPTY, `loadPublishedShell`
 * returned null, and the public reader fell back to the hard-coded LEGACY
 * header — the correct shell rendering as the wrong one, or as nothing. See
 * the header comment of `scripts/impronta-rebuild/shell/seed-shell.ts` for the
 * incident this papered over.
 *
 * `slots: []` plus a tree is a shape the renderer already handles: with no
 * slots, `classifyShellTree` returns "freeform" and `resolveShellSidePlan`
 * returns `mode: "freeform"` for both sides. Nothing downstream needed to
 * change.
 *
 * The freeform half uses the SAME `hasFreeformShellTree` shape test the
 * publish path uses to decide the tree wins, so read and write cannot drift.
 */
export function shellSnapshotHasContent(
  snap: Pick<HomepageSnapshot, "slots" | "builderTree"> | null | undefined,
): boolean {
  if (!snap) return false;
  const hasSlots = Array.isArray(snap.slots) && snap.slots.length > 0;
  return hasSlots || hasFreeformShellTree(snap.builderTree);
}

/**
 * The whole of `loadPublishedShell`'s post-read logic, factored PURE so the
 * shell's "is this renderable?" decision is directly unit-testable without a
 * Supabase client, `unstable_cache`, or a request scope. `loadPublishedShell`
 * does the I/O and delegates every decision here.
 */
export function projectPublishedShellRow(
  data: ShellRow | null | undefined,
): PublishedShell | null {
  if (!data) return null;
  if (data.status !== "published") return null;
  const snap = data.published_page_snapshot;
  if (!shellSnapshotHasContent(snap)) return null;
  return {
    pageId: data.id,
    locale: data.locale,
    publishedAt: data.published_at,
    snapshot: snap as HomepageSnapshot,
  };
}

const SELECT = `
  id, locale, status, published_at, published_page_snapshot
`;

export function loadPublishedShell(
  tenantId: string,
  locale: Locale,
): Promise<PublishedShell | null> {
  if (!tenantId) return Promise.resolve(null);
  return unstable_cache(
    async (): Promise<PublishedShell | null> => {
      const supabase = createPublicSupabaseClient();
      if (!supabase) return null;
      const tenantLocale = await loadTenantLocaleSettings(tenantId);
      const candidateLocales = Array.from(
        new Set([locale, tenantLocale.defaultLocale, defaultLocale]),
      );
      // Phase B.2.A fix (2026-04-26): direct SELECT on cms_pages is blocked
      // by anon RLS; the public read path goes through the SECURITY INVOKER
      // RPC `cms_public_pages_for_tenant` which sets the tenant GUC so the
      // tenant-aware policy permits the row. Same pattern as loadPublicPage.
      const { data: rowsRaw, error } = await supabase
        .rpc("cms_public_pages_for_tenant", { p_tenant_id: tenantId })
        .select(SELECT)
        .in("locale", candidateLocales)
        .eq("system_template_key", "site_shell")
        .returns<ShellRow[]>();
      if (error) {
        void improntaLog("site_admin_shell_reads.warn", {
          message: "[site-admin/shell-reads] shell load failed",
          tenantId,
          locale,
          error: error.message,
        });
        return null;
      }
      const rows = (Array.isArray(rowsRaw) ? rowsRaw : []) as ShellRow[];
      const dataForLocale = candidateLocales
        .map((candidate) => rows.find((row) => row.locale === candidate))
        .find(Boolean);
      return projectPublishedShellRow(dataForLocale ?? null);
    },
    ["site-admin:published-shell", tenantId, locale],
    {
      // Tag-bust on any `pages-all` event — every shell publish path
      // (`publishPageSnapshot` for `site_shell`, homepage publish +
      // `republishSiteShellSnapshot`, `site-shell-backfill-action`) busts
      // `pages-all` (plus `storefront` for full-route invalidation). Per-shell
      // narrow tagging would need a server-side shell-id resolution before
      // the read; deferred.
      tags: [tagFor(tenantId, "pages-all")],
      // Defensive 300s safety-net TTL — Vercel's Data Cache persists
      // across deploys and `revalidateTag` can't cross runtimes. Bounds
      // staleness when a publish fires in a different runtime from the
      // one that originally cached the entry. Same pattern as
      // homepage-reads.ts (canonical reference).
      revalidate: 300,
    },
  )();
}

// ---- draft-aware render entry point (owner report 2026-08-20) --------------
//
// THE "NOTHING HAPPENS" BUG THIS FIXES
// ------------------------------------
// The shell editing surface (and every edit-mode page) rendered the shell from
// `published_page_snapshot` — while every mutation (move a block, ⌘Z, remove)
// wrote `cms_pages.blocks`, the DRAFT. Structural edits and undo therefore
// committed + persisted correctly but repainted NOTHING: the canvas kept
// showing the published header, so moving a block, undoing, or deleting looked
// like a silent no-op ("things seem stuck", "⌘Z not working"). Style drags
// only LOOKED alive because their preview writes inline styles on the live
// element mid-gesture.
//
// The fix mirrors `loadHomepageForRender` exactly: when the request carries a
// VALID signed preview JWT for this tenant (`isPreviewActiveForTenant` — the
// same token that unlocks homepage/page drafts; the forgeable edit cookie
// deliberately unlocks nothing), render the shell from its DRAFT composition —
// the same rows + the same bake the Publish action uses, minus the write.
// Public visitors keep the published snapshot, byte-identical.

interface DraftShellRow {
  id: string;
  locale: string;
  title: string;
  status: string;
  meta_description: string | null;
  published_at: string | null;
  template_schema_version: number | null;
  version: number;
  blocks: unknown;
  style_classes?: unknown;
}

/**
 * Uncached DRAFT read of the tenant shell. Same composition steps as
 * `republishSiteShellSnapshot` (shell row → draft slot rows, falling back to
 * live rows → section facts → slots + authoritative freeform `blocks` tree),
 * with no write. Service-role client: the verified preview JWT that gates this
 * path is admin proof, and anon RLS hides draft `cms_page_sections`. Returns
 * null when the tenant has no shell row or no sections — callers fall back to
 * the published snapshot.
 */
export async function loadDraftShell(
  tenantId: string,
  locale: Locale,
): Promise<PublishedShell | null> {
  if (!tenantId) return null;
  const supabase = createServiceRoleClient();
  if (!supabase) return null;

  const tenantLocale = await loadTenantLocaleSettings(tenantId);
  const candidateLocales = Array.from(
    new Set([locale, tenantLocale.defaultLocale, defaultLocale]),
  );
  const { data: rowsRaw } = await supabase
    .from("cms_pages")
    .select(
      "id, locale, title, status, meta_description, published_at, template_schema_version, version, blocks, style_classes",
    )
    .eq("tenant_id", tenantId)
    .in("locale", candidateLocales)
    .eq("system_template_key", "site_shell")
    .neq("status", "archived")
    .returns<DraftShellRow[]>();
  const rows = (Array.isArray(rowsRaw) ? rowsRaw : []) as DraftShellRow[];
  const shell =
    candidateLocales
      .map((candidate) => rows.find((row) => row.locale === candidate))
      .find(Boolean) ?? null;
  if (!shell) return null;

  const { data: draftRowsRaw } = await supabase
    .from("cms_page_sections")
    .select("section_id, slot_key, sort_order")
    .eq("tenant_id", tenantId)
    .eq("page_id", shell.id)
    .eq("is_draft", true)
    .order("slot_key", { ascending: true })
    .order("sort_order", { ascending: true });
  let slotRows = (draftRowsRaw ?? []) as Array<{
    section_id: string;
    slot_key: string;
    sort_order: number;
  }>;
  if (slotRows.length === 0) {
    const { data: liveRowsRaw } = await supabase
      .from("cms_page_sections")
      .select("section_id, slot_key, sort_order")
      .eq("tenant_id", tenantId)
      .eq("page_id", shell.id)
      .eq("is_draft", false)
      .order("slot_key", { ascending: true })
      .order("sort_order", { ascending: true });
    slotRows = (liveRowsRaw ?? []) as typeof slotRows;
  }
  // SLOTS-FREE SHELL (2026-09-02) — same predicate as `loadPublishedShell` and
  // `republishSiteShellSnapshot`: zero slot rows is only "no shell" when the
  // draft `blocks` tree is empty too. Without this the shell EDITOR (this read
  // is the preview-JWT draft path) would show a freeform-only shell as nothing.
  const hasDraftFreeform = hasFreeformShellTree(shell.blocks);
  if (slotRows.length === 0 && !hasDraftFreeform) return null;

  const sectionIds = slotRows.map((r) => r.section_id);
  const sectionRowsRaw = sectionIds.length
    ? (
        await supabase
          .from("cms_sections")
          .select("id, section_type_key, schema_version, name, props_jsonb, status")
          .eq("tenant_id", tenantId)
          .in("id", sectionIds)
      ).data
    : [];
  const factsById = new Map<
    string,
    { type: string; ver: number; name: string; props: Record<string, unknown> }
  >();
  for (const r of sectionRowsRaw ?? []) {
    if ((r as { status?: string }).status === "archived") continue;
    factsById.set(r.id as string, {
      type: r.section_type_key as string,
      ver: r.schema_version as number,
      name: r.name as string,
      props: (r.props_jsonb as Record<string, unknown> | null) ?? {},
    });
  }

  const slots: HomepageSnapshot["slots"] = [];
  for (const r of slotRows) {
    const f = factsById.get(r.section_id);
    if (!f) continue;
    if (!getSectionType(f.type)) continue;
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
  if (slots.length === 0 && !hasDraftFreeform) return null;

  const snapshot: HomepageSnapshot = {
    version: 1,
    publishedAt: shell.published_at ?? new Date(0).toISOString(),
    pageVersion: shell.version,
    locale: shell.locale as HomepageSnapshot["locale"],
    fields: {
      title: shell.title,
      metaDescription: shell.meta_description,
      introTagline: null,
    },
    templateSchemaVersion: shell.template_schema_version ?? 1,
    slots,
    builderTree: resolveShellSnapshotBuilderTree(
      shell.blocks,
      slots,
      coerceStyleClassRegistry(shell.style_classes),
    ),
  };
  return {
    pageId: shell.id,
    locale: shell.locale,
    publishedAt: shell.published_at,
    snapshot,
  };
}

/**
 * Render entry point for the shell: DRAFT when this request carries a valid
 * signed preview JWT for the tenant (staff editing — same gate as
 * `loadHomepageForRender`), otherwise the cached published snapshot.
 */
export async function loadShellForRender(
  tenantId: string,
  locale: Locale,
): Promise<PublishedShell | null> {
  const previewActive = await isPreviewActiveForTenant(tenantId);
  if (previewActive) {
    const draft = await loadDraftShell(tenantId, locale);
    if (draft) return draft;
  }
  return loadPublishedShell(tenantId, locale);
}
