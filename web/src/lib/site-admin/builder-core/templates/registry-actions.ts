"use server";

/**
 * registry-actions.ts — super_admin-gated server actions for the builder
 * template registry (builder_templates + builder_template_revisions).
 *
 * GATE: every write action calls requireSuperAdmin() server-side.
 *       listPublishedTemplates is read-only, gated to authenticated users via
 *       RLS, but plan/target filtering is enforced here for defence-in-depth.
 *
 * Data pipeline:
 *   1. Caller supplies raw input.
 *   2. computeDataBindingRequirements walks builder_tree on every write.
 *   3. Mutation goes through the service-role client (RLS + is_super_admin()
 *      guard in DB for writes; authenticated client for list reads so RLS
 *      status='published' filter takes effect).
 *   4. Returns discriminated { ok } result — never throws to the client.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { isPlatformAdmin } from "@/lib/access/platform-role";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { logServerError, CLIENT_ERROR } from "@/lib/server/safe-error";
import {
  computeDataBindingRequirements,
  templatePlanAllowed,
  nextPublishedVersion,
  rollbackRevisionNote,
  type BuilderTemplateRow,
  type BuilderTemplateRevisionRow,
  type CreateTemplateDraftInput,
  type UpdateTemplateDraftInput,
  type ListPublishedTemplatesFilter,
} from "./registry-rows";
import { bumpCatalogVersion } from "./catalog-version";
import { validateTemplateForPublish } from "./validate-publish";

// ── Result type ───────────────────────────────────────────────────────────────

export type TemplateActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function ok<T>(data: T): TemplateActionResult<T> {
  return { ok: true, data };
}
function fail(error: string): TemplateActionResult<never> {
  return { ok: false, error };
}

// ── Auth gate ─────────────────────────────────────────────────────────────────

type GateOk = { ok: true; userId: string };
type GateErr = { ok: false; error: string };

async function requireSuperAdmin(): Promise<GateOk | GateErr> {
  const session = await getCachedActorSession();
  if (!session.user) return { ok: false, error: "Not signed in." };
  if (!isPlatformAdmin(session.profile)) {
    return { ok: false, error: "Super admin access required." };
  }
  return { ok: true, userId: session.user.id };
}

// ── Supabase clients ──────────────────────────────────────────────────────────

/** Service-role client for writes (bypasses RLS; our gate IS the auth boundary). */
function getAdminClient() {
  const client = createServiceRoleClient();
  if (!client) throw new Error("Service-role client unavailable.");
  return client;
}

// ── Revalidation path ─────────────────────────────────────────────────────────

const TEMPLATE_CACHE_PATH = "/platform/admin";

// ── publishRowCore (shared publish sequence) ──────────────────────────────────

interface PublishRowCoreInput {
  templateId: string;
  /** The builder_tree to publish (the live row's tree for publish; a revision's
   *  snapshot tree for rollback). data_binding_requirements is computed from it. */
  tree: BuilderTemplateRow["builder_tree"];
  /** The current row version; the published version becomes fromVersion + 1. */
  fromVersion: number;
  /** Who is performing the publish (stamped on the revision snapshot). */
  createdBy: string;
  /** Optional revision note. */
  note?: string | null;
  /**
   * When true, the row's builder_tree is overwritten with `tree` (rollback —
   * the live tree must become the restored revision's tree). When false (the
   * normal publish path), builder_tree is left as-is and only the published
   * metadata + freshly-computed data_binding_requirements are written. The
   * normal-publish behaviour is byte-identical to the pre-extraction inline
   * block — the caller passes the live row's own tree, so even the computed
   * data_binding_requirements match.
   */
  writeTree?: boolean;
}

/**
 * The shared publish sequence (extracted from publishTemplate so rollback can
 * reuse it): bump to fromVersion + 1, update the row to status=published with
 * a fresh published_at + data_binding_requirements computed from `tree`, write
 * an immutable builder_template_revisions snapshot, bump the catalog version,
 * and revalidate. Returns the updated row or a failure result.
 *
 * Ordering matches the proven publish path: the row UPDATE happens first; the
 * revision-snapshot insert is best-effort (logged, never rolled back) because
 * the template is already published once the row commits. If the UPDATE itself
 * fails, nothing is published — no half-published state is left behind.
 */
