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
  normalizeChangelog,
  normalizeRolloutPatch,
  type BuilderTemplateRow,
  type BuilderTemplateRevisionRow,
  type CreateTemplateDraftInput,
  type UpdateTemplateDraftInput,
  type ListPublishedTemplatesFilter,
  type SetTemplateRolloutInput,
} from "./registry-rows";
import { bumpCatalogVersion } from "./catalog-version";
import {
  validateTemplateForPublish,
  diffTemplateTreeForPublish,
  type TemplateTreeDiff,
} from "./validate-publish";
import { mintCopySlug, mintCopyTitle } from "./slug-minting";
import {
  scanTemplatesForComponentDependents,
  isEmptyDependencyTarget,
  type ComponentDependencyTarget,
  type ComponentDependent,
  type ScannableTemplate,
} from "./dependency-scan";
import { appendBuilderLabAudit } from "./builder-lab-audit";
import {
  isSelfApprove,
  buildSubmitStamp,
  buildReviewStamp,
} from "./approval-guard";

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
  /** Latest-changelog convenience field (WS-D D4). Omitting leaves existing
   *  value untouched; blank clears to null. */
  changelog?: string | null;
  /** When true, also writes builder_tree on the row (rollback path). */
  writeTree?: boolean;
  /** Extra columns to merge into the row UPDATE (G4: reviewer provenance —
   *  reviewed_by/reviewed_at/review_note). Merged last; never overrides the
   *  core published-metadata keys. */
  extraPatch?: Record<string, unknown>;
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
  // Latest-changelog convenience field (WS-D D4). Only touch the column when the
  // caller threads a value through; undefined leaves the existing value alone.
  const normalizedChangelog = normalizeChangelog(input.changelog);
  if (normalizedChangelog !== undefined) {
    patch.changelog = normalizedChangelog;
  }
  // G4: merge reviewer provenance (reviewed_by/reviewed_at/review_note) last so
  // it lands on the snapshot too. Core published-metadata keys are already set;
  // extraPatch only carries approval columns, so there is no key collision.
  if (input.extraPatch) {
    Object.assign(patch, input.extraPatch);
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
    note: normalizeChangelog(input.note) ?? null,
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

// ── setTemplateRollout (WS-D D3) ──────────────────────────────────────────────

/**
 * Persist a template's staged-rollout rule: the canary `rollout_percentage`
 * (0-100) plus the explicit `tenant_allowlist` / `tenant_denylist`. Each field
 * is optional — an omitted field leaves its column untouched, so the caller can
 * nudge the percentage without re-sending the lists.
 *
 * The patch is normalized by the pure `normalizeRolloutPatch` (clamp + round the
 * %, trim/lowercase/dedupe/UUID-filter the lists, drop deny ∩ allow from the
 * allowlist). Bumps the catalog version so an open "+" gallery can detect the
 * change on next load, and revalidates the admin path.
 *
 * super_admin-gated. Rollout fields live on `builder_templates`, so this is a
 * template-level action (NOT a per-component catalog overlay).
 */
export async function setTemplateRollout(
  templateId: string,
  input: SetTemplateRolloutInput,
): Promise<TemplateActionResult<BuilderTemplateRow>> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return fail(gate.error);

  const patch = normalizeRolloutPatch(input);
  if (Object.keys(patch).length === 0) {
    return fail("No rollout fields to update.");
  }

  try {
    const sb = getAdminClient();
    // Capture pre-write rollout state for the audit diff.
    const { data: beforeRow } = await sb
      .from("builder_templates")
      .select("rollout_percentage, tenant_allowlist, tenant_denylist")
      .eq("id", templateId)
      .maybeSingle();
    const { data, error } = await sb
      .from("builder_templates")
      .update(patch)
      .eq("id", templateId)
      .select()
      .single();

    if (error) return fail(error.message);
    if (!data) return fail("Template not found.");

    await bumpCatalogVersion(sb);
    await appendBuilderLabAudit({
      action: "template.rollout",
      templateId,
      actor: gate.userId,
      before: beforeRow ?? null,
      after: patch,
    });
    revalidatePath(TEMPLATE_CACHE_PATH);
    return ok(data as BuilderTemplateRow);
  } catch (err) {
    logServerError("setTemplateRollout", err);
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
    // Stamp submit provenance (G4) so a later publish can block self-approval.
    // A fresh submit also clears any prior review provenance (buildSubmitStamp).
    const { data, error } = await sb
      .from("builder_templates")
      .update({ status: "in_review", ...buildSubmitStamp(gate.userId) })
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
 *
 * G4: stamps reviewer provenance (reviewed_by/reviewed_at) and captures the
 * optional rejection `reason` into review_note (normalized via buildReviewStamp).
 */
export async function rejectToDraft(
  templateId: string,
  reason?: string | null,
): Promise<TemplateActionResult<BuilderTemplateRow>> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return fail(gate.error);

  try {
    const sb = getAdminClient();
    const { data, error } = await sb
      .from("builder_templates")
      .update({ status: "draft", ...buildReviewStamp(gate.userId, reason) })
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
 *
 * `changelog` (WS-D D4) is an optional author note threaded from the UI. It is
 * persisted both as the revision's `note` (per-version history) AND as the
 * template row's `changelog` convenience field (latest published note). Omitting
 * it leaves the row's changelog untouched; passing blank clears it.
 */
export type PublishTemplateResult = BuilderTemplateRow & {
  /** Advisory diff verdict: whether the builder_tree changed vs the previously
   *  published revision. Returned so the UI can surface "no changes" warnings. */
  treeDiff: TemplateTreeDiff;
};

export async function publishTemplate(
  templateId: string,
  changelog?: string | null,
): Promise<TemplateActionResult<PublishTemplateResult>> {
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

    // TWO-PERSON APPROVAL GUARD (G4) — block self-approval. Only enforced when
    // the template is genuinely in_review (a direct draft→publish by its author
    // is a single-person flow, not a review, so it is intentionally allowed).
    // A row with no recorded submitter never blocks (isSelfApprove handles null).
    if (row.status === "in_review" && isSelfApprove(row.submitted_by, gate.userId)) {
      return fail(
        "Two-person approval: you submitted this template for review, so a different super admin must publish it.",
      );
    }

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

    // Extract the advisory diff verdict before publishing (validation.treeDiff is
    // now returned rather than void-discarded — G3).
    const treeDiff = validation.treeDiff;

    // Publish the live row's own tree at version+1 (writeTree omitted: the row's
    // builder_tree is unchanged; only published metadata + freshly-computed
    // data_binding_requirements are written — identical to the prior inline path).
    const coreResult = await publishRowCore(sb, {
      templateId,
      tree: row.builder_tree,
      fromVersion: row.version,
      createdBy: gate.userId,
      note: changelog,
      changelog,
      // G4: stamp the approving reviewer + thread the changelog as the review
      // note so the published snapshot records who approved and why.
      extraPatch: { ...buildReviewStamp(gate.userId, changelog) },
    });

    if (!coreResult.ok) return coreResult;

    // Best-effort audit (non-fatal — mirrors the best-effort revision snapshot).
    await appendBuilderLabAudit({
      action: "template.publish",
      templateId,
      actor: gate.userId,
      before: { status: row.status, version: row.version },
      after: { status: coreResult.data.status, version: coreResult.data.version, changelog },
    });

    return ok({ ...coreResult.data, treeDiff });
  } catch (err) {
    logServerError("publishTemplate", err);
    return fail(CLIENT_ERROR.generic);
  }
}

// ── getPublishDiff (G3 — advisory, read-only) ─────────────────────────────────

/**
 * Read-only advisory action: computes the tree diff between the current draft's
 * builder_tree and the last published revision's snapshot. Used by the publish
 * UI to show "No changes since v(N)" vs "Tree changed since v(N)" BEFORE the
 * admin clicks confirm — so they can decide whether the re-publish is intentional.
 *
 * Never blocks publish; never writes. super_admin-gated for defence-in-depth.
 */
export async function getPublishDiff(
  templateId: string,
): Promise<TemplateActionResult<{ treeDiff: TemplateTreeDiff; publishedVersion: number | null }>> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return fail(gate.error);

  try {
    const sb = getAdminClient();

    const { data: current, error: fetchErr } = await sb
      .from("builder_templates")
      .select("builder_tree")
      .eq("id", templateId)
      .single();

    if (fetchErr || !current) return fail(fetchErr?.message ?? "Template not found.");

    const { data: lastRev } = await sb
      .from("builder_template_revisions")
      .select("snapshot, version")
      .eq("template_id", templateId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    const previousTree =
      (lastRev?.snapshot as BuilderTemplateRow | undefined)?.builder_tree ?? null;
    const publishedVersion = lastRev?.version ?? null;

    const treeDiff = diffTemplateTreeForPublish(
      (current as { builder_tree: BuilderTemplateRow["builder_tree"] }).builder_tree,
      previousTree,
    );

    return ok({ treeDiff, publishedVersion });
  } catch (err) {
    logServerError("getPublishDiff", err);
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
    await appendBuilderLabAudit({
      action: "template.unpublish",
      templateId,
      actor: gate.userId,
      // Guarded by .eq("status","published") above — prior status is published.
      before: { status: "published" },
      after: { status: (data as BuilderTemplateRow).status },
    });
    revalidatePath(TEMPLATE_CACHE_PATH);
    return ok(data as BuilderTemplateRow);
  } catch (err) {
    logServerError("unpublishTemplate", err);
    return fail(CLIENT_ERROR.generic);
  }
}

// ── scanComponentDependents (G5 — pre-write dependency scan) ───────────────────

/**
 * Result shape for the G5 dependency scan. `dependents` is the list of PUBLISHED
 * templates that reference the target component (empty when nothing depends on
 * it); `blocked` is a convenience flag (`dependents.length > 0`) the UI uses to
 * decide whether to show the "archive anyway — N templates depend on this"
 * confirm.
 */
export interface ComponentDependentsScan {
  dependents: ComponentDependent[];
  blocked: boolean;
}

/**
 * Load every PUBLISHED `builder_templates` tree (id/title/slug/builder_tree only)
 * for the dependency scan. Service-role read so the scan sees the full published
 * universe regardless of the caller's plan/tier (this is an admin safety check,
 * not a tenant-facing list).
 */
async function loadPublishedScanTemplates(
  sb: SupabaseClient,
): Promise<ScannableTemplate[]> {
  const { data, error } = await sb
    .from("builder_templates")
    .select("id, title, slug, builder_tree")
    .eq("status", "published");
  if (error || !data) return [];
  return data as ScannableTemplate[];
}

/**
 * G5 pre-write scan: which PUBLISHED templates depend on the given catalog
 * component? The UI calls this BEFORE archiving / hiding a component (the hide
 * path itself lives in the X6-owned catalog-overlay writer, so this is a guard
 * the UI invokes as a pre-check — not a write). Reuses the pure
 * `scanTemplatesForComponentDependents` visitor (mirrors
 * computeDataBindingRequirements / collectDanglingBindings).
 *
 * super_admin-gated for defence in depth; read-only (never writes).
 */
export async function scanComponentDependents(
  target: ComponentDependencyTarget,
): Promise<TemplateActionResult<ComponentDependentsScan>> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return fail(gate.error);

  // An empty target can never depend-block; short-circuit without a DB round-trip.
  if (isEmptyDependencyTarget(target)) {
    return ok({ dependents: [], blocked: false });
  }

  try {
    const sb = getAdminClient();
    const templates = await loadPublishedScanTemplates(sb);
    const dependents = scanTemplatesForComponentDependents(templates, target);
    return ok({ dependents, blocked: dependents.length > 0 });
  } catch (err) {
    logServerError("scanComponentDependents", err);
    return fail(CLIENT_ERROR.generic);
  }
}

// ── archiveTemplate ───────────────────────────────────────────────────────────

/**
 * Archive a template row. G5: when the row carries a curated `section_embed`
 * identity (its `slug` doubles as a `sectionTypeKey` for curated-section
 * components), a pre-write scan walks every OTHER published template tree for
 * dependents. If any are found and the caller did NOT pass
 * `confirmDependents: true`, the archive is BLOCKED and the dependent list is
 * returned (in the error string + via a prior `scanComponentDependents` call the
 * UI makes) so the operator gets an explicit "archive anyway — N templates
 * depend on this" confirm. An unreferenced archive is unaffected.
 */
export interface ArchiveTemplateOptions {
  /** Skip the G5 dependent-block (operator clicked "archive anyway"). */
  confirmDependents?: boolean;
}

export async function archiveTemplate(
  templateId: string,
  options?: ArchiveTemplateOptions,
): Promise<TemplateActionResult<BuilderTemplateRow>> {
  const gate = await requireSuperAdmin();
  if (!gate.ok) return fail(gate.error);

  try {
    const sb = getAdminClient();
    // Capture the prior status + slug for the audit diff and the G5 dependency
    // scan (archive is reachable from any non-archived status).
    const { data: beforeRow } = await sb
      .from("builder_templates")
      .select("status, slug")
      .eq("id", templateId)
      .maybeSingle();

    // G5: block when a published template depends on this component, unless the
    // operator explicitly confirmed. The component identity a host tree can carry
    // is a curated `section_embed` keyed on the row's slug; we scan every OTHER
    // published template tree for that key. Self-references are excluded so a
    // template is never reported as depending on itself.
    if (!options?.confirmDependents) {
      const slug = (beforeRow as { slug?: string } | null)?.slug ?? null;
      if (slug) {
        const target: ComponentDependencyTarget = { sectionEmbedKeys: [slug] };
        const all = await loadPublishedScanTemplates(sb);
        const others = all.filter((t) => t.id !== templateId);
        const dependents = scanTemplatesForComponentDependents(others, target);
        if (dependents.length > 0) {
          const names = dependents.map((d) => d.title).join(", ");
          return fail(
            `Archive blocked: ${dependents.length} published template(s) depend on this component (${names}). Confirm "archive anyway" to proceed.`,
          );
        }
      }
    }

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
    await appendBuilderLabAudit({
      action: "template.archive",
      templateId,
      actor: gate.userId,
      before: beforeRow ? { status: (beforeRow as { status: string }).status } : null,
      after: { status: (data as BuilderTemplateRow).status },
    });
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

    // Collision-safe slug & title: when overrides are not fully supplied, query
    // existing rows for this kind and mint the first free -copy/-copy-N /
    // (Copy)/(Copy N) slot (F1 fix — duplicating twice previously caused a
    // unique-violation 500).
    let newSlug: string;
    let newTitle: string;
    if (overrides?.slug && overrides?.title) {
      newSlug = overrides.slug.trim();
      newTitle = overrides.title.trim();
    } else {
      const { data: existing, error: listErr } = await sb
        .from("builder_templates")
        .select("slug, title")
        .eq("kind", src.kind);
      if (listErr) return fail(listErr.message);
      const rows = (existing ?? []) as Array<{ slug: string; title: string }>;
      const existingSlugs = new Set(rows.map((r) => r.slug));
      const existingTitles = new Set(rows.map((r) => r.title));
      newSlug = overrides?.slug?.trim() ?? mintCopySlug(src.slug, existingSlugs);
      newTitle = overrides?.title?.trim() ?? mintCopyTitle(src.title, existingTitles);
    }

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
