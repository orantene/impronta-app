/**
 * Phase 5 / M3 — page server operations.
 *
 * Consumed by the `/admin/site-settings/pages` Server Actions. All writes go
 * through this module so CAS / audit / revision / cache-bust discipline is
 * enforced uniformly.
 *
 * Four lifecycles:
 *   - DRAFT CRUD    — `upsertPage`, `deletePage` (CAS, audit, revision kind='draft')
 *   - PUBLISH       — `publishPage`       (CAS, publish-ready gates, cache bust)
 *   - ARCHIVE       — `archivePage`       (CAS, cache bust)
 *   - ROLLBACK      — `restorePageRevision`
 *     (loads revision snapshot, writes new page row version bumped, kind='rollback')
 *
 * Capability gates:
 *   - edit / archive / delete / restore → agency.site_admin.pages.edit
 *   - publish                           → agency.site_admin.pages.publish
 *
 * System page discipline (guardrail §6 / §11):
 *   - The DB trigger `cms_pages_system_ownership_guard` blocks delete of
 *     system-owned rows and blocks mutations of slug/locale/template_key/
 *     is_system_owned/system_template_key.
 *   - The Zod upsert schema restricts `templateKey` to agency-selectable
 *     values (`standard_page`) — homepage is seeded via M5, never created
 *     from this path.
 *   - When the trigger raises ERRCODE '42501' with a SYSTEM_PAGE_IMMUTABLE
 *     message, we surface it as the `SYSTEM_PAGE_IMMUTABLE` Phase 5 code.
 *
 * Reserved slug discipline:
 *   - Layer 1 Zod (`pageSlugSchema.superRefine(tenantSlugRefinement)`)
 *   - Layer 2 DB trigger (`cms_pages_reserved_slug_guard`) → '42501' here
 *     surfaced as `RESERVED_SLUG`.
 */

import { improntaLog } from "@/lib/server/structured-log";
import { randomUUID } from "node:crypto";
import { updateTag } from "next/cache";
import type { SupabaseClient, PostgrestError } from "@supabase/supabase-js";

import {
  scheduleAuditEvent,
  fail,
  ok,
  requirePhase5Capability,
  tagFor,
  versionConflict,
  type Phase5Result,
} from "@/lib/site-admin";
import { resolveAdditionalPageDenial } from "./page-quota";
import { getTemplate } from "@/lib/site-admin/templates/registry";
import { resolveSnapshotBuilderTree } from "@/lib/site-admin/builder-node/snapshot-tree";
import type { LegacySnapshotSlot } from "@/lib/site-admin/builder-node/snapshot-slot-bridge";
import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";
import { recoverBuilderTreeIfEmpty } from "./recover-builder-tree";
import { loadRoleDeletionBlockReason } from "./page-deletion-guard";
import type { Locale } from "@/lib/site-admin/locales";
import type {
  PageArchiveValues,
  PageDeleteValues,
  PagePublishValues,
  PageRestoreRevisionValues,
  PageUpsertValues,
} from "@/lib/site-admin/forms/pages";

// ---- row shapes -----------------------------------------------------------

export type PageStatus = "draft" | "published" | "archived";

export interface PageRow {
  id: string;
  tenant_id: string;
  locale: Locale;
  slug: string;
  template_key: string;
  system_template_key: string | null;
  is_system_owned: boolean;
  template_schema_version: number;
  title: string;
  status: PageStatus;
  body: string;
  hero: Record<string, unknown>;
  meta_title: string | null;
  meta_description: string | null;
  og_title: string | null;
  og_description: string | null;
  og_image_url: string | null;
  og_image_media_asset_id: string | null;
  noindex: boolean;
  include_in_sitemap: boolean;
  canonical_url: string | null;
  published_at: string | null;
  version: number;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
  /** Future publish-fire time set from the editor's Schedule drawer. Null
   *  when the page isn't scheduled. `status` stays as-is (typically
   *  `draft`) until the cron sweep in `/api/cron/publish-scheduled` fires
   *  and flips it to `published` — see WebsitePageRow status derivation
   *  in `state/website-page-status.ts` for how the admin Pages grid
   *  surfaces this as a UI-only "scheduled" status. */
  scheduled_publish_at: string | null;
  /** Profile id of whoever set `scheduled_publish_at`. Null when unset. */
  scheduled_by: string | null;
}

export interface PageRevisionRow {
  id: string;
  tenant_id: string;
  page_id: string;
  kind: "draft" | "published" | "rollback";
  version: number;
  template_schema_version: number;
  snapshot: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
  /** Operator-assigned named version. Null/absent = unlabeled. */
  label?: string | null;
}

const PAGE_COLUMNS = `
  id,
  tenant_id,
  locale,
  slug,
  template_key,
  system_template_key,
  is_system_owned,
  template_schema_version,
  title,
  status,
  body,
  hero,
  meta_title,
  meta_description,
  og_title,
  og_description,
  og_image_url,
  og_image_media_asset_id,
  noindex,
  include_in_sitemap,
  canonical_url,
  published_at,
  version,
  created_by,
  updated_by,
  created_at,
  updated_at,
  scheduled_publish_at,
  scheduled_by
`;

const REVISION_COLUMNS = `
  id,
  tenant_id,
  page_id,
  kind,
  version,
  template_schema_version,
  snapshot,
  created_by,
  created_at
`;

