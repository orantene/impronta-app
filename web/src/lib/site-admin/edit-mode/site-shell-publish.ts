/**
 * Phase B.2.B — site shell republish helper.
 *
 * Bakes the current state of the tenant's `site_shell` row's draft section
 * composition into `cms_pages.published_page_snapshot` and flips the
 * status to `published`. Idempotent: a tenant without a shell row gets a
 * no-op (returns ok with `applied: false`); a shell row whose draft and
 * live composition match still goes through the bake (cheap, one row +
 * snapshot update).
 *
 * Called from the page-level publish action so a single Publish click
 * promotes BOTH the homepage AND the shell — operator never has to know
 * the shell is a separate row. Same builder product, same publish trust.
 *
 * Service-role write; auth/scope check is done by the caller (the publish
 * action runs requireStaff + requireEditSurfaceTenantScope before invoking this).
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Locale } from "@/i18n/config";
import { getSectionType } from "@/lib/site-admin/sections/registry";
import type { HomepageSnapshot } from "@/lib/site-admin/server/homepage";
import { buildLegacySectionBuilderTree } from "@/lib/site-admin/builder-node/snapshot-slot-bridge";
import {
  resolveBuilderTreeClassRefs,
  type BuilderStyleClassRegistry,
} from "@/lib/site-admin/builder-node/style-classes";
import { coerceStyleClassRegistry } from "@/lib/site-admin/builder-node/style-registry-coerce";

export type ShellRepublishResult =
  | { ok: true; applied: true; sectionCount: number; pageVersion: number }
  | { ok: true; applied: false; reason: string }
  | { ok: false; error: string };

interface ShellRow {
  id: string;
  title: string;
  meta_description: string | null;
  template_schema_version: number | null;
  version: number;
  /** F2 — the freeform draft tree. Authoritative for the baked builderTree. */
  blocks: unknown;
  /** STYLE-1 — site-scoped class registry baked into the published tree. */
  style_classes?: unknown;
}

interface DraftSlotRow {
  section_id: string;
  slot_key: string;
  sort_order: number;
}

interface SectionFacts {
  type: string;
  ver: number;
  name: string;
  props: Record<string, unknown>;
}

/**
 * F2 — resolve the `builderTree` that goes into the shell's published snapshot.
 *
 * THE DATA-LOSS BUG THIS FIXES
 * ----------------------------
 * This function is the ONE place the shell snapshot is baked, and it is called
 * from four places:
 *
 *   - publishSiteShellRow            (the shell builder's own Publish)
 *   - site-header/actions.ts         (the legacy SiteHeaderInspector autosave)
 *   - composition-actions.ts         (publishing the HOMEPAGE)
 *   - page-composer-action.ts        (the page composer)
 *
 * It used to hardcode `builderTree: buildLegacySectionBuilderTree(slots)` —
 * a tree derived purely from the slot composition. `publishSiteShellRow`
 * compensated by re-overlaying the freeform `blocks` tree onto the snapshot
 * immediately afterwards. The other three callers did not.
 *
 * So: operator edits the shell's freeform content and publishes it (fine), then
 * publishes the HOMEPAGE, and the homepage publish silently rebakes the shell
 * snapshot from slots alone — wiping the freeform shell content off the LIVE
 * site. Nothing errors. Same for a SiteHeaderInspector autosave.
 *
 * The fix is to make the freeform tree authoritative HERE, so every caller gets
 * it and no caller has to remember to re-overlay. `publishSiteShellRow` was
 * already doing exactly this substitution after the fact, so this is not a new
 * behaviour — it is the proven behaviour, moved to where every path shares it.
 *
 * An EMPTY / non-array `blocks` still falls back to the slot-derived tree, which
 * is what every pre-freeform tenant has. That keeps the legacy path byte-stable.
 */
export function resolveShellSnapshotBuilderTree(
  blocks: unknown,
  slots: ReadonlyArray<Parameters<typeof buildLegacySectionBuilderTree>[0][number]>,
  styleClasses?: BuilderStyleClassRegistry,
) {
  const tree =
    Array.isArray(blocks) && blocks.length > 0
      ? (blocks as ReturnType<typeof buildLegacySectionBuilderTree>)
      : buildLegacySectionBuilderTree(slots);
  return resolveBuilderTreeClassRefs(tree, styleClasses);
}