async function publishRowCore(
  sb: SupabaseClient,
  input: PublishRowCoreInput,
): Promise<TemplateActionResult<BuilderTemplateRow>> {
  const newVersion = nextPublishedVersion(input.fromVersion);
  const now = new Date().toISOString();
  const dataBindingRequirements = computeDataBindingRequirements(input.tree);

  const patch: Record<string, unknown> = {
    status: "published",
    version: newVersion,
    published_at: now,
    data_binding_requirements: dataBindingRequirements,
  };
  if (input.writeTree) {
    patch.builder_tree = input.tree;
  }

  const { data: updated, error: updateErr } = await sb
    .from("builder_templates")
    .update(patch)
    .eq("id", input.templateId)
    .select()
    .single();

  if (updateErr || !updated)
    return fail(updateErr?.message ?? "Failed to update template.");

  const publishedRow = updated as BuilderTemplateRow;

  // Write revision snapshot
  const { error: revErr } = await sb.from("builder_template_revisions").insert({
    template_id: input.templateId,
    version: newVersion,
    status: "published",
    snapshot: publishedRow,
    note: input.note?.trim() ?? null,
    created_by: input.createdBy,
  });

  if (revErr) {
    // Non-fatal: log but don't roll back (template is published)
    logServerError("publishRowCore/revision", revErr);
  }

  await bumpCatalogVersion(sb);
  revalidatePath(TEMPLATE_CACHE_PATH);
  return ok(publishedRow);
}

// ── createTemplateDraft ───────────────────────────────────────────────────────

export async function createTemplateDraft(
  input: CreateTemplateDraftInput,
): Promise<TemplateActionResult<BuilderTemplateRow>> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return fail(gate.error);

  const tree = input.builder_tree ?? [];
  const dataBindingRequirements = computeDataBindingRequirements(tree);

  try {
    const sb = getAdminClient();
    const { data, error } = await sb
      .from("builder_templates")
      .insert({
        kind: input.kind,
        status: "draft",
        target_context: input.target_context ?? "both",
        title: input.title.trim(),
        slug: input.slug.trim(),
        description: input.description?.trim() ?? null,
        category: input.category.trim(),
        gallery_tab: input.gallery_tab,
        tags: input.tags ?? [],
        required_plan: input.required_plan ?? "free",
        required_talent_tier: input.required_talent_tier ?? null,
        builder_tree: tree,
        theme_tokens: input.theme_tokens ?? null,
        data_binding_requirements: dataBindingRequirements,
        thumbnail_asset_id: input.thumbnail_asset_id ?? null,
        hero_asset_id: input.hero_asset_id ?? null,
        source_tenant_id: input.source_tenant_id ?? null,
        created_by: gate.userId,
        version: 1,
        schema_version: 1,
      })
      .select()
      .single();

    if (error) return fail(error.message);
    return ok(data as BuilderTemplateRow);
  } catch (err) {
    logServerError("createTemplateDraft", err);
    return fail(CLIENT_ERROR.generic);
  }
}

// ── updateTemplateDraft ───────────────────────────────────────────────────────

export async function updateTemplateDraft(
  input: UpdateTemplateDraftInput,
): Promise<TemplateActionResult<BuilderTemplateRow>> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return fail(gate.error);

  const { id, builder_tree, ...rest } = input;

  const patch: Record<string, unknown> = {};
  if (rest.title !== undefined) patch.title = rest.title.trim();
  if (rest.slug !== undefined) patch.slug = rest.slug.trim();
  if (rest.description !== undefined)
    patch.description = rest.description?.trim() ?? null;
  if (rest.category !== undefined) patch.category = rest.category.trim();
  if (rest.gallery_tab !== undefined) patch.gallery_tab = rest.gallery_tab;
  if (rest.target_context !== undefined)
    patch.target_context = rest.target_context;
  if (rest.tags !== undefined) patch.tags = rest.tags;
  if (rest.required_plan !== undefined)
    patch.required_plan = rest.required_plan;
  if (rest.required_talent_tier !== undefined)
    patch.required_talent_tier = rest.required_talent_tier;
  if (rest.theme_tokens !== undefined)
    patch.theme_tokens = rest.theme_tokens;
  if (rest.thumbnail_asset_id !== undefined)
    patch.thumbnail_asset_id = rest.thumbnail_asset_id;
  if (rest.hero_asset_id !== undefined)
    patch.hero_asset_id = rest.hero_asset_id;
  if (rest.source_tenant_id !== undefined)
    patch.source_tenant_id = rest.source_tenant_id;

  if (builder_tree !== undefined) {
    patch.builder_tree = builder_tree;
    patch.data_binding_requirements =
      computeDataBindingRequirements(builder_tree);
  }

  try {
    const sb = getAdminClient();
    const { data, error } = await sb
      .from("builder_templates")
      .update(patch)
      .eq("id", id)
      .select()
      .single();

    if (error) return fail(error.message);
    return ok(data as BuilderTemplateRow);
  } catch (err) {
    logServerError("updateTemplateDraft", err);
    return fail(CLIENT_ERROR.generic);
  }
}