// ---- helpers --------------------------------------------------------------

/**
 * Map a PostgrestError raised by a DB trigger into a Phase 5 error code. The
 * trigger messages start with a stable prefix ("SYSTEM_PAGE_IMMUTABLE",
 * "RESERVED_SLUG", "MEDIA_REF_BROKEN") so we key off that before falling back.
 */
function mapTriggerError(error: PostgrestError): Phase5Result<never> {
  const msg = error.message ?? "";
  if (msg.includes("SYSTEM_PAGE_IMMUTABLE")) {
    return fail("SYSTEM_PAGE_IMMUTABLE", msg);
  }
  if (msg.includes("RESERVED_SLUG")) {
    return fail("RESERVED_SLUG", msg);
  }
  if (msg.includes("MEDIA_REF_BROKEN")) {
    return fail("MEDIA_REF_BROKEN", msg);
  }
  return fail("FORBIDDEN", msg);
}

/**
 * Project Zod upsert values into the `cms_pages` row shape.
 */
function toPageRowFields(values: PageUpsertValues, actorProfileId: string | null) {
  return {
    tenant_id: values.tenantId,
    locale: values.locale,
    slug: values.slug,
    template_key: values.templateKey,
    template_schema_version: values.templateSchemaVersion,
    title: values.title,
    body: values.body ?? "",
    hero: values.hero ?? {},
    meta_title: values.metaTitle ?? null,
    meta_description: values.metaDescription ?? null,
    og_title: values.ogTitle ?? null,
    og_description: values.ogDescription ?? null,
    og_image_media_asset_id: values.ogImageMediaAssetId ?? null,
    noindex: values.noindex,
    include_in_sitemap: values.includeInSitemap,
    canonical_url: values.canonicalUrl ?? null,
    updated_by: actorProfileId,
  };
}

/**
 * Project a PageRow into the JSONB snapshot persisted in `cms_page_revisions`.
 * The snapshot captures all editor-visible fields so a rollback restores the
 * authored content exactly (modulo template-schema migrations on read).
 */
function snapshotFromRow(row: PageRow): Record<string, unknown> {
  return {
    locale: row.locale,
    slug: row.slug,
    template_key: row.template_key,
    system_template_key: row.system_template_key,
    is_system_owned: row.is_system_owned,
    template_schema_version: row.template_schema_version,
    title: row.title,
    status: row.status,
    body: row.body,
    hero: row.hero,
    meta_title: row.meta_title,
    meta_description: row.meta_description,
    og_title: row.og_title,
    og_description: row.og_description,
    og_image_url: row.og_image_url,
    og_image_media_asset_id: row.og_image_media_asset_id,
    noindex: row.noindex,
    include_in_sitemap: row.include_in_sitemap,
    canonical_url: row.canonical_url,
    version: row.version,
  };
}

async function insertPageRevision(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    pageId: string;
    kind: "draft" | "published" | "rollback";
    version: number;
    templateSchemaVersion: number;
    snapshot: Record<string, unknown>;
    actorProfileId: string | null;
  },
): Promise<void> {
  const { error } = await supabase.from("cms_page_revisions").insert({
    tenant_id: params.tenantId,
    page_id: params.pageId,
    kind: params.kind,
    version: params.version,
    template_schema_version: params.templateSchemaVersion,
    snapshot: params.snapshot,
    created_by: params.actorProfileId,
  });
  if (error) {
    void improntaLog("site_admin_pages.warn", {
      message: "[site-admin/pages] revision insert failed",
      tenantId: params.tenantId,
      pageId: params.pageId,
      kind: params.kind,
      version: params.version,
      error: error.message,
    });
  }
}

// ---- draft-content helpers (WAVE 1 — cms-page lane parity) ----------------
//
// Ordinary cms pages carry their real content in TWO places the page-field
// columns know nothing about: `cms_page_sections` (curated slot rows) and the
// `builderTree` stored in `cms_page_revisions.snapshot`. `restorePageRevision`
// used to rewrite the page-field columns only, which made restore both
// INEFFECTIVE (sections/tree unchanged) and DESTRUCTIVE (the version bump moved
// the pointer to a revision with no tree, so the next editor load painted an
// empty canvas and autosaved the emptiness forward). These helpers give the
// page lane the same content-restore the homepage lane has had since #310.

/** One composition entry as stored in a cms-page revision snapshot. */
interface StoredCompositionEntry {
  slotKey: string;
  sortOrder: number;
  sectionId: string;
  sectionTypeKey?: string;
  name?: string;
  props?: Record<string, unknown>;
}

function readStoredComposition(snapshot: unknown): StoredCompositionEntry[] {
  if (!snapshot || typeof snapshot !== "object") return [];
  const raw = (snapshot as { composition?: unknown }).composition;
  if (!Array.isArray(raw)) return [];
  const out: StoredCompositionEntry[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.sectionId !== "string" || typeof e.slotKey !== "string") continue;
    out.push({
      slotKey: e.slotKey,
      sortOrder: typeof e.sortOrder === "number" ? e.sortOrder : 0,
      sectionId: e.sectionId,
      sectionTypeKey:
        typeof e.sectionTypeKey === "string" ? e.sectionTypeKey : undefined,
      name: typeof e.name === "string" ? e.name : undefined,
      props:
        e.props && typeof e.props === "object"
          ? (e.props as Record<string, unknown>)
          : undefined,
    });
  }
  return out;
}