export async function republishSiteShellSnapshot(
  supabase: SupabaseClient,
  params: { tenantId: string; locale: Locale; actorProfileId: string | null },
): Promise<ShellRepublishResult> {
  const { tenantId, locale } = params;

  // 1. Find the shell row. Skip if missing — tenant simply isn't on the
  //    shell path.
  const { data: shell } = await supabase
    .from("cms_pages")
    .select("id, title, meta_description, template_schema_version, version, blocks, style_classes")
    .eq("tenant_id", tenantId)
    .eq("locale", locale)
    .eq("system_template_key", "site_shell")
    .neq("status", "archived")
    .maybeSingle<ShellRow>();
  if (!shell) {
    return { ok: true, applied: false, reason: "no_shell_row" };
  }

  // 2. Pull the shell's draft composition. Falls back to live composition
  //    when no draft rows exist (operator hasn't edited since last publish);
  //    publishing in that case is still a no-op-ish bake against existing
  //    section props but advances version + bust caches.
  const { data: draftRowsRaw } = await supabase
    .from("cms_page_sections")
    .select("section_id, slot_key, sort_order")
    .eq("tenant_id", tenantId)
    .eq("page_id", shell.id)
    .eq("is_draft", true)
    .order("slot_key", { ascending: true })
    .order("sort_order", { ascending: true });
  let draftRows = (draftRowsRaw ?? []) as DraftSlotRow[];
  if (draftRows.length === 0) {
    const { data: liveRowsRaw } = await supabase
      .from("cms_page_sections")
      .select("section_id, slot_key, sort_order")
      .eq("tenant_id", tenantId)
      .eq("page_id", shell.id)
      .eq("is_draft", false)
      .order("slot_key", { ascending: true })
      .order("sort_order", { ascending: true });
    draftRows = (liveRowsRaw ?? []) as DraftSlotRow[];
  }
  if (draftRows.length === 0) {
    return { ok: true, applied: false, reason: "shell_has_no_sections" };
  }

  // 3. Resolve section facts (type, version, props).
  const sectionIds = draftRows.map((r) => r.section_id);
  const { data: sectionRowsRaw } = await supabase
    .from("cms_sections")
    .select("id, section_type_key, schema_version, name, props_jsonb, status")
    .eq("tenant_id", tenantId)
    .in("id", sectionIds);
  const factsById = new Map<string, SectionFacts>();
  for (const r of sectionRowsRaw ?? []) {
    if ((r as { status?: string }).status === "archived") continue;
    factsById.set(r.id as string, {
      type: r.section_type_key as string,
      ver: r.schema_version as number,
      name: r.name as string,
      props: ((r.props_jsonb as Record<string, unknown> | null) ?? {}),
    });
  }

  // 4. Validate every shell section type is a registered shell-eligible
  //    type. We deliberately allow any registered type (visibleToAgency
  //    doesn't gate the snapshot — operator may have whitelisted other
  //    types via the future shell composer).
  const slots = [];
  for (const r of draftRows) {
    const f = factsById.get(r.section_id);
    if (!f) continue;
    const reg = getSectionType(f.type);
    if (!reg) continue;
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
    return { ok: true, applied: false, reason: "all_sections_archived" };
  }

  // 5. Bake snapshot + flip page row to published.
  const nowIso = new Date().toISOString();
  const nextVersion = shell.version + 1;
  const snapshot: HomepageSnapshot = {
    version: 1,
    publishedAt: nowIso,
    pageVersion: nextVersion,
    locale: locale as HomepageSnapshot["locale"],
    fields: {
      title: shell.title,
      metaDescription: shell.meta_description,
      introTagline: null,
    },
    templateSchemaVersion: shell.template_schema_version ?? 1,
    slots,
    // F2 — the freeform `blocks` tree wins when present. See
    // `resolveShellSnapshotBuilderTree` for why this must live here and not in
    // one caller: a homepage publish used to rebake this from slots alone and
    // silently wipe the shell's freeform content off the live site.
    builderTree: resolveShellSnapshotBuilderTree(
      shell.blocks,
      slots,
      coerceStyleClassRegistry(shell.style_classes),
    ),
  };
  const { error: updErr } = await supabase
    .from("cms_pages")
    .update({
      status: "published",
      published_at: nowIso,
      published_page_snapshot: snapshot,
      version: nextVersion,
      updated_by: params.actorProfileId,
    })
    .eq("id", shell.id)
    .eq("tenant_id", tenantId)
    .eq("version", shell.version);
  if (updErr) {
    return {
      ok: false,
      error: `Couldn't publish site shell: ${updErr.message}`,
    };
  }

  // 6. Replace live section pointers with the freshly-snapshotted set.
  await supabase
    .from("cms_page_sections")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("page_id", shell.id)
    .eq("is_draft", false);
  const liveInserts = draftRows.map((r) => ({
    tenant_id: tenantId,
    page_id: shell.id,
    section_id: r.section_id,
    slot_key: r.slot_key,
    sort_order: r.sort_order,
    is_draft: false,
  }));
  await supabase.from("cms_page_sections").insert(liveInserts);

  return {
    ok: true,
    applied: true,
    sectionCount: slots.length,
    pageVersion: nextVersion,
  };
}