// ── submitTemplateForReview ───────────────────────────────────────────────────

export async function submitTemplateForReview(
  templateId: string,
): Promise<TemplateActionResult<BuilderTemplateRow>> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return fail(gate.error);

  try {
    const sb = getAdminClient();
    const { data, error } = await sb
      .from("builder_templates")
      .update({ status: "in_review" })
      .eq("id", templateId)
      .in("status", ["draft"])
      .select()
      .single();

    if (error) return fail(error.message);
    if (!data)
      return fail("Template not found or not in draft status.");
    return ok(data as BuilderTemplateRow);
  } catch (err) {
    logServerError("submitTemplateForReview", err);
    return fail(CLIENT_ERROR.generic);
  }
}

// ── rejectToDraft ─────────────────────────────────────────────────────────────

/**
 * Reviewer "send back": flips an in_review template back to draft (P4 approval
 * queue). The author can revise and re-submit. No revision snapshot — nothing
 * was published.
 */
export async function rejectToDraft(
  templateId: string,
): Promise<TemplateActionResult<BuilderTemplateRow>> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return fail(gate.error);

  try {
    const sb = getAdminClient();
    const { data, error } = await sb
      .from("builder_templates")
      .update({ status: "draft" })
      .eq("id", templateId)
      .eq("status", "in_review")
      .select()
      .single();

    if (error) return fail(error.message);
    if (!data) return fail("Template not found or not in review.");

    revalidatePath(TEMPLATE_CACHE_PATH);
    return ok(data as BuilderTemplateRow);
  } catch (err) {
    logServerError("rejectToDraft", err);
    return fail(CLIENT_ERROR.generic);
  }
}

// ── publishTemplate ───────────────────────────────────────────────────────────

/**
 * Bumps the version, sets status=published, sets published_at, and writes an
 * immutable builder_template_revisions row (snapshot of the full row).
 */
export async function publishTemplate(
  templateId: string,
  note?: string | null,
): Promise<TemplateActionResult<BuilderTemplateRow>> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return fail(gate.error);

  try {
    const sb = getAdminClient();

    // Fetch current row
    const { data: current, error: fetchErr } = await sb
      .from("builder_templates")
      .select()
      .eq("id", templateId)
      .single();

    if (fetchErr || !current)
      return fail(fetchErr?.message ?? "Template not found.");

    const row = current as BuilderTemplateRow;

    // VALIDATE + DIFF GATE (WS-D D1) — must run BEFORE the row update so a
    // broken / empty / unbindable template never reaches a tenant's "+"
    // gallery. Read the previous published snapshot's tree for the (advisory)
    // diff; failure to read it is non-fatal — validation still runs.
    const { data: lastRev } = await sb
      .from("builder_template_revisions")
      .select("snapshot")
      .eq("template_id", templateId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    const previousTree =
      (lastRev?.snapshot as BuilderTemplateRow | undefined)?.builder_tree ??
      null;

    const validation = validateTemplateForPublish(row.builder_tree, {
      previousTree,
    });
    if (!validation.ok) {
      return fail("Can't publish: " + validation.reasons.join("; "));
    }

    // Publish the live row's own tree at version+1 (writeTree omitted: the row's
    // builder_tree is unchanged; only published metadata + freshly-computed
    // data_binding_requirements are written — identical to the prior inline path).
    return await publishRowCore(sb, {
      templateId,
      tree: row.builder_tree,
      fromVersion: row.version,
      createdBy: gate.userId,
      note,
    });
  } catch (err) {
    logServerError("publishTemplate", err);
    return fail(CLIENT_ERROR.generic);
  }
}

// ── unpublishTemplate ─────────────────────────────────────────────────────────

export async function unpublishTemplate(
  templateId: string,
): Promise<TemplateActionResult<BuilderTemplateRow>> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return fail(gate.error);

  try {
    const sb = getAdminClient();
    const { data, error } = await sb
      .from("builder_templates")
      .update({ status: "draft", published_at: null })
      .eq("id", templateId)
      .eq("status", "published")
      .select()
      .single();

    if (error) return fail(error.message);
    if (!data)
      return fail("Template not found or not currently published.");

    await bumpCatalogVersion(sb);
    revalidatePath(TEMPLATE_CACHE_PATH);
    return ok(data as BuilderTemplateRow);
  } catch (err) {
    logServerError("unpublishTemplate", err);
    return fail(CLIENT_ERROR.generic);
  }
}

