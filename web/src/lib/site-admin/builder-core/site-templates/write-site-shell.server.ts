/**
 * write-site-shell.server.ts — create or replace a tenant's FREEFORM site
 * shell (header + footer) from a Look, at provisioning time.
 *
 * Mirrors what `scripts/impronta-rebuild/shell/seed-shell.ts` proved on the
 * live Impronta site (and documents at length): the shell row is a
 * `cms_pages` row with `system_template_key = 'site_shell'`; its `blocks` is
 * exactly two landmark sections (`site_header`, `site_footer`) marked
 * `ejected: true` so the curated bars do not render on top of ours; each
 * landmark carries the REAL anchor `sectionId` + `sortOrder` of a
 * `cms_page_sections` pointer, because `PublishedShell` looks the landmark up
 * by that address. Anchors are created when missing (draft + live pointers).
 *
 * Publishing goes through the vetted `republishSiteShellSnapshot`, never a
 * hand-written snapshot.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { Locale } from "@/i18n/config";
import { republishSiteShellSnapshot } from "@/lib/site-admin/edit-mode/site-shell-publish";
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { validateBuilderNodeTree } from "@/lib/site-admin/builder-node/validate";
import { logServerError } from "@/lib/server/safe-error";

export const RESERVED_SHELL_SLUG = "__site_shell__";

type SlotKey = "header" | "footer";

async function ensureAnchor(admin: SupabaseClient, input: { tenantId: string; pageId: string; slotKey: SlotKey; businessName: string; locale: string }): Promise<{ sectionId: string; sortOrder: number } | { error: string }> {
  const { data: existing, error: readErr } = await admin
    .from("cms_page_sections")
    .select("section_id, is_draft, sort_order")
    .eq("tenant_id", input.tenantId)
    .eq("page_id", input.pageId)
    .eq("slot_key", input.slotKey)
    .returns<Array<{ section_id: string; is_draft: boolean; sort_order: number | null }>>();
  if (readErr) return { error: readErr.message };
  const source = (existing ?? []).find((r) => r.is_draft) ?? (existing ?? [])[0];
  if (source?.section_id) return { sectionId: source.section_id, sortOrder: source.sort_order ?? 0 };

  const sectionTypeKey = input.slotKey === "header" ? "site_header" : "site_footer";
  const sortOrder = input.slotKey === "header" ? 0 : 1;
  const { data: section, error: sectionErr } = await admin
    .from("cms_sections")
    // `cms_sections (tenant_id, name)` is unique: name the anchor per locale.
    .insert({ tenant_id: input.tenantId, section_type_key: sectionTypeKey, schema_version: 1, name: `Site ${input.slotKey} (${input.locale})`, props_jsonb: {}, version: 1 })
    .select("id")
    .single<{ id: string }>();
  if (sectionErr || !section) return { error: sectionErr?.message ?? "anchor insert failed" };
  for (const isDraft of [true, false]) {
    const { error } = await admin.from("cms_page_sections").insert({ tenant_id: input.tenantId, page_id: input.pageId, section_id: section.id, slot_key: input.slotKey, sort_order: sortOrder, is_draft: isDraft });
    if (error) return { error: error.message };
  }
  return { sectionId: section.id, sortOrder };
}

export function buildShellLandmarks(input: { header: BuilderNode[]; footer: BuilderNode[]; anchors: Record<SlotKey, { sectionId: string; sortOrder: number }> }): BuilderNode[] {
  const landmark = (slot: SlotKey, children: BuilderNode[]): BuilderNode =>
    ({
      id: `look-shell-${slot}`,
      kind: "section",
      props: {
        sectionId: input.anchors[slot].sectionId,
        sectionTypeKey: slot === "header" ? "site_header" : "site_footer",
        slotKey: slot,
        sortOrder: input.anchors[slot].sortOrder,
        label: slot === "header" ? "Site header" : "Site footer",
        ejected: true,
      },
      children,
    }) as BuilderNode;
  return [landmark("header", input.header), landmark("footer", input.footer)];
}

export async function writeFreeformSiteShell(
  admin: SupabaseClient,
  input: {
    tenantId: string;
    locale: Locale;
    actorProfileId: string | null;
    businessName: string;
    header: BuilderNode[];
    footer: BuilderNode[];
    publish: boolean;
    /** When false and a shell with content already exists, leave it alone. */
    overwrite: boolean;
  },
): Promise<{ ok: true; pageId: string; action: "created" | "updated" | "kept"; published: boolean } | { ok: false; error: string }> {
  try {
    const { data: rows, error: readErr } = await admin
      .from("cms_pages")
      .select("id, blocks, version")
      .eq("tenant_id", input.tenantId)
      .eq("locale", input.locale)
      .eq("system_template_key", "site_shell")
      .neq("status", "archived")
      .order("created_at", { ascending: true })
      .limit(1)
      .returns<Array<{ id: string; blocks: unknown; version: number }>>();
    if (readErr) return { ok: false, error: readErr.message };
    let pageId = rows?.[0]?.id ?? null;
    let action: "created" | "updated" | "kept" = "updated";

    if (pageId && !input.overwrite && Array.isArray(rows?.[0]?.blocks) && (rows![0].blocks as unknown[]).length > 0) {
      return { ok: true, pageId, action: "kept", published: false };
    }

    if (!pageId) {
      const { data: page, error: insErr } = await admin
        .from("cms_pages")
        .insert({
          tenant_id: input.tenantId,
          locale: input.locale,
          slug: RESERVED_SHELL_SLUG,
          template_key: "page",
          template_schema_version: 1,
          system_template_key: "site_shell",
          is_system_owned: true,
          title: `${input.businessName} site shell`,
          status: "draft",
          version: 1,
          created_by: input.actorProfileId,
          updated_by: input.actorProfileId,
        })
        .select("id")
        .single<{ id: string }>();
      if (insErr || !page) return { ok: false, error: `shell row: ${insErr?.message ?? "insert failed"}` };
      pageId = page.id;
      action = "created";
    }

    const anchors: Partial<Record<SlotKey, { sectionId: string; sortOrder: number }>> = {};
    for (const slot of ["header", "footer"] as const) {
      const a = await ensureAnchor(admin, { tenantId: input.tenantId, pageId, slotKey: slot, businessName: input.businessName, locale: input.locale });
      if ("error" in a) return { ok: false, error: `anchor ${slot}: ${a.error}` };
      anchors[slot] = a;
    }

    const tree = buildShellLandmarks({ header: input.header, footer: input.footer, anchors: anchors as Record<SlotKey, { sectionId: string; sortOrder: number }> });
    const gate = validateBuilderNodeTree(tree);
    if (!gate.ok) return { ok: false, error: `shell tree: ${gate.issues.map((i) => `${i.path} ${i.message}`).join("; ")}` };

    const { error: updErr } = await admin
      .from("cms_pages")
      .update({ blocks: gate.tree, updated_at: new Date().toISOString(), updated_by: input.actorProfileId })
      .eq("id", pageId)
      .eq("tenant_id", input.tenantId);
    if (updErr) return { ok: false, error: `shell blocks: ${updErr.message}` };

    let published = false;
    if (input.publish) {
      const res = await republishSiteShellSnapshot(admin, { tenantId: input.tenantId, locale: input.locale, actorProfileId: input.actorProfileId });
      published = res.ok && "applied" in res ? res.applied !== false : res.ok;
      if (!res.ok) logServerError("site-templates.shell.publish", new Error(JSON.stringify(res)));
    }
    return { ok: true, pageId, action, published };
  } catch (error) {
    logServerError("site-templates.shell.write", error);
    return { ok: false, error: error instanceof Error ? error.message : "shell write failed" };
  }
}