function readStoredBuilderTree(snapshot: unknown): unknown {
  if (!snapshot || typeof snapshot !== "object") return undefined;
  return (snapshot as { builderTree?: unknown }).builderTree;
}

function toLegacySlots(
  entries: ReadonlyArray<StoredCompositionEntry>,
): LegacySnapshotSlot[] {
  return entries.map((e) => ({
    slotKey: e.slotKey,
    sortOrder: e.sortOrder,
    sectionId: e.sectionId,
    sectionTypeKey: e.sectionTypeKey ?? "unknown",
    name: e.name ?? "Section",
    props: e.props ?? {},
  }));
}

/** Read the page's CURRENT draft composition straight from the junction table. */
async function loadDraftCompositionEntries(
  supabase: SupabaseClient,
  tenantId: string,
  pageId: string,
): Promise<StoredCompositionEntry[]> {
  const { data } = await supabase
    .from("cms_page_sections")
    .select(
      "slot_key, section_id, sort_order, cms_sections:section_id(section_type_key, name, props_jsonb)",
    )
    .eq("tenant_id", tenantId)
    .eq("page_id", pageId)
    .eq("is_draft", true)
    .order("slot_key")
    .order("sort_order");
  const rows = (data ?? []) as unknown as Array<{
    slot_key: string;
    section_id: string;
    sort_order: number;
    cms_sections: {
      section_type_key: string;
      name: string;
      props_jsonb: Record<string, unknown> | null;
    } | null;
  }>;
  const out: StoredCompositionEntry[] = [];
  for (const row of rows) {
    if (!row.cms_sections) continue;
    out.push({
      slotKey: row.slot_key,
      sortOrder: row.sort_order,
      sectionId: row.section_id,
      sectionTypeKey: row.cms_sections.section_type_key,
      name: row.cms_sections.name,
      props: row.cms_sections.props_jsonb ?? {},
    });
  }
  return out;
}

/** The revision whose `version` matches the page row — the one the editor loads. */
async function loadVersionMatchedRevisionSnapshot(
  supabase: SupabaseClient,
  tenantId: string,
  pageId: string,
  version: number,
): Promise<unknown> {
  const { data } = await supabase
    .from("cms_page_revisions")
    .select("snapshot")
    .eq("tenant_id", tenantId)
    .eq("page_id", pageId)
    .eq("version", version)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<{ snapshot: unknown }>();
  return data?.snapshot ?? null;
}

/** Carry style extras through a revision write so a reload keeps linked styles. */
function pickStyleExtras(
  ...snapshots: ReadonlyArray<unknown>
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const snapshot of snapshots) {
    if (!snapshot || typeof snapshot !== "object") continue;
    const s = snapshot as Record<string, unknown>;
    if (out.styleClasses === undefined && s.styleClasses) {
      out.styleClasses = s.styleClasses;
    }
    if (out.stylePresets === undefined && s.stylePresets) {
      out.stylePresets = s.stylePresets;
    }
  }
  return out;
}

function bustPageTags(tenantId: string, pageId: string): void {
  updateTag(tagFor(tenantId, "pages", { id: pageId }));
  updateTag(tagFor(tenantId, "pages-all"));
}

// ---- upsert ---------------------------------------------------------------

/**
 * Create or update one cms_pages row (draft-side). Distinguished by presence
 * of `values.id`:
 *   - no id → INSERT (expectedVersion must be 0)
 *   - id    → UPDATE CAS on (id, tenant_id, version = expectedVersion)
 *
 * The DB system-ownership + reserved-slug triggers surface as
 * SYSTEM_PAGE_IMMUTABLE / RESERVED_SLUG. Does NOT bust public cache — only
 * `publishPage` does that.
 */
