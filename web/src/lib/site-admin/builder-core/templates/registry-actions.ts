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

import { revalidatePath } from "next/cache";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { isPlatformAdmin } from "@/lib/access/platform-role";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { logServerError, CLIENT_ERROR } from "@/lib/server/safe-error";
import {
  computeDataBindingRequirements,
  templatePlanAllowed,
  type BuilderTemplateRow,
  type BuilderTemplateRevisionRow,
  type CreateTemplateDraftInput,
  type UpdateTemplateDraftInput,
  type ListPublishedTemplatesFilter,
} from "./registry-rows";

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

/**
 * Bump the catalog sync counter (P5 sync key) so any consumer that stamps the
 * version can detect that the published catalog changed. Mirrors the bump in
 * catalog-overlay-actions; best-effort — a counter failure never fails the
 * lifecycle op (the template change already succeeded).
 */
async function bumpCatalogVersion(
  sb: ReturnType<typeof getAdminClient>,
): Promise<void> {
  try {
    const { data } = await sb
      .from("builder_catalog_version")
      .select("version")
      .eq("id", 1)
      .maybeSingle();
    const next = ((data?.version as number | undefined) ?? 0) + 1;
    await sb
      .from("builder_catalog_version")
      .update({ version: next, updated_at: new Date().toISOString() })
      .eq("id", 1);
  } catch {
    // best-effort — the published-set change already committed.
  }
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
    const newVersion = row.version + 1;
    const now = new Date().toISOString();

    // Compute data bindings in case the tree changed since last update
    const dataBindingRequirements = computeDataBindingRequirements(
      row.builder_tree,
    );

    // Update the template row
    const { data: updated, error: updateErr } = await sb
      .from("builder_templates")
      .update({
        status: "published",
        version: newVersion,
        published_at: now,
        data_binding_requirements: dataBindingRequirements,
      })
      .eq("id", templateId)
      .select()
      .single();

    if (updateErr || !updated)
      return fail(updateErr?.message ?? "Failed to update template.");

    const publishedRow = updated as BuilderTemplateRow;

    // Write revision snapshot
    const { error: revErr } = await sb.from("builder_template_revisions").insert({
      template_id: templateId,
      version: newVersion,
      status: "published",
      snapshot: publishedRow,
      note: note?.trim() ?? null,
      created_by: gate.userId,
    });

    if (revErr) {
      // Non-fatal: log but don't roll back (template is published)
      logServerError("publishTemplate/revision", revErr);
    }

    await bumpCatalogVersion(sb);
    revalidatePath(TEMPLATE_CACHE_PATH);
    return ok(publishedRow);
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