// ── archiveTemplate ───────────────────────────────────────────────────────────

export async function archiveTemplate(
  templateId: string,
): Promise<TemplateActionResult<BuilderTemplateRow>> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return fail(gate.error);

  try {
    const sb = getAdminClient();
    const { data, error } = await sb
      .from("builder_templates")
      .update({ status: "archived" })
      .eq("id", templateId)
      .neq("status", "archived")
      .select()
      .single();

    if (error) return fail(error.message);
    if (!data)
      return fail("Template not found or already archived.");

    await bumpCatalogVersion(sb);
    revalidatePath(TEMPLATE_CACHE_PATH);
    return ok(data as BuilderTemplateRow);
  } catch (err) {
    logServerError("archiveTemplate", err);
    return fail(CLIENT_ERROR.generic);
  }
}

// ── duplicateTemplate ─────────────────────────────────────────────────────────

export async function duplicateTemplate(
  templateId: string,
  overrides?: Partial<Pick<CreateTemplateDraftInput, "title" | "slug">>,
): Promise<TemplateActionResult<BuilderTemplateRow>> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return fail(gate.error);

  try {
    const sb = getAdminClient();

    const { data: source, error: fetchErr } = await sb
      .from("builder_templates")
      .select()
      .eq("id", templateId)
      .single();

    if (fetchErr || !source)
      return fail(fetchErr?.message ?? "Source template not found.");

    const src = source as BuilderTemplateRow;
    const newSlug = (overrides?.slug ?? `${src.slug}-copy`).trim();
    const newTitle = (overrides?.title ?? `${src.title} (Copy)`).trim();

    const { data: dup, error: insErr } = await sb
      .from("builder_templates")
      .insert({
        kind: src.kind,
        status: "draft",
        target_context: src.target_context,
        title: newTitle,
        slug: newSlug,
        description: src.description,
        category: src.category,
        gallery_tab: src.gallery_tab,
        tags: src.tags,
        required_plan: src.required_plan,
        required_talent_tier: src.required_talent_tier,
        builder_tree: src.builder_tree,
        theme_tokens: src.theme_tokens,
        data_binding_requirements: src.data_binding_requirements,
        schema_version: src.schema_version,
        version: 1,
        source_tenant_id: src.source_tenant_id,
        created_by: gate.userId,
        thumbnail_asset_id: src.thumbnail_asset_id,
        hero_asset_id: src.hero_asset_id,
      })
      .select()
      .single();

    if (insErr) return fail(insErr.message);
    return ok(dup as BuilderTemplateRow);
  } catch (err) {
    logServerError("duplicateTemplate", err);
    return fail(CLIENT_ERROR.generic);
  }
}

// ── restoreTemplateRevision ───────────────────────────────────────────────────

/**
 * Restores a previous revision's builder_tree, theme_tokens, and
 * data_binding_requirements onto the live template row (status → draft).
 * Does NOT republish automatically — the caller must call publishTemplate.
 */
export async function restoreTemplateRevision(
  templateId: string,
  revisionVersion: number,
): Promise<TemplateActionResult<BuilderTemplateRow>> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return fail(gate.error);

  try {
    const sb = getAdminClient();

    const { data: rev, error: revErr } = await sb
      .from("builder_template_revisions")
      .select()
      .eq("template_id", templateId)
      .eq("version", revisionVersion)
      .single();

    if (revErr || !rev)
      return fail(revErr?.message ?? "Revision not found.");

    const revision = rev as BuilderTemplateRevisionRow;
    const snap = revision.snapshot;

    const { data: restored, error: updateErr } = await sb
      .from("builder_templates")
      .update({
        status: "draft",
        builder_tree: snap.builder_tree,
        theme_tokens: snap.theme_tokens,
        data_binding_requirements: computeDataBindingRequirements(
          snap.builder_tree,
        ),
        published_at: null,
      })
      .eq("id", templateId)
      .select()
      .single();

    if (updateErr || !restored)
      return fail(updateErr?.message ?? "Failed to restore revision.");

    return ok(restored as BuilderTemplateRow);
  } catch (err) {
    logServerError("restoreTemplateRevision", err);
    return fail(CLIENT_ERROR.generic);
  }
}

// ── rollbackToRevision (WS-D D2) ──────────────────────────────────────────────