export async function upsertPage(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    values: PageUpsertValues;
    actorProfileId: string | null;
    correlationId?: string;
  },
): Promise<Phase5Result<{ id: string; version: number }>> {
  const { tenantId, values, actorProfileId } = params;
  const correlationId = params.correlationId ?? randomUUID();

  await requirePhase5Capability("agency.site_admin.pages.edit", tenantId);

  if (values.tenantId !== tenantId) {
    return fail("FORBIDDEN", "tenantId mismatch");
  }

  // Template key gate — registry must know it, and it must not be a
  // system-only template (homepage). The Zod schema already narrows to
  // agency-selectable keys; this is belt + braces against stale clients.
  const template = getTemplate(values.templateKey);
  if (!template) {
    return fail("VALIDATION_FAILED", `Unknown template: ${values.templateKey}`);
  }
  if (template.meta.systemOwned) {
    return fail(
      "SYSTEM_PAGE_IMMUTABLE",
      `Template ${values.templateKey} is system-owned; cannot be authored from this path`,
    );
  }

  const rowFields = toPageRowFields(values, actorProfileId);

  // --- CREATE ---
  if (!values.id) {
    if (values.expectedVersion !== 0) {
      return fail("VALIDATION_FAILED", "expectedVersion must be 0 on create");
    }

    // QUOTA — one gate, not two. This branch used to call
    // `cmsAdditionalPageDeniedReason(plan)` with NO page count, and that helper
    // fails CLOSED on an absent count ("assume the quota is spent"). So every
    // Free workspace was refused its FIRST operator page: "+ Add page",
    // "Duplicate" and "Describe with AI" all passed the outer gate in the
    // server action, rendered enabled, and then errored here -- which also made
    // the AI page generator unreachable for every new customer, since its other
    // entry point only appears on an empty canvas and the seeded homepage never
    // is one. `resolveAdditionalPageDenial` is the DEFAULT PAGES CONTRACT's one
    // evaluator (see page-quota.ts); routing this branch through it makes the
    // two answers identical by construction. Kept as a gate rather than deleted
    // because `upsertPage` is exported low-level CRUD: a future caller that
    // forgets the outer gate must still not get a free page.
    const deniedReason = await resolveAdditionalPageDenial(
      supabase,
      tenantId,
      "site-admin/pages/upsert.plan",
    );
    if (deniedReason) {
      return fail(
        "VALIDATION_FAILED",
        deniedReason,
      );
    }

    const { data, error } = await supabase
      .from("cms_pages")
      .insert({
        ...rowFields,
        status: "draft",
        version: 1,
        created_by: actorProfileId,
      })
      .select(PAGE_COLUMNS)
      .single<PageRow>();

    if (error || !data) {
      if (error) return mapTriggerError(error);
      return fail("FORBIDDEN", "Insert failed");
    }

    // Revision snapshot for the newly-created draft.
    await insertPageRevision(supabase, {
      tenantId,
      pageId: data.id,
      kind: "draft",
      version: data.version,
      templateSchemaVersion: data.template_schema_version,
      snapshot: snapshotFromRow(data),
      actorProfileId,
    });

    scheduleAuditEvent(supabase, {
      tenantId,
      actorProfileId,
      action: "agency.site_admin.pages.edit",
      entityType: "cms_pages",
      entityId: data.id,
      diffSummary: `page created (${values.locale}/${values.slug}): ${values.title}`,
      beforeSnapshot: null,
      afterSnapshot: data,
      correlationId,
    });

    return ok({ id: data.id, version: data.version });
  }

  // --- UPDATE (compare-and-set) ---
  const { data: beforeRow, error: loadErr } = await supabase
    .from("cms_pages")
    .select(PAGE_COLUMNS)
    .eq("id", values.id)
    .eq("tenant_id", tenantId)
    .maybeSingle<PageRow>();
  if (loadErr) return fail("FORBIDDEN", loadErr.message);
  if (!beforeRow) return fail("NOT_FOUND", "Page not found");

  if (beforeRow.version !== values.expectedVersion) {
    return versionConflict(beforeRow.version);
  }

  // When editing a system-owned page, the UI must keep slug/locale/
  // template_key locked to the stored values. The DB trigger also enforces
  // this; mirror the rejection here so the client gets a clean code path.
  if (beforeRow.is_system_owned) {
    if (
      beforeRow.slug !== values.slug ||
      beforeRow.locale !== values.locale ||
      beforeRow.template_key !== values.templateKey
    ) {
      return fail(
        "SYSTEM_PAGE_IMMUTABLE",
        "slug / locale / template_key cannot change on a system-owned page",
      );
    }
  }

  const nextVersion = beforeRow.version + 1;
  const { data, error } = await supabase
    .from("cms_pages")
    .update({ ...rowFields, version: nextVersion })
    .eq("id", values.id)
    .eq("tenant_id", tenantId)
    .eq("version", beforeRow.version)
    .select(PAGE_COLUMNS)
    .maybeSingle<PageRow>();

  if (error) return mapTriggerError(error);
  if (!data) return versionConflict(beforeRow.version + 1);

  await insertPageRevision(supabase, {
    tenantId,
    pageId: data.id,
    kind: "draft",
    version: data.version,
    templateSchemaVersion: data.template_schema_version,
    snapshot: snapshotFromRow(data),
    actorProfileId,
  });

  scheduleAuditEvent(supabase, {
    tenantId,
    actorProfileId,
    action: "agency.site_admin.pages.edit",
    entityType: "cms_pages",
    entityId: data.id,
    diffSummary: `page updated (${values.locale}/${values.slug}): ${values.title}`,
    beforeSnapshot: beforeRow,
    afterSnapshot: data,
    correlationId,
  });

  return ok({ id: data.id, version: data.version });
}

// ---- delete ---------------------------------------------------------------

/**
 * Hard-delete a cms_pages row (CAS). The system-ownership trigger blocks
 * deletion of is_system_owned rows; we surface that as SYSTEM_PAGE_IMMUTABLE.
 * Cache bust happens regardless so stale public reads for the id stop being
 * served.
 */
