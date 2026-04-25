/**
 * Phase 5 / M4 — section server operations.
 *
 * Consumed by the `/admin/site-settings/sections` Server Actions. All writes
 * go through this module so CAS / audit / revision / cache-bust discipline
 * is enforced uniformly. Mirrors server/pages.ts 1-to-1 in structure so the
 * publish model and rollback behavior are identical across surfaces.
 *
 * Five lifecycles:
 *   - DRAFT CRUD    — `upsertSection`, `deleteSection`
 *                     (CAS, audit, revision kind='draft' on upsert)
 *   - PUBLISH       — `publishSection`
 *                     (CAS, registry Zod re-validate, cache bust)
 *   - ARCHIVE       — `archiveSection` (CAS, cache bust)
 *   - ROLLBACK      — `restoreSectionRevision`
 *                     (loads snapshot, writes new draft row, kind='rollback')
 *
 * Capability gates:
 *   - edit / archive / delete / restore → agency.site_admin.sections.edit
 *   - publish                           → agency.site_admin.sections.publish
 *
 * In-use guard (guardrail §3.13):
 *   - `cms_page_sections.section_id` is `ON DELETE RESTRICT`. Deleting a
 *     section that is referenced by a page (draft or published) surfaces
 *     PostgrestError 23503; we map that to a `SECTION_IN_USE` error so the
 *     admin can unlink before retrying. The DB is the source of truth; this
 *     layer does not attempt a pre-count.
 *
 * Props discipline (M4 gate):
 *   - Upsert validates props against registry via `validateSectionProps`.
 *   - Publish *re-validates* the stored props against the registry's current
 *     schema version so a registry bump + unpublished-since-bump combination
 *     cannot silently publish a payload that no longer parses.
 *   - The DB trigger `cms_sections_props_media_ref_check` is the second line
 *     of defence (broken media refs → MEDIA_REF_BROKEN).
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
  validateSectionProps,
  versionConflict,
  type Phase5Result,
} from "@/lib/site-admin";
import { getSectionType } from "@/lib/site-admin/sections/registry";
import type {
  SectionArchiveValues,
  SectionDeleteValues,
  SectionDuplicateValues,
  SectionPublishValues,
  SectionRestoreRevisionValues,
  SectionUpsertValues,
} from "@/lib/site-admin/forms/sections";

// ---- row shapes -----------------------------------------------------------

export type SectionStatus = "draft" | "published" | "archived";

export interface SectionRow {
  id: string;
  tenant_id: string;
  section_type_key: string;
  name: string;
  status: SectionStatus;
  schema_version: number;
  version: number;
  props_jsonb: Record<string, unknown>;
  created_by: string | null;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SectionRevisionRow {
  id: string;
  tenant_id: string;
  section_id: string;
  kind: "draft" | "published" | "rollback";
  version: number;
  schema_version: number;
  snapshot: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
}

const SECTION_COLUMNS = `
  id,
  tenant_id,
  section_type_key,
  name,
  status,
  schema_version,
  version,
  props_jsonb,
  created_by,
  updated_by,
  created_at,
  updated_at
`;

const REVISION_COLUMNS = `
  id,
  tenant_id,
  section_id,
  kind,
  version,
  schema_version,
  snapshot,
  created_by,
  created_at
`;

// ---- helpers --------------------------------------------------------------

/**
 * Map a PostgrestError raised by a DB trigger or FK into a Phase 5 error
 * code. Trigger messages start with a stable prefix; FK 23503 signals the
 * RESTRICT FK from cms_page_sections is holding.
 */