/**
 * One-click rollback: re-publish an earlier revision's snapshot tree as a NEW
 * forward version. History is never rewritten — the target revision and every
 * version after it are preserved; rolling back simply publishes the old tree
 * again at current+1, leaving an audit note ("Rolled back to vN").
 *
 * Differs from `restoreTemplateRevision`, which restores the tree onto the live
 * row as a DRAFT (requiring a separate publish). This action restores AND
 * publishes in one step via the shared `publishRowCore`.
 *
 * Partial-failure safety: the only state-changing writes are inside
 * publishRowCore, which orders the row UPDATE first (atomic) and treats the
 * revision-snapshot insert + catalog bump as best-effort. If the UPDATE fails,
 * nothing is published; there is no half-published row.
 */
export async function rollbackToRevision(
  templateId: string,
  version: number,
): Promise<TemplateActionResult<{ version: number }>> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return fail(gate.error);

  try {
    const sb = getAdminClient();

    // Load the target revision's snapshot tree.
    const { data: rev, error: revErr } = await sb
      .from("builder_template_revisions")
      .select("snapshot")
      .eq("template_id", templateId)
      .eq("version", version)
      .maybeSingle();

    if (revErr) return fail(revErr.message);
    if (!rev) return fail(`Revision v${version} not found.`);

    const snapshot = (rev as { snapshot: BuilderTemplateRow | null }).snapshot;
    const tree = snapshot?.builder_tree;
    if (!Array.isArray(tree) || tree.length === 0) {
      return fail(`Revision v${version} has no content to roll back to.`);
    }

    // Read the current live row version so the rollback publishes at version+1
    // (forward-only history — we never reuse or rewind the version counter).
    const { data: current, error: curErr } = await sb
      .from("builder_templates")
      .select("version")
      .eq("id", templateId)
      .maybeSingle();

    if (curErr) return fail(curErr.message);
    if (!current) return fail("Template not found.");

    const fromVersion = (current as { version: number }).version;

    // Re-publish the snapshot tree as a new forward version. writeTree=true so
    // the live row's builder_tree becomes the restored tree.
    const result = await publishRowCore(sb, {
      templateId,
      tree,
      fromVersion,
      createdBy: gate.userId,
      note: rollbackRevisionNote(version),
      writeTree: true,
    });

    if (!result.ok) return fail(result.error);
    return ok({ version: result.data.version });
  } catch (err) {
    logServerError("rollbackToRevision", err);
    return fail(CLIENT_ERROR.generic);
  }
}

// ── listPublishedTemplates ────────────────────────────────────────────────────

/**
 * Read-only. Returns published templates filtered by target/plan/tab/data-sources.
 * Uses the authenticated (cookie-session) client so the `status = 'published'`
 * RLS policy applies — no service-role bypass here.
 *
 * Server-side filtering (defence in depth beyond RLS):
 *   - target_context: 'both' or exact match
 *   - gallery_tab: exact match when provided
 *   - required_plan: only templates whose plan ≤ caller's plan
 *   - dataSources: only templates whose requirements ⊆ available sources
 */
export async function listPublishedTemplates(
  filter?: ListPublishedTemplatesFilter,
): Promise<TemplateActionResult<BuilderTemplateRow[]>> {
  try {
    const sb = await createClient();
    if (!sb) return fail(CLIENT_ERROR.generic);

    let query = sb
      .from("builder_templates")
      .select()
      .eq("status", "published")
      .order("updated_at", { ascending: false });

    // target_context filter
    if (filter?.targetContext) {
      query = query.in("target_context", [filter.targetContext, "both"]) as typeof query;
    }

    // gallery_tab filter
    if (filter?.galleryTab) {
      query = query.eq("gallery_tab", filter.galleryTab) as typeof query;
    }

    const { data, error } = await query;

    if (error) return fail(error.message);

    let rows = (data ?? []) as BuilderTemplateRow[];

    // plan gating — must happen app-side (plan rank is not stored as a number)
    if (filter?.plan) {
      rows = rows.filter((t) =>
        templatePlanAllowed(t.required_plan, filter.plan),
      );
    }

    // data-source availability filter
    if (filter?.dataSources && filter.dataSources.length > 0) {
      const available = new Set<string>(filter.dataSources);
      rows = rows.filter((t) => {
        // Template is visible if ALL its requirements are in the available set
        return t.data_binding_requirements.every(
          (req) => available.has(req),
        );
      });
    }

    return ok(rows);
  } catch (err) {
    logServerError("listPublishedTemplates", err);
    return fail(CLIENT_ERROR.generic);
  }
}