export async function deletePage(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    values: PageDeleteValues;
    actorProfileId: string | null;
    correlationId?: string;
  },
): Promise<Phase5Result<{ id: string }>> {
  const { tenantId, values, actorProfileId } = params;
  const correlationId = params.correlationId ?? randomUUID();

  await requirePhase5Capability("agency.site_admin.pages.edit", tenantId);

  const { data: beforeRow, error: loadErr } = await supabase
    .from("cms_pages")
    .select(PAGE_COLUMNS)
    .eq("id", values.id)
    .eq("tenant_id", tenantId)
    .maybeSingle<PageRow>();
  if (loadErr) return fail("FORBIDDEN", loadErr.message);
  if (!beforeRow) return fail("NOT_FOUND", "Page not found");

  if (beforeRow.is_system_owned) {
    return fail(
      "SYSTEM_PAGE_IMMUTABLE",
      "system-owned pages cannot be deleted",
    );
  }

  // DEFAULT PAGES CONTRACT — never delete the last `home` / `notFound` holder.
  // The role pointer would silently empty and the site would revert to the
  // built-in default with no warning. Swapping the role onto another published
  // page clears this block.
  const roleBlock = await loadRoleDeletionBlockReason(
    supabase,
    tenantId,
    beforeRow.slug,
    "delete",
  );
  if (roleBlock) {
    return fail("SYSTEM_PAGE_IMMUTABLE", roleBlock);
  }

  if (beforeRow.version !== values.expectedVersion) {
    return versionConflict(beforeRow.version);
  }

  const { error, count } = await supabase
    .from("cms_pages")
    .delete({ count: "exact" })
    .eq("id", values.id)
    .eq("tenant_id", tenantId)
    .eq("version", beforeRow.version);
  if (error) return mapTriggerError(error);
  if (!count) return versionConflict(beforeRow.version + 1);

  scheduleAuditEvent(supabase, {
    tenantId,
    actorProfileId,
    action: "agency.site_admin.pages.edit",
    entityType: "cms_pages",
    entityId: values.id,
    diffSummary: `page deleted (${beforeRow.locale}/${beforeRow.slug}): ${beforeRow.title}`,
    beforeSnapshot: beforeRow,
    afterSnapshot: null,
    correlationId,
  });

  bustPageTags(tenantId, values.id);

  return ok({ id: values.id });
}

// ---- publish --------------------------------------------------------------

/**
 * Transition a page from draft → published (or re-publish a previously
 * published page). Gates:
 *   1. capability: pages.publish
 *   2. CAS on version
 *   3. template current-version Zod parse of the editable payload
 *      (title/body/hero/meta_title/meta_description)
 *   4. first slug segment not reserved (Zod already checked; DB trigger too)
 *   5. og_image_media_asset_id, if set, references a live (non-soft-deleted)
 *      media asset — surfaces PUBLISH_NOT_READY
 *
 * On success:
 *   - status='published', published_at=now(), version bumped
 *   - cms_page_revisions snapshot with kind='published'
 *   - updateTag pages:{id} + pages-all
 */
export async function publishPage(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    values: PagePublishValues;
    actorProfileId: string | null;
    correlationId?: string;
    /**
     * Scheduled-publish cron escape hatch, mirroring `publishHomepage`'s flag
     * of the same name. When `true`, skips the `requirePhase5Capability`
     * check that would otherwise block a service-role caller with no
     * user-context membership row.
     *
     * ONLY `/api/cron/publish-scheduled` should set this. It gates on a
     * `CRON_SECRET` bearer, runs every other validation gate below unchanged
     * (CAS, template schema, OG image), and passes `actorProfileId` as the
     * operator who scheduled the publish so the audit row still names a human.
     */
    bypassCapabilityCheck?: boolean;
  },
): Promise<Phase5Result<{ id: string; version: number; publishedAt: string }>> {
  const { tenantId, values, actorProfileId } = params;
  const correlationId = params.correlationId ?? randomUUID();

  if (!params.bypassCapabilityCheck) {
    await requirePhase5Capability("agency.site_admin.pages.publish", tenantId);
  }

  const { data: beforeRow, error: loadErr } = await supabase
    .from("cms_pages")
    .select(PAGE_COLUMNS)
    .eq("id", values.id)
    .eq("tenant_id", tenantId)
    .maybeSingle<PageRow>();
  if (loadErr) return fail("FORBIDDEN", loadErr.message);
  if (!beforeRow) return fail("NOT_FOUND", "Page not found");

  if (beforeRow.version !== values.expectedVersion) {
    return versionConflict(beforeRow.version);
  }

  // --- gate 3: template schema parse ---
  const template = getTemplate(beforeRow.template_key);
  if (!template) {
    return fail(
      "VALIDATION_FAILED",
      `Unknown template: ${beforeRow.template_key}`,
    );
  }
  const schema = template.schemasByVersion[template.currentVersion];
  if (!schema) {
    return fail(
      "VALIDATION_FAILED",
      `Template ${beforeRow.template_key} missing current-version schema`,
    );
  }
  const parsed = schema.safeParse({
    title: beforeRow.title,
    body: beforeRow.body,
    metaTitle: beforeRow.meta_title ?? undefined,
    metaDescription: beforeRow.meta_description ?? undefined,
  });
  if (!parsed.success) {
    return fail(
      "PUBLISH_NOT_READY",
      `Template schema check failed: ${parsed.error.issues.map((i) => i.message).join("; ")}`,
    );
  }

  // --- gate 4: reserved slug (Zod + DB trigger already catch this, but
  // `beforeRow.slug` can be anything on a system-seeded row. Non-system
  // rows only reach here via upsert which already Zod-checked; re-run to
  // catch any historical drift). ---
  // Homepage (system-owned, slug may be '') is allowed because the trigger
  // already gates; we do not re-check here to avoid rejecting valid
  // system rows.

  // --- gate 5: og image media asset live ---
  if (beforeRow.og_image_media_asset_id) {
    const { data: mediaRow, error: mediaErr } = await supabase
      .from("media_assets")
      .select("id, deleted_at, tenant_id")
      .eq("id", beforeRow.og_image_media_asset_id)
      .eq("tenant_id", tenantId)
      .maybeSingle<{ id: string; deleted_at: string | null; tenant_id: string }>();
    if (mediaErr) {
      return fail("FORBIDDEN", mediaErr.message);
    }
    if (!mediaRow || mediaRow.deleted_at) {
      return fail(
        "PUBLISH_NOT_READY",
        "OG image media asset is missing or soft-deleted",
      );
    }
  }

  // --- apply publish ---
  const nextVersion = beforeRow.version + 1;
  const nowIso = new Date().toISOString();

  const { data: afterRow, error: updErr } = await supabase
    .from("cms_pages")
    .update({
      status: "published",
      published_at: nowIso,
      version: nextVersion,
      updated_by: actorProfileId,
    })
    .eq("id", values.id)
    .eq("tenant_id", tenantId)
    .eq("version", beforeRow.version)
    .select(PAGE_COLUMNS)
    .maybeSingle<PageRow>();
  if (updErr) return mapTriggerError(updErr);
  if (!afterRow) return versionConflict(beforeRow.version + 1);

  await insertPageRevision(supabase, {
    tenantId,
    pageId: afterRow.id,
    kind: "published",
    version: afterRow.version,
    templateSchemaVersion: afterRow.template_schema_version,
    snapshot: snapshotFromRow(afterRow),
    actorProfileId,
  });

  scheduleAuditEvent(supabase, {
    tenantId,
    actorProfileId,
    action: "agency.site_admin.pages.publish",
    entityType: "cms_pages",
    entityId: afterRow.id,
    diffSummary: `page published (${afterRow.locale}/${afterRow.slug}): v${nextVersion}`,
    beforeSnapshot: beforeRow,
    afterSnapshot: afterRow,
    correlationId,
  });

  bustPageTags(tenantId, afterRow.id);

  return ok({ id: afterRow.id, version: afterRow.version, publishedAt: nowIso });
}