function mapTriggerError(error: PostgrestError): Phase5Result<never> {
  const msg = error.message ?? "";
  if (msg.includes("MEDIA_REF_BROKEN")) {
    return fail("MEDIA_REF_BROKEN", msg);
  }
  // Postgres FK violation when deleting a referenced section.
  if (error.code === "23503") {
    return fail(
      "SECTION_IN_USE",
      "This section is referenced by a page. Remove it from those pages before deleting.",
    );
  }
  // Unique (tenant_id, name) violation.
  if (error.code === "23505") {
    return fail(
      "VALIDATION_FAILED",
      "A section with that name already exists on this tenant.",
    );
  }
  return fail("FORBIDDEN", msg);
}

function toSectionRowFields(
  values: SectionUpsertValues,
  actorProfileId: string | null,
) {
  return {
    tenant_id: values.tenantId,
    section_type_key: values.sectionTypeKey,
    name: values.name,
    schema_version: values.schemaVersion,
    props_jsonb: values.props,
    updated_by: actorProfileId,
  };
}

function snapshotFromRow(row: SectionRow): Record<string, unknown> {
  return {
    section_type_key: row.section_type_key,
    name: row.name,
    status: row.status,
    schema_version: row.schema_version,
    version: row.version,
    props_jsonb: row.props_jsonb,
  };
}

async function insertSectionRevision(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    sectionId: string;
    kind: "draft" | "published" | "rollback";
    version: number;
    schemaVersion: number;
    snapshot: Record<string, unknown>;
    actorProfileId: string | null;
  },
): Promise<void> {
  const { error } = await supabase.from("cms_section_revisions").insert({
    tenant_id: params.tenantId,
    section_id: params.sectionId,
    kind: params.kind,
    version: params.version,
    schema_version: params.schemaVersion,
    snapshot: params.snapshot,
    created_by: params.actorProfileId,
  });
  if (error) {
    console.warn("[site-admin/sections] revision insert failed", {
      tenantId: params.tenantId,
      sectionId: params.sectionId,
      kind: params.kind,
      version: params.version,
      error: error.message,
    });
  }
}

function bustSectionTags(tenantId: string, sectionId: string): void {
  updateTag(tagFor(tenantId, "sections", { id: sectionId }));
  updateTag(tagFor(tenantId, "sections-all"));
}

// ---- upsert ---------------------------------------------------------------

/**
 * Create or update one cms_sections row (draft-side). Distinguished by `id`:
 *   - no id → INSERT (expectedVersion must be 0)
 *   - id    → UPDATE CAS on (id, tenant_id, version = expectedVersion)
 *
 * Props are re-validated server-side via the registry (Zod already ran on
 * the form path, but we do not trust the client shape — this call is the
 * authoritative gate). Does NOT bust public cache — only publishSection does.
 */
