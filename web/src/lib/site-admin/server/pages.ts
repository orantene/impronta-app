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
import { getTemplate } from "@/lib/site-admin/templates/registry";
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
  updated_at
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
    console.warn("[site-admin/pages] revision insert failed", {
      tenantId: params.tenantId,
      pageId: params.pageId,
      kind: params.kind,
      version: params.version,
      error: error.message,
    });
  }
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
  },
): Promise<Phase5Result<{ id: string; version: number; publishedAt: string }>> {
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
  },
): Promise<Phase5Result<{ id: string; version: number }>> {
  const { tenantId, values, actorProfileId } = params;
  const correlationId = params.correlationId ?? randomUUID();

  await requirePhase5Capability("agency.site_admin.pages.edit", tenantId);

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

  // 4. Write rollback revision so the audit trail shows "restored from X".
  await insertPageRevision(supabase, {
    tenantId,
    pageId: afterRow.id,
    kind: "rollback",
    version: afterRow.version,
    templateSchemaVersion: afterRow.template_schema_version,
    snapshot: snapshotFromRow(afterRow),
    actorProfileId,
  });

  scheduleAuditEvent(supabase, {
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