// ---- archive --------------------------------------------------------------

/**
 * Archive a page (status → 'archived'). CAS. Busts public cache so the
 * storefront stops serving it even if the reader was within a revalidate
 * window. System pages cannot be archived (guardrail §6 — homepage is always
 * live). We surface SYSTEM_PAGE_IMMUTABLE in that case.
 */
export async function archivePage(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    values: PageArchiveValues;
    actorProfileId: string | null;
    correlationId?: string;
  },
): Promise<Phase5Result<{ id: string; version: number }>> {
  const { tenantId, values, actorProfileId } = params;
  const correlationId = params.correlationId ?? randomUUID();

  await requirePhase5Capability("agency.site_admin.pages.publish", tenantId);

  const { data: beforeRow, error: loadErr } = await supabase
    .from("cms_pages")
    .select(PAGE_COLUMNS)
    .eq("id", values.id)
    .eq("tenant_id", tenantId)
    .maybeSingle<PageRow>();
  if (loadErr) return fail("FORBIDDEN", loadErr.message);
  if (!beforeRow) return fail("NOT_FOUND", "Page not found");

  if (beforeRow.is_system_owned) {
    return fail(
      "SYSTEM_PAGE_IMMUTABLE",
      "system-owned pages cannot be archived",
    );
  }

  // Archiving unpublishes, and `resolveRolePageSlug` only serves a PUBLISHED
  // page — so archiving the home/404 holder empties the role just as surely as
  // deleting it. Same guard, same escape hatch.
  const roleBlock = await loadRoleDeletionBlockReason(
    supabase,
    tenantId,
    beforeRow.slug,
    "archive",
  );
  if (roleBlock) {
    return fail("SYSTEM_PAGE_IMMUTABLE", roleBlock);
  }

  if (beforeRow.version !== values.expectedVersion) {
    return versionConflict(beforeRow.version);
  }

  const nextVersion = beforeRow.version + 1;
  const { data: afterRow, error: updErr } = await supabase
    .from("cms_pages")
    .update({
      status: "archived",
      version: nextVersion,
      updated_by: actorProfileId,
    })
    .eq("id", values.id)
    .eq("tenant_id", tenantId)
    .eq("version", beforeRow.version)
    .select(PAGE_COLUMNS)
    .maybeSingle<PageRow>();
  if (updErr) return mapTriggerError(updErr);
  if (!afterRow) return versionConflict(beforeRow.version + 1);

  scheduleAuditEvent(supabase, {
    tenantId,
    actorProfileId,
    action: "agency.site_admin.pages.publish",
    entityType: "cms_pages",
    entityId: afterRow.id,
    diffSummary: `page archived (${afterRow.locale}/${afterRow.slug})`,
    beforeSnapshot: beforeRow,
    afterSnapshot: afterRow,
    correlationId,
  });

  bustPageTags(tenantId, afterRow.id);

  return ok({ id: afterRow.id, version: afterRow.version });
}

// ---- restore-from-revision ------------------------------------------------

/**
 * Roll a page back to a specific revision snapshot. Does NOT publish; the
 * restore writes a new DRAFT row and bumps the page version. The editor
 * UI then walks the operator through a fresh publish if desired.
 *
 * Behavior:
 *   1. capability: pages.edit
 *   2. CAS on current page version
 *   3. Load the revision row by (id, tenant, page_id); 404 otherwise
 *   4. Apply the snapshot's editable fields onto the cms_pages row:
 *      - body, hero, title, meta_*, og_*, noindex, include_in_sitemap,
 *        canonical_url
 *      - template_schema_version from the revision (migration map runs on
 *        read in M4+)
 *      - DOES NOT change slug/locale/template_key/is_system_owned (those
 *        are immutable on system pages and rarely desired on user pages)
 *   5. Write revision with kind='rollback' carrying the restored payload
 *   6. No cache bust — rollback produces a draft, not a publish.
 */