export async function upsertSection(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    values: SectionUpsertValues;
    actorProfileId: string | null;
    correlationId?: string;
  },
): Promise<Phase5Result<{ id: string; version: number }>> {
  const { tenantId, values, actorProfileId } = params;
  const correlationId = params.correlationId ?? randomUUID();

  await requirePhase5Capability("agency.site_admin.sections.edit", tenantId);

  if (values.tenantId !== tenantId) {
    return fail("FORBIDDEN", "tenantId mismatch");
  }

  // Belt + braces: validate props against the registry again here. The form
  // layer already ran superRefine; a stale client cannot slip past this gate.
  const entry = getSectionType(values.sectionTypeKey);
  if (!entry) {
    return fail(
      "VALIDATION_FAILED",
      `Section type "${values.sectionTypeKey}" is not registered.`,
    );
  }
  const propsCheck = validateSectionProps(
    values.sectionTypeKey,
    values.schemaVersion,
    values.props,
  );
  if (!propsCheck.ok) {
    return fail("VALIDATION_FAILED", propsCheck.message);
  }

  const rowFields = toSectionRowFields(values, actorProfileId);

  // --- CREATE ---
  if (!values.id) {
    if (values.expectedVersion !== 0) {
      return fail("VALIDATION_FAILED", "expectedVersion must be 0 on create");
    }

    const { data, error } = await supabase
      .from("cms_sections")
      .insert({
        ...rowFields,
        status: "draft",
        version: 1,
        created_by: actorProfileId,
      })
      .select(SECTION_COLUMNS)
      .single<SectionRow>();

    if (error || !data) {
      if (error) return mapTriggerError(error);
      return fail("FORBIDDEN", "Insert failed");
    }

    await insertSectionRevision(supabase, {
      tenantId,
      sectionId: data.id,
      kind: "draft",
      version: data.version,
      schemaVersion: data.schema_version,
      snapshot: snapshotFromRow(data),
      actorProfileId,
    });

    scheduleAuditEvent(supabase, {
      tenantId,
      actorProfileId,
      action: "agency.site_admin.sections.edit",
      entityType: "cms_sections",
      entityId: data.id,
      diffSummary: `section created (${values.sectionTypeKey}): ${values.name}`,
      beforeSnapshot: null,
      afterSnapshot: data,
      correlationId,
    });

    return ok({ id: data.id, version: data.version });
  }

  // --- UPDATE (compare-and-set) ---
  const { data: beforeRow, error: loadErr } = await supabase
    .from("cms_sections")
    .select(SECTION_COLUMNS)
    .eq("id", values.id)
    .eq("tenant_id", tenantId)
    .maybeSingle<SectionRow>();
  if (loadErr) return fail("FORBIDDEN", loadErr.message);
  if (!beforeRow) return fail("NOT_FOUND", "Section not found");

  if (beforeRow.version !== values.expectedVersion) {
    return versionConflict(beforeRow.version);
  }

  // section_type_key is immutable after creation — swapping types would make
  // the schema_version meaningless. If the admin wants a different type, they
  // create a new section.
  if (beforeRow.section_type_key !== values.sectionTypeKey) {
    return fail(
      "VALIDATION_FAILED",
      "section_type_key cannot change after creation",
    );
  }

  const nextVersion = beforeRow.version + 1;
  const { data, error } = await supabase
    .from("cms_sections")
    .update({ ...rowFields, version: nextVersion })
    .eq("id", values.id)
    .eq("tenant_id", tenantId)
    .eq("version", beforeRow.version)
    .select(SECTION_COLUMNS)
    .maybeSingle<SectionRow>();

  if (error) return mapTriggerError(error);
  if (!data) return versionConflict(beforeRow.version + 1);

  await insertSectionRevision(supabase, {
    tenantId,
    sectionId: data.id,
    kind: "draft",
    version: data.version,
    schemaVersion: data.schema_version,
    snapshot: snapshotFromRow(data),
    actorProfileId,
  });

  scheduleAuditEvent(supabase, {
    tenantId,
    actorProfileId,
    action: "agency.site_admin.sections.edit",
    entityType: "cms_sections",
    entityId: data.id,
    diffSummary: `section updated (${values.sectionTypeKey}): ${values.name}`,
    beforeSnapshot: beforeRow,
    afterSnapshot: data,
    correlationId,
  });

  return ok({ id: data.id, version: data.version });
}

// ---- delete ---------------------------------------------------------------

/**
 * Hard-delete a cms_sections row (CAS). Blocked by the RESTRICT FK from
 * cms_page_sections if the section is referenced — mapped to SECTION_IN_USE.
 * Cache bust happens on success so stale public reads for the id stop being
 * served.
 */
