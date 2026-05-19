/**
 * Phase 3 Step 1 — directory system-page seed.
 *
 * Idempotently seeds + publishes a tenant's `directory` system page (one
 * per locale): a single `directory` section instance from the library
 * default (= `fashionDirectoryPreset`) at the fenced system slug
 * `__directory__`, then a hand-rolled publish so the snapshot exists for
 * the `/directory` route adapter to resolve.
 *
 * Faithful mirror of `seedSiteShellForTenant`
 * (`edit-mode/site-shell-backfill-action.ts`) — same service-role INSERT
 * shape, same hand-rolled publish (the shared `publishPageSnapshot`
 * rejects non-homepage system keys, so site-shell hand-rolled it and so
 * do we). Fenced `__directory__` slug = non-collidable + `/p/__directory__`
 * 404s cleanly (double-underscore fails `isValidSlugPath`), exactly like
 * `__site_shell__`.
 *
 * Idempotency: a tenant that already has a `system_template_key='directory'`
 * row is a no-op (returns the existing id). Safe to re-run / backfill.
 */

import { DEFAULT_PLATFORM_LOCALE } from "@/lib/site-admin";
import { sectionUpsertSchema } from "@/lib/site-admin/forms/sections";
import {
  getSectionType,
  type SectionTypeKey,
} from "@/lib/site-admin/sections/registry";
import { upsertSection } from "@/lib/site-admin/server/sections";
import { getLibraryDefault } from "@/lib/site-admin/sections/shared/default-content";
import type { HomepageSnapshot } from "@/lib/site-admin/server/homepage";
import { buildLegacySectionBuilderTree } from "@/lib/site-admin/builder-node/snapshot-slot-bridge";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { revalidateTag } from "next/cache";
import { tagFor } from "@/lib/site-admin/cache-tags";

/** Fenced system slug — mirrors `RESERVED_SHELL_SLUG='__site_shell__'`. */
export const RESERVED_DIRECTORY_SLUG = "__directory__";

type Admin = ReturnType<typeof createServiceRoleClient> & {};

export type EnsureDirectoryResult =
  | {
      ok: true;
      pageId: string;
      sectionId: string;
      action: "created" | "already_existed";
    }
  | { ok: false; error: string };

export async function ensureDirectoryPage(args: {
  admin: Admin;
  tenantId: string;
  actorProfileId: string;
}): Promise<EnsureDirectoryResult> {
  const { admin, tenantId, actorProfileId } = args;
  // Mirror site-shell: seed the DEFAULT_PLATFORM_LOCALE row only.
  const locale = DEFAULT_PLATFORM_LOCALE;

  // ── 1. Idempotency check ─────────────────────────────────────────────
  const { data: existing } = await admin
    .from("cms_pages")
    .select("id, status")
    .eq("tenant_id", tenantId)
    .eq("locale", locale)
    .eq("system_template_key", "directory")
    .maybeSingle();

  if (existing) {
    return {
      ok: true,
      pageId: existing.id as string,
      sectionId: "",
      action: "already_existed",
    };
  }

  // ── 2. Create the directory section from the library default ─────────
  const reg = getSectionType("directory");
  if (!reg) {
    return {
      ok: false,
      error: "directory section type missing from registry — should never happen.",
    };
  }
  const defaults = getLibraryDefault("directory");
  const create = sectionUpsertSchema.safeParse({
    tenantId,
    sectionTypeKey: "directory" as SectionTypeKey,
    schemaVersion: reg.currentVersion,
    props: defaults.props,
    expectedVersion: 0 as const,
    name: defaults.name,
  });
  if (!create.success) {
    return {
      ok: false,
      error: `directory schema rejected the seed payload: ${create.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    };
  }
  const secRes = await upsertSection(admin, {
    tenantId,
    values: create.data,
    actorProfileId,
  });
  if (!secRes.ok) {
    return {
      ok: false,
      error: `couldn't create directory section: ${secRes.message}`,
    };
  }

  // ── 3. Create the page row (direct service-role INSERT) ──────────────
  const nowIso = new Date().toISOString();
  const { data: page, error: pageErr } = await admin
    .from("cms_pages")
    .insert({
      tenant_id: tenantId,
      locale,
      slug: RESERVED_DIRECTORY_SLUG,
      template_key: "page",
      template_schema_version: 1,
      system_template_key: "directory",
      is_system_owned: true,
      title: "Directory",
      status: "draft",
      version: 1,
      created_by: actorProfileId,
      updated_by: actorProfileId,
    })
    .select("id, version")
    .single();
  if (pageErr || !page) {
    return {
      ok: false,
      error: `couldn't create directory page row: ${pageErr?.message ?? "unknown"}`,
    };
  }

  // ── 4. Insert the section pointer (single 'main' slot) ───────────────
  const { error: rowsErr } = await admin.from("cms_page_sections").insert([
    {
      tenant_id: tenantId,
      page_id: page.id,
      section_id: secRes.data.id,
      slot_key: "main",
      sort_order: 0,
      is_draft: true,
    },
  ]);
  if (rowsErr) {
    return {
      ok: false,
      error: `couldn't insert directory section row: ${rowsErr.message}`,
    };
  }

  // ── 5. Hand-rolled publish (mirror site-shell:280+) ──────────────────
  const snapshotSlots = [
    {
      slotKey: "main",
      sortOrder: 0,
      sectionId: secRes.data.id,
      sectionTypeKey: "directory",
      schemaVersion: reg.currentVersion,
      name: create.data.name,
      props: create.data.props,
    },
  ];
  const snapshot: HomepageSnapshot = {
    version: 1,
    publishedAt: nowIso,
    pageVersion: 2,
    locale,
    fields: {
      title: "Directory",
      metaDescription: null,
      introTagline: null,
    },
    templateSchemaVersion: 1,
    slots: snapshotSlots,
    builderTree: buildLegacySectionBuilderTree(snapshotSlots),
  };

  const { error: pubErr } = await admin
    .from("cms_pages")
    .update({
      status: "published",
      published_at: nowIso,
      published_page_snapshot: snapshot,
      version: 2,
      updated_by: actorProfileId,
    })
    .eq("id", page.id)
    .eq("tenant_id", tenantId)
    .eq("version", 1);
  if (pubErr) {
    return {
      ok: false,
      error: `couldn't publish directory snapshot: ${pubErr.message}`,
    };
  }

  // Flip draft rows to live.
  await admin
    .from("cms_page_sections")
    .update({ is_draft: false })
    .eq("tenant_id", tenantId)
    .eq("page_id", page.id);

  // Cache-bust public reads (match site-shell publish).
  try {
    revalidateTag(tagFor(tenantId, "pages-all"), "default");
    revalidateTag(tagFor(tenantId, "storefront"), "default");
  } catch {
    // tag system may not be initialised in test contexts.
  }

  return {
    ok: true,
    pageId: page.id as string,
    sectionId: secRes.data.id,
    action: "created",
  };
}