export async function restorePageRevision(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    values: PageRestoreRevisionValues;
    actorProfileId: string | null;
    correlationId?: string;
    /**
     * Internal dependency-injection seam (default-bound to the real impls),
     * IDENTICAL in shape to `restoreHomepageRevision`'s. Lets the unit test
     * drive the op without the auth / `after()` request-scope coupling that
     * `requirePhase5Capability` + `scheduleAuditEvent` carry. Production call
     * sites never pass it, so the capability check runs exactly as before.
     */
    __hooks?: {
      requireCapability?: typeof requirePhase5Capability;
      scheduleAudit?: typeof scheduleAuditEvent;
    };
  },
): Promise<Phase5Result<{ id: string; version: number }>> {
  const { tenantId, values, actorProfileId } = params;
  const correlationId = params.correlationId ?? randomUUID();
  const requireCapabilityFn =
    params.__hooks?.requireCapability ?? requirePhase5Capability;
  const scheduleAuditFn = params.__hooks?.scheduleAudit ?? scheduleAuditEvent;

  await requireCapabilityFn("agency.site_admin.pages.edit", tenantId);

  // 1. Load current page row + CAS check.
  const { data: beforeRow, error: pageErr } = await supabase
    .from("cms_pages")
    .select(PAGE_COLUMNS)
    .eq("id", values.pageId)
    .eq("tenant_id", tenantId)
    .maybeSingle<PageRow>();
  if (pageErr) return fail("FORBIDDEN", pageErr.message);
  if (!beforeRow) return fail("NOT_FOUND", "Page not found");

  if (beforeRow.version !== values.expectedVersion) {
    return versionConflict(beforeRow.version);
  }

  // 2. Load revision (tenant-scoped + page-scoped).
  const { data: revRow, error: revErr } = await supabase
    .from("cms_page_revisions")
    .select(REVISION_COLUMNS)
    .eq("id", values.revisionId)
    .eq("tenant_id", tenantId)
    .eq("page_id", values.pageId)
    .maybeSingle<PageRevisionRow>();
  if (revErr) return fail("FORBIDDEN", revErr.message);
  if (!revRow) return fail("NOT_FOUND", "Revision not found");

  // 3. Build update payload from the snapshot. Defensive: treat snapshot
  //    as Record<string, unknown> and coerce expected fields.
  const snap = revRow.snapshot as Record<string, unknown>;
  const updatePayload: Record<string, unknown> = {
    title: typeof snap.title === "string" ? snap.title : beforeRow.title,
    body: typeof snap.body === "string" ? snap.body : beforeRow.body,
    hero:
      snap.hero && typeof snap.hero === "object" ? snap.hero : beforeRow.hero,
    meta_title:
      typeof snap.meta_title === "string"
        ? snap.meta_title
        : snap.meta_title === null
          ? null
          : beforeRow.meta_title,
    meta_description:
      typeof snap.meta_description === "string"
        ? snap.meta_description
        : snap.meta_description === null
          ? null
          : beforeRow.meta_description,
    og_title:
      typeof snap.og_title === "string"
        ? snap.og_title
        : snap.og_title === null
          ? null
          : beforeRow.og_title,
    og_description:
      typeof snap.og_description === "string"
        ? snap.og_description
        : snap.og_description === null
          ? null
          : beforeRow.og_description,
    og_image_media_asset_id:
      typeof snap.og_image_media_asset_id === "string"
        ? snap.og_image_media_asset_id
        : snap.og_image_media_asset_id === null
          ? null
          : beforeRow.og_image_media_asset_id,
    noindex:
      typeof snap.noindex === "boolean" ? snap.noindex : beforeRow.noindex,
    include_in_sitemap:
      typeof snap.include_in_sitemap === "boolean"
        ? snap.include_in_sitemap
        : beforeRow.include_in_sitemap,
    canonical_url:
      typeof snap.canonical_url === "string"
        ? snap.canonical_url
        : snap.canonical_url === null
          ? null
          : beforeRow.canonical_url,
    template_schema_version:
      typeof snap.template_schema_version === "number"
        ? snap.template_schema_version
        : revRow.template_schema_version,
    // Rollback returns the page to 'draft' so the operator can re-verify
    // before publishing. This mirrors the navigation/branding pattern where
    // publish is always an explicit follow-up action.
    status: "draft" as const,
    updated_by: actorProfileId,
  };

  // 3b. Resolve the CONTENT the restore should land on.
  //
  // A revision written by the page editor carries `composition` (curated slot
  // rows) + `builderTree`. A revision written by the page-metadata CRUD path
  // carries neither. Restoring to the latter must NOT wipe the operator's
  // sections/tree, so in that case we carry the page's CURRENT content forward
  // into the new revision instead — the version bump would otherwise strand the
  // editor on a revision with no tree (the empty-canvas failure).
  const currentRevisionSnapshot = await loadVersionMatchedRevisionSnapshot(
    supabase,
    tenantId,
    values.pageId,
    beforeRow.version,
  );
  const snapComposition = readStoredComposition(snap);
  const snapBuilderTree = readStoredBuilderTree(snap);
  const revisionCarriesContent =
    snapComposition.length > 0 ||
    (Array.isArray(snapBuilderTree) && snapBuilderTree.length > 0);

  let restoredComposition: StoredCompositionEntry[];
  let preferredBuilderTree: unknown;
  const droppedSections: string[] = [];

  if (revisionCarriesContent) {
    // Drop entries whose section no longer exists or is archived (mirrors
    // restoreHomepageRevision), so the restored draft never references a
    // section the operator can't render.
    const kept: StoredCompositionEntry[] = [];
    if (snapComposition.length > 0) {
      const { data: sectionRows } = await supabase
        .from("cms_sections")
        .select("id, name, status")
        .eq("tenant_id", tenantId)
        .in("id", Array.from(new Set(snapComposition.map((e) => e.sectionId))));
      const factsById = new Map(
        ((sectionRows ?? []) as Array<{
          id: string;
          name: string;
          status: string;
        }>).map((r) => [r.id, r] as const),
      );
      for (const entry of snapComposition) {
        const facts = factsById.get(entry.sectionId);
        if (!facts) {
          droppedSections.push(`${entry.sectionId} (missing)`);
          continue;
        }
        if (facts.status === "archived") {
          droppedSections.push(`${facts.name} (archived)`);
          continue;
        }
        kept.push(entry);
      }
    }
    restoredComposition = kept;
    preferredBuilderTree = snapBuilderTree;
  } else {
    restoredComposition = await loadDraftCompositionEntries(
      supabase,
      tenantId,
      values.pageId,
    );
    // #310 guard — never carry an EMPTY tree forward when a recent non-empty
    // revision still exists.
    preferredBuilderTree = await recoverBuilderTreeIfEmpty(
      supabase,
      {
        tenantId,
        pageId: values.pageId,
        pageVersion: beforeRow.version,
        hasSlots: restoredComposition.length > 0,
      },
      readStoredBuilderTree(currentRevisionSnapshot),
    );
  }

  const restoredBuilderTree: BuilderNodeTree = resolveSnapshotBuilderTree({
    slots: toLegacySlots(restoredComposition),
    builderTree: preferredBuilderTree,
  }).tree;

  const nextVersion = beforeRow.version + 1;
  const { data: afterRow, error: updErr } = await supabase
    .from("cms_pages")
    .update({ ...updatePayload, version: nextVersion })
    .eq("id", values.pageId)
    .eq("tenant_id", tenantId)
    .eq("version", beforeRow.version)
    .select(PAGE_COLUMNS)
    .maybeSingle<PageRow>();
  if (updErr) return mapTriggerError(updErr);
  if (!afterRow) return versionConflict(beforeRow.version + 1);

  // 4. Replace the DRAFT slot rows with the restored composition. Only when the
  //    revision actually carried content — a metadata-only revision leaves the
  //    junction table alone (see 3b).
  if (revisionCarriesContent) {
    const { error: delErr } = await supabase
      .from("cms_page_sections")
      .delete()
      .eq("tenant_id", tenantId)
      .eq("page_id", afterRow.id)
      .eq("is_draft", true);
    if (delErr) {
      void improntaLog("site_admin_pages.warn", {
        message: "[site-admin/pages] rollback draft clear failed",
        tenantId,
        pageId: afterRow.id,
        error: delErr.message,
      });
    }
    if (restoredComposition.length > 0) {
      const { error: insErr } = await supabase.from("cms_page_sections").insert(
        restoredComposition.map((entry) => ({
          tenant_id: tenantId,
          page_id: afterRow.id,
          section_id: entry.sectionId,
          slot_key: entry.slotKey,
          sort_order: entry.sortOrder,
          is_draft: true,
        })),
      );
      if (insErr) {
        void improntaLog("site_admin_pages.warn", {
          message: "[site-admin/pages] rollback draft insert failed",
          tenantId,
          pageId: afterRow.id,
          count: restoredComposition.length,
          error: insErr.message,
        });
      }
    }
  }

  // 5. Write rollback revision so the audit trail shows "restored from X".
  //    CRITICAL: it is stamped at the NEW version, so it is the row the editor's
  //    version-matched read finds on the next load. It must therefore carry the
  //    composition + builderTree, or the reload paints an empty canvas.
  await insertPageRevision(supabase, {
    tenantId,
    pageId: afterRow.id,
    kind: "rollback",
    version: afterRow.version,
    templateSchemaVersion: afterRow.template_schema_version,
    snapshot: {
      ...snapshotFromRow(afterRow),
      composition: restoredComposition,
      ...(restoredBuilderTree.length > 0
        ? { builderTree: restoredBuilderTree }
        : {}),
      ...pickStyleExtras(snap, currentRevisionSnapshot),
    },
    actorProfileId,
  });

  scheduleAuditFn(supabase, {
    tenantId,
    actorProfileId,
    action: "agency.site_admin.pages.edit",
    entityType: "cms_pages",
    entityId: afterRow.id,
    diffSummary: `page rolled back to revision ${revRow.id} (v${revRow.version} → v${afterRow.version})`,
    beforeSnapshot: beforeRow,
    afterSnapshot: afterRow,
    correlationId,
  });

  // No public cache bust — status is now 'draft'. The previously-published
  // copy remains served until the operator explicitly republishes.

  return ok({ id: afterRow.id, version: afterRow.version });
}