export async function deleteSection(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    values: SectionDeleteValues;
    actorProfileId: string | null;
    correlationId?: string;
  },
): Promise<Phase5Result<{ id: string }>> {
  const { tenantId, values, actorProfileId } = params;
  const correlationId = params.correlationId ?? randomUUID();

  await requirePhase5Capability("agency.site_admin.sections.edit", tenantId);

  const { data: beforeRow, error: loadErr } = await supabase
    .from("cms_sections")
    .select(SECTION_COLUMNS)
    .eq("id", values.id)
    .eq("tenant_id", tenantId)
    .maybeSingle<SectionRow>();
  if (loadErr) return fail("FORBIDDEN", loadErr.message);
  if (!beforeRow) return fail("NOT_FOUND", "Section not found");

  if (beforeRow.version !== values.expectedVersion) {
    return versionConflict(beforeRow.version);
  }

  const { error, count } = await supabase
    .from("cms_sections")
    .delete({ count: "exact" })
    .eq("id", values.id)
    .eq("tenant_id", tenantId)
    .eq("version", beforeRow.version);
  if (error) return mapTriggerError(error);
  if (!count) return versionConflict(beforeRow.version + 1);

  scheduleAuditEvent(supabase, {
    tenantId,
    actorProfileId,
    action: "agency.site_admin.sections.edit",
    entityType: "cms_sections",
    entityId: values.id,
    diffSummary: `section deleted (${beforeRow.section_type_key}): ${beforeRow.name}`,
    beforeSnapshot: beforeRow,
    afterSnapshot: null,
    correlationId,
  });

  bustSectionTags(tenantId, values.id);

  return ok({ id: values.id });
}

// ---- publish --------------------------------------------------------------

/**
 * Transition a section from draft → published (or re-publish). Gates:
 *   1. capability: sections.publish
 *   2. CAS on version
 *   3. Registry Zod re-validate of the stored props against the current
 *      schema version (prevents publishing a payload that last parsed under
 *      an old schema if the platform has bumped since)
 *
 * On success:
 *   - status='published', version bumped
 *   - cms_section_revisions snapshot with kind='published'
 *   - updateTag sections:{id} + sections-all
 */
export async function publishSection(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    values: SectionPublishValues;
    actorProfileId: string | null;
    correlationId?: string;
  },
): Promise<Phase5Result<{ id: string; version: number }>> {
  const { tenantId, values, actorProfileId } = params;
  const correlationId = params.correlationId ?? randomUUID();

  await requirePhase5Capability("agency.site_admin.sections.publish", tenantId);

  const { data: beforeRow, error: loadErr } = await supabase
    .from("cms_sections")
    .select(SECTION_COLUMNS)
    .eq("id", values.id)
    .eq("tenant_id", tenantId)
    .maybeSingle<SectionRow>();
  if (loadErr) return fail("FORBIDDEN", loadErr.message);
  if (!beforeRow) return fail("NOT_FOUND", "Section not found");

  if (beforeRow.version !== values.expectedVersion) {
    return versionConflict(beforeRow.version);
  }

  // --- gate 3: registry re-validate ---
  const entry = getSectionType(beforeRow.section_type_key);
  if (!entry) {
    return fail(
      "VALIDATION_FAILED",
      `Section type "${beforeRow.section_type_key}" is not registered.`,
    );
  }
  // Re-validate against the CURRENT registry version, not the stored one. If
  // the platform has bumped between save and publish, the migration map must
  // have been run before this point; publish refuses stale payloads.
  const currentSchema = entry.schemasByVersion[entry.currentVersion];
  if (!currentSchema) {
    return fail(
      "VALIDATION_FAILED",
      `Section type ${beforeRow.section_type_key} missing current-version schema`,
    );
  }
  const parsed = currentSchema.safeParse(beforeRow.props_jsonb);
  if (!parsed.success) {
    return fail(
      "PUBLISH_NOT_READY",
      `Section props failed validation: ${parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    );
  }

  // --- apply publish ---
  const nextVersion = beforeRow.version + 1;

  const { data: afterRow, error: updErr } = await supabase
    .from("cms_sections")
    .update({
      status: "published",
      // If the platform has bumped between the last save and publish,
      // migration-on-read has already run; persist the current schema_version
      // so the published row reflects the shape it parses under now.
      schema_version: entry.currentVersion,
      version: nextVersion,
      updated_by: actorProfileId,
    })
    .eq("id", values.id)
    .eq("tenant_id", tenantId)
    .eq("version", beforeRow.version)
    .select(SECTION_COLUMNS)
    .maybeSingle<SectionRow>();
  if (updErr) return mapTriggerError(updErr);
  if (!afterRow) return versionConflict(beforeRow.version + 1);

  await insertSectionRevision(supabase, {
    tenantId,
    sectionId: afterRow.id,
    kind: "published",
    version: afterRow.version,
    schemaVersion: afterRow.schema_version,
    snapshot: snapshotFromRow(afterRow),
    actorProfileId,
  });

  scheduleAuditEvent(supabase, {
    tenantId,
    actorProfileId,
    action: "agency.site_admin.sections.publish",
    entityType: "cms_sections",
    entityId: afterRow.id,
    diffSummary: `section published (${afterRow.section_type_key}/${afterRow.name}): v${nextVersion}`,
    beforeSnapshot: beforeRow,
    afterSnapshot: afterRow,
    correlationId,
  });

  bustSectionTags(tenantId, afterRow.id);

  return ok({ id: afterRow.id, version: afterRow.version });
}

// ---- archive --------------------------------------------------------------

/**
 * Archive a section (status → 'archived'). CAS. Busts public cache so any
 * storefront surface that composed it falls back. M4 does not gate by
 * "in-use" here; archive is safe even when pages still reference the id —
 * the storefront simply won't render archived content. Delete is the
 * destructive path and remains RESTRICT-gated by the FK.
 */
export async function archiveSection(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    values: SectionArchiveValues;
    actorProfileId: string | null;
    correlationId?: string;
  },
): Promise<Phase5Result<{ id: string; version: number }>> {
  const { tenantId, values, actorProfileId } = params;
  const correlationId = params.correlationId ?? randomUUID();

  await requirePhase5Capability("agency.site_admin.sections.publish", tenantId);

  const { data: beforeRow, error: loadErr } = await supabase
    .from("cms_sections")
    .select(SECTION_COLUMNS)
    .eq("id", values.id)
    .eq("tenant_id", tenantId)
    .maybeSingle<SectionRow>();
  if (loadErr) return fail("FORBIDDEN", loadErr.message);
  if (!beforeRow) return fail("NOT_FOUND", "Section not found");

  if (beforeRow.version !== values.expectedVersion) {
    return versionConflict(beforeRow.version);
  }

  const nextVersion = beforeRow.version + 1;
  const { data: afterRow, error: updErr } = await supabase
    .from("cms_sections")
    .update({
      status: "archived",
      version: nextVersion,
      updated_by: actorProfileId,
    })
    .eq("id", values.id)
    .eq("tenant_id", tenantId)
    .eq("version", beforeRow.version)
    .select(SECTION_COLUMNS)
    .maybeSingle<SectionRow>();
  if (updErr) return mapTriggerError(updErr);
  if (!afterRow) return versionConflict(beforeRow.version + 1);

  scheduleAuditEvent(supabase, {
    tenantId,
    actorProfileId,
    action: "agency.site_admin.sections.publish",
    entityType: "cms_sections",
    entityId: afterRow.id,
    diffSummary: `section archived (${afterRow.section_type_key}/${afterRow.name})`,
    beforeSnapshot: beforeRow,
    afterSnapshot: afterRow,
    correlationId,
  });

  bustSectionTags(tenantId, afterRow.id);

  return ok({ id: afterRow.id, version: afterRow.version });
}

// ---- duplicate ------------------------------------------------------------

/**
 * Clone a section as a new draft. The source row is loaded under the
 * caller's staff Supabase client (RLS-gated + tenant-filtered); the new
 * row is INSERTed with a fresh UUID, operator-supplied name, forced
 * `status='draft'` and `version=1`.
 *
 * The new row inherits `section_type_key`, `schema_version`, and
 * `props_jsonb` verbatim. Archived or published sources are allowed to
 * duplicate; the clone always starts as draft so the operator reviews
 * before re-publishing.
 *
 * Audit: `agency.site_admin.sections.edit` (same action key as upsert;
 * diff summary says "duplicated from <source>"). An initial revision of
 * `kind='draft'` is written so the clone's history starts clean.
 *
 * Does NOT bust cache. The new row has no public references.
 */
export async function duplicateSection(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    values: SectionDuplicateValues;
    actorProfileId: string | null;
    correlationId?: string;
  },
): Promise<Phase5Result<{ id: string; version: number }>> {
  const { tenantId, values, actorProfileId } = params;
  const correlationId = params.correlationId ?? randomUUID();

  await requirePhase5Capability("agency.site_admin.sections.edit", tenantId);

  if (values.tenantId !== tenantId) {
    return fail("FORBIDDEN", "tenantId mismatch");
  }

  // 1. Load source row (tenant-scoped).
  const { data: source, error: loadErr } = await supabase
    .from("cms_sections")
    .select(SECTION_COLUMNS)
    .eq("id", values.sourceId)
    .eq("tenant_id", tenantId)
    .maybeSingle<SectionRow>();
  if (loadErr) return fail("FORBIDDEN", loadErr.message);
  if (!source) return fail("NOT_FOUND", "Source section not found");

  // 2. Re-validate the copied props against the registry at the source's
  //    stored schema version. This is belt + braces — if the source was
  //    valid when it landed, the clone is valid now. Catches the edge
  //    case of a registry version being retired between author + clone.
  const propsCheck = validateSectionProps(
    source.section_type_key,
    source.schema_version,
    source.props_jsonb,
  );
  if (!propsCheck.ok) {
    return fail(
      "VALIDATION_FAILED",
      `Source section props failed re-validation: ${propsCheck.message}`,
    );
  }

  // 3. Insert the clone. The unique (tenant_id, name) DB index is the
  //    name-collision guard; 23505 maps to VALIDATION_FAILED in
  //    mapTriggerError.
  const { data: clone, error: insErr } = await supabase
    .from("cms_sections")
    .insert({
      tenant_id: tenantId,
      section_type_key: source.section_type_key,
      name: values.newName,
      status: "draft",
      schema_version: source.schema_version,
      version: 1,
      props_jsonb: source.props_jsonb,
      created_by: actorProfileId,
      updated_by: actorProfileId,
    })
    .select(SECTION_COLUMNS)
    .single<SectionRow>();
  if (insErr || !clone) {
    if (insErr) return mapTriggerError(insErr);
    return fail("FORBIDDEN", "Insert failed");
  }

  await insertSectionRevision(supabase, {
    tenantId,
    sectionId: clone.id,
    kind: "draft",
    version: clone.version,
    schemaVersion: clone.schema_version,
    snapshot: snapshotFromRow(clone),
    actorProfileId,
  });

  scheduleAuditEvent(supabase, {
    tenantId,
    actorProfileId,
    action: "agency.site_admin.sections.edit",
    entityType: "cms_sections",
    entityId: clone.id,
    diffSummary: `section duplicated from ${source.name} (${source.id}) as ${clone.name}`,
    beforeSnapshot: null,
    afterSnapshot: clone,
    correlationId,
  });

  return ok({ id: clone.id, version: clone.version });
}

// ---- restore-from-revision ------------------------------------------------

/**
 * Roll a section back to a specific revision snapshot. Does NOT publish; the
 * restore writes a new DRAFT row and bumps the section version. The editor
 * walks the operator through a fresh publish if desired.
 *
 * Behavior:
 *   1. capability: sections.edit
 *   2. CAS on current section version
 *   3. Load the revision row by (id, tenant, section_id); 404 otherwise
 *   4. Apply the snapshot's editable fields onto the cms_sections row:
 *      - name, props_jsonb, schema_version (from the revision)
 *      - DOES NOT change section_type_key (immutable)
 *   5. Write revision with kind='rollback' carrying the restored payload
 *   6. No cache bust — rollback produces a draft, not a publish.
 */
export async function restoreSectionRevision(
  supabase: SupabaseClient,
  params: {
    tenantId: string;
    values: SectionRestoreRevisionValues;
    actorProfileId: string | null;
    correlationId?: string;
  },
): Promise<Phase5Result<{ id: string; version: number }>> {
  const { tenantId, values, actorProfileId } = params;
  const correlationId = params.correlationId ?? randomUUID();

  await requirePhase5Capability("agency.site_admin.sections.edit", tenantId);

  // 1. Load current section row + CAS check.
  const { data: beforeRow, error: secErr } = await supabase
    .from("cms_sections")
    .select(SECTION_COLUMNS)
    .eq("id", values.sectionId)
    .eq("tenant_id", tenantId)
    .maybeSingle<SectionRow>();
  if (secErr) return fail("FORBIDDEN", secErr.message);
  if (!beforeRow) return fail("NOT_FOUND", "Section not found");

  if (beforeRow.version !== values.expectedVersion) {
    return versionConflict(beforeRow.version);
  }

  // 2. Load revision (tenant-scoped + section-scoped).
  const { data: revRow, error: revErr } = await supabase
    .from("cms_section_revisions")
    .select(REVISION_COLUMNS)
    .eq("id", values.revisionId)
    .eq("tenant_id", tenantId)
    .eq("section_id", values.sectionId)
    .maybeSingle<SectionRevisionRow>();
  if (revErr) return fail("FORBIDDEN", revErr.message);
  if (!revRow) return fail("NOT_FOUND", "Revision not found");

  // 3. Build update payload from the snapshot. Defensive coercions.
  const snap = revRow.snapshot as Record<string, unknown>;
  const updatePayload: Record<string, unknown> = {
    name: typeof snap.name === "string" ? snap.name : beforeRow.name,
    props_jsonb:
      snap.props_jsonb && typeof snap.props_jsonb === "object"
        ? snap.props_jsonb
        : beforeRow.props_jsonb,
    schema_version:
      typeof snap.schema_version === "number"
        ? snap.schema_version
        : revRow.schema_version,
    // Rollback returns the section to 'draft' so the operator can re-verify
    // before publishing (matches pages rollback semantics).
    status: "draft" as const,
    updated_by: actorProfileId,
  };

  const nextVersion = beforeRow.version + 1;
  const { data: afterRow, error: updErr } = await supabase
    .from("cms_sections")
    .update({ ...updatePayload, version: nextVersion })
    .eq("id", values.sectionId)
    .eq("tenant_id", tenantId)
    .eq("version", beforeRow.version)
    .select(SECTION_COLUMNS)
    .maybeSingle<SectionRow>();
  if (updErr) return mapTriggerError(updErr);
  if (!afterRow) return versionConflict(beforeRow.version + 1);

  // 4. Write rollback revision so the audit trail shows "restored from X".
  await insertSectionRevision(supabase, {
    tenantId,
    sectionId: afterRow.id,
    kind: "rollback",
    version: afterRow.version,
    schemaVersion: afterRow.schema_version,
    snapshot: snapshotFromRow(afterRow),
    actorProfileId,
  });

  scheduleAuditEvent(supabase, {
    tenantId,
    actorProfileId,
    action: "agency.site_admin.sections.edit",
    entityType: "cms_sections",
    entityId: afterRow.id,
    diffSummary: `section rolled back to revision ${revRow.id} (v${revRow.version} → v${afterRow.version})`,
    beforeSnapshot: beforeRow,
    afterSnapshot: afterRow,
    correlationId,
  });

  // No public cache bust — status is now 'draft'. The previously-published
  // copy remains served until the operator explicitly republishes.

  return ok({ id: afterRow.id, version: afterRow.version });
}
