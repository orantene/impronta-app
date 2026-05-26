"use server";

import { talentPlanToTier } from "@/lib/access/talent-membership";
import { loadTalentPersonalSiteDashboardState } from "@/lib/talent-site/server/dashboard-state";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import {
  assertTalentCanApplyTemplate,
  assertTalentCanEditPersonalSite,
  assertTalentCanPublishPersonalSite,
  assertTalentCanSaveComposition,
  assertTalentCanUseCustomBuilder,
  assertTemplateAllowedForPlan,
  planDeniedMessage,
  requireTalentSelf,
} from "@/lib/server/talent-self-guard";
import { bustTalentSiteCache } from "@/lib/talent-site/cache-tags";
import { sanitizePublishedTalentSiteSnapshot } from "@/lib/talent-site/sanitize-published-snapshot";
import {
  buildTemplateSnapshot,
  defaultTemplateKeyForTier,
  type TalentSiteTemplateKey,
} from "@/lib/talent-site/templates/registry";
import { buildStarterSnapshotForTalent, loadTalentStarterProfileData } from "@/lib/talent-site/server/load-starter-data";
import { provisionTalentPersonalSiteIfMissing } from "@/lib/talent-site/server/provision";
import type {
  TalentSiteActionResult,
  TalentSiteCompositionMode,
  TalentSiteSnapshot,
  TalentSiteSnapshotSection,
} from "@/lib/talent-site/types";
import { validateTalentSiteSnapshot } from "@/lib/talent-site/validation";

export async function fetchTalentPersonalSiteDashboardStateAction() {
  return loadTalentPersonalSiteDashboardState();
}

function planDeniedEdit<T = void>(): TalentSiteActionResult<T> {
  return {
    ok: false,
    code: "plan_required",
    error: planDeniedMessage("edit"),
  };
}

function featureDisabled<T = void>(): TalentSiteActionResult<T> {
  return {
    ok: false,
    code: "feature_disabled",
    error: planDeniedMessage("edit"),
  };
}

function clampSnapshotForPublish(
  snapshot: TalentSiteSnapshot,
  planKey: string,
): TalentSiteSnapshot {
  const tier = talentPlanToTier(planKey);
  let next = { ...snapshot };

  if (tier === "free") {
    next = {
      ...next,
      templateKey: "tulala-digital",
      compositionMode: "template",
    };
  }

  if (tier !== "max" && next.compositionMode === "custom") {
    next = {
      ...next,
      compositionMode: "template",
      templateKey: defaultTemplateKeyForTier(tier),
    };
  }

  if (
    next.templateKey &&
    !assertTemplateAllowedForPlan(planKey, next.templateKey as TalentSiteTemplateKey)
  ) {
    next = {
      ...next,
      templateKey: defaultTemplateKeyForTier(tier),
      compositionMode: "template",
    };
  }

  return next;
}

export async function createTalentPersonalSiteDraftAction(): Promise<
  TalentSiteActionResult<{ siteId: string; version: number }>
> {
  const scope = await requireTalentSelf();
  if (!scope.ok) {
    return { ok: false, code: scope.code, error: scope.error };
  }
  if (!assertTalentCanEditPersonalSite(scope.planKey)) {
    return planDeniedEdit();
  }

  const provisioned = await provisionTalentPersonalSiteIfMissing(
    scope.talentProfile.id,
    scope.planKey,
    scope.session.user.id,
  );
  if (!provisioned.ok) {
    return { ok: false, code: "server_error", error: provisioned.error };
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return { ok: false, code: "server_error", error: "Not configured." };
  }

  const { data: existing } = await admin
    .from("talent_sites")
    .select("id, version")
    .eq("talent_profile_id", scope.talentProfile.id)
    .maybeSingle();

  if (existing) {
    return {
      ok: true,
      data: {
        siteId: (existing as { id: string }).id,
        version: (existing as { version: number }).version,
      },
    };
  }

  const starter = await buildStarterSnapshotForTalent(
    scope.talentProfile.id,
    scope.planKey,
  );
  if (!starter) {
    return { ok: false, code: "server_error", error: "Could not build starter content." };
  }

  const validated = validateTalentSiteSnapshot(starter, { planKey: scope.planKey });
  if (!validated.ok) {
    return { ok: false, code: "invalid_snapshot", error: validated.error };
  }

  const now = new Date().toISOString();
  const { data: inserted, error: insertErr } = await admin
    .from("talent_sites")
    .insert({
      talent_profile_id: scope.talentProfile.id,
      site_kind: "talent_personal",
      status: "draft",
      draft_snapshot: validated.snapshot,
      version: 1,
      draft_updated_at: now,
      created_by: scope.session.user.id,
      updated_by: scope.session.user.id,
    })
    .select("id, version")
    .single();

  if (insertErr || !inserted) {
    logServerError("talentSite.createDraft", insertErr);
    return { ok: false, code: "server_error", error: "Could not create personal site." };
  }

  const siteId = (inserted as { id: string }).id;
  const version = (inserted as { version: number }).version;

  await admin.from("talent_site_revisions").insert({
    talent_site_id: siteId,
    talent_profile_id: scope.talentProfile.id,
    kind: "draft",
    version,
    snapshot: validated.snapshot,
    created_by: scope.session.user.id,
  });

  bustTalentSiteCache(scope.talentProfile.id, scope.talentProfile.profileCode);

  return { ok: true, data: { siteId, version } };
}

export type SaveTalentPersonalSiteDraftInput = {
  expectedVersion: number;
  snapshot: TalentSiteSnapshot;
};

export async function saveTalentPersonalSiteDraftAction(
  input: SaveTalentPersonalSiteDraftInput,
): Promise<TalentSiteActionResult<{ version: number }>> {
  const scope = await requireTalentSelf();
  if (!scope.ok) {
    return { ok: false, code: scope.code, error: scope.error };
  }
  if (!assertTalentCanEditPersonalSite(scope.planKey)) {
    return planDeniedEdit();
  }

  const validated = validateTalentSiteSnapshot(input.snapshot, { planKey: scope.planKey });
  if (!validated.ok) {
    return {
      ok: false,
      code: validated.code === "snapshot_too_large" ? "snapshot_too_large" : "invalid_snapshot",
      error: validated.error,
    };
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return { ok: false, code: "server_error", error: "Not configured." };
  }

  const { data: row, error: fetchErr } = await admin
    .from("talent_sites")
    .select("id, version, talent_profile_id, plan_locked")
    .eq("talent_profile_id", scope.talentProfile.id)
    .maybeSingle();

  if (fetchErr || !row) {
    return { ok: false, code: "site_not_found", error: "Personal site not found." };
  }

  const site = row as {
    id: string;
    version: number;
    talent_profile_id: string;
    plan_locked?: boolean;
  };

  if (site.plan_locked && validated.snapshot.compositionMode === "custom") {
    return {
      ok: false,
      code: "plan_required",
      error: "Your plan changed — pick an allowed template before editing custom sections.",
    };
  }

  if (site.talent_profile_id !== scope.talentProfile.id) {
    return { ok: false, code: "not_owner", error: "Not authorized." };
  }
  if (site.version !== input.expectedVersion) {
    return {
      ok: false,
      code: "stale_version",
      error: `Site changed since you loaded it (now version ${site.version}). Reload and try again.`,
    };
  }

  const nextVersion = site.version + 1;
  const now = new Date().toISOString();
  const snapshot: TalentSiteSnapshot = {
    ...validated.snapshot,
    pageVersion: nextVersion,
    publishedAt: null,
  };

  const { error: updateErr } = await admin
    .from("talent_sites")
    .update({
      draft_snapshot: snapshot,
      version: nextVersion,
      draft_updated_at: now,
      updated_by: scope.session.user.id,
      updated_at: now,
      pending_template_reset: false,
    })
    .eq("id", site.id)
    .eq("talent_profile_id", scope.talentProfile.id)
    .eq("version", input.expectedVersion);

  if (updateErr) {
    logServerError("talentSite.saveDraft", updateErr);
    return { ok: false, code: "stale_version", error: "Could not save draft. Reload and try again." };
  }

  await admin.from("talent_site_revisions").insert({
    talent_site_id: site.id,
    talent_profile_id: scope.talentProfile.id,
    kind: "draft",
    version: nextVersion,
    snapshot,
    created_by: scope.session.user.id,
  });

  bustTalentSiteCache(scope.talentProfile.id, scope.talentProfile.profileCode);

  return { ok: true, data: { version: nextVersion } };
}

export type PublishTalentPersonalSiteInput = {
  expectedVersion: number;
};

export async function publishTalentPersonalSiteAction(
  input: PublishTalentPersonalSiteInput,
): Promise<TalentSiteActionResult<{ version: number; publishedAt: string }>> {
  const scope = await requireTalentSelf();
  if (!scope.ok) {
    return { ok: false, code: scope.code, error: scope.error };
  }
  if (!assertTalentCanPublishPersonalSite(scope.planKey)) {
    return planDeniedEdit();
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return { ok: false, code: "server_error", error: "Not configured." };
  }

  const { data: row, error: fetchErr } = await admin
    .from("talent_sites")
    .select("id, version, draft_snapshot, talent_profile_id, pending_template_reset")
    .eq("talent_profile_id", scope.talentProfile.id)
    .maybeSingle();

  if (fetchErr || !row) {
    return { ok: false, code: "site_not_found", error: "Personal site not found." };
  }

  const site = row as {
    id: string;
    version: number;
    draft_snapshot: unknown;
    talent_profile_id: string;
    pending_template_reset?: boolean;
  };

  if (site.talent_profile_id !== scope.talentProfile.id) {
    return { ok: false, code: "not_owner", error: "Not authorized." };
  }
  if (site.version !== input.expectedVersion) {
    return {
      ok: false,
      code: "stale_version",
      error: `Site changed since you loaded it (now version ${site.version}). Reload and try again.`,
    };
  }

  const validated = validateTalentSiteSnapshot(site.draft_snapshot, { planKey: scope.planKey });
  if (!validated.ok) {
    return { ok: false, code: "invalid_snapshot", error: validated.error };
  }

  const clamped = clampSnapshotForPublish(validated.snapshot, scope.planKey);
  const sanitized = sanitizePublishedTalentSiteSnapshot(clamped);
  if (!sanitized) {
    return { ok: false, code: "invalid_snapshot", error: "Could not publish this site." };
  }

  const publishedAt = new Date().toISOString();
  const publishedSnapshot: TalentSiteSnapshot = {
    ...sanitized,
    publishedAt,
    pageVersion: site.version + 1,
  };

  const nextVersion = site.version + 1;

  const { error: updateErr } = await admin
    .from("talent_sites")
    .update({
      status: "published",
      published_snapshot: publishedSnapshot,
      draft_snapshot: clamped,
      version: nextVersion,
      published_at: publishedAt,
      unpublished_at: null,
      draft_updated_at: publishedAt,
      updated_by: scope.session.user.id,
      updated_at: publishedAt,
      pending_template_reset: false,
      plan_locked: false,
    })
    .eq("id", site.id)
    .eq("talent_profile_id", scope.talentProfile.id)
    .eq("version", input.expectedVersion);

  if (updateErr) {
    logServerError("talentSite.publish", updateErr);
    return { ok: false, code: "stale_version", error: "Could not publish. Reload and try again." };
  }

  await admin.from("talent_site_revisions").insert({
    talent_site_id: site.id,
    talent_profile_id: scope.talentProfile.id,
    kind: "published",
    version: nextVersion,
    snapshot: publishedSnapshot,
    created_by: scope.session.user.id,
  });

  bustTalentSiteCache(scope.talentProfile.id, scope.talentProfile.profileCode);

  return { ok: true, data: { version: nextVersion, publishedAt } };
}

export async function unpublishTalentPersonalSiteAction(): Promise<TalentSiteActionResult> {
  const scope = await requireTalentSelf();
  if (!scope.ok) {
    return { ok: false, code: scope.code, error: scope.error };
  }
  if (!assertTalentCanPublishPersonalSite(scope.planKey)) {
    return planDeniedEdit();
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return { ok: false, code: "server_error", error: "Not configured." };
  }

  const { data: row, error: fetchErr } = await admin
    .from("talent_sites")
    .select("id, talent_profile_id, published_snapshot")
    .eq("talent_profile_id", scope.talentProfile.id)
    .maybeSingle();

  if (fetchErr || !row) {
    return { ok: false, code: "site_not_found", error: "Personal site not found." };
  }

  const site = row as { id: string; talent_profile_id: string; published_snapshot: unknown };
  if (site.talent_profile_id !== scope.talentProfile.id) {
    return { ok: false, code: "not_owner", error: "Not authorized." };
  }

  const unpublishedAt = new Date().toISOString();

  const { error: updateErr } = await admin
    .from("talent_sites")
    .update({
      status: "unpublished",
      unpublished_at: unpublishedAt,
      updated_by: scope.session.user.id,
      updated_at: unpublishedAt,
    })
    .eq("id", site.id)
    .eq("talent_profile_id", scope.talentProfile.id);

  if (updateErr) {
    logServerError("talentSite.unpublish", updateErr);
    return { ok: false, code: "server_error", error: "Could not unpublish." };
  }

  if (site.published_snapshot) {
    await admin.from("talent_site_revisions").insert({
      talent_site_id: site.id,
      talent_profile_id: scope.talentProfile.id,
      kind: "unpublished",
      version: 0,
      snapshot: site.published_snapshot,
      created_by: scope.session.user.id,
    });
  }

  bustTalentSiteCache(scope.talentProfile.id, scope.talentProfile.profileCode);

  return { ok: true };
}

export type ApplyTalentSiteTemplateInput = {
  templateKey: TalentSiteTemplateKey;
  expectedVersion: number;
};

export async function applyTalentSiteTemplateAction(
  input: ApplyTalentSiteTemplateInput,
): Promise<TalentSiteActionResult<{ version: number }>> {
  const scope = await requireTalentSelf();
  if (!scope.ok) {
    return { ok: false, code: scope.code, error: scope.error };
  }
  if (!assertTalentCanApplyTemplate(scope.planKey)) {
    return {
      ok: false,
      code: "plan_required",
      error: planDeniedMessage("template"),
    };
  }
  if (!assertTemplateAllowedForPlan(scope.planKey, input.templateKey)) {
    return {
      ok: false,
      code: "plan_required",
      error: planDeniedMessage("template"),
    };
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return { ok: false, code: "server_error", error: "Not configured." };
  }

  const { data: row } = await admin
    .from("talent_sites")
    .select("id, version, draft_snapshot, talent_profile_id")
    .eq("talent_profile_id", scope.talentProfile.id)
    .maybeSingle();

  if (!row) {
    return { ok: false, code: "site_not_found", error: "Personal site not found." };
  }

  const site = row as {
    id: string;
    version: number;
    draft_snapshot: unknown;
    talent_profile_id: string;
  };

  if (site.version !== input.expectedVersion) {
    return {
      ok: false,
      code: "stale_version",
      error: `Site changed since you loaded it (now version ${site.version}). Reload and try again.`,
    };
  }

  const existing = validateTalentSiteSnapshot(site.draft_snapshot);
  const profile = await loadTalentStarterProfileData(scope.talentProfile.id);
  if (!profile) {
    return { ok: false, code: "server_error", error: "Could not load profile." };
  }

  const { data: mediaRows } = await admin
    .from("media_assets")
    .select("storage_path")
    .eq("owner_talent_profile_id", scope.talentProfile.id)
    .in("variant_kind", ["public_watermarked", "gallery", "portfolio"])
    .eq("approval_state", "approved")
    .is("deleted_at", null)
    .order("sort_order", { ascending: true })
    .limit(12);

  const BUCKET = "media-public";
  const media = (mediaRows ?? []).map((r) => {
    const row = r as { storage_path: string };
    return {
      url: admin.storage.from(BUCKET).getPublicUrl(row.storage_path).data.publicUrl,
      alt: profile.displayName,
    };
  });

  const built = buildTemplateSnapshot(input.templateKey, { profile, media }, {
    compositionMode: "template",
    pageVersion: site.version + 1,
  });

  const snapshot: TalentSiteSnapshot = {
    ...built,
    fields: existing.ok ? existing.snapshot.fields : built.fields,
  };

  const validated = validateTalentSiteSnapshot(snapshot, { planKey: scope.planKey });
  if (!validated.ok) {
    return { ok: false, code: "invalid_snapshot", error: validated.error };
  }

  const nextVersion = site.version + 1;
  const now = new Date().toISOString();

  const { error: updateErr } = await admin
    .from("talent_sites")
    .update({
      draft_snapshot: validated.snapshot,
      version: nextVersion,
      draft_updated_at: now,
      updated_by: scope.session.user.id,
      updated_at: now,
      pending_template_reset: false,
      plan_locked: false,
    })
    .eq("id", site.id)
    .eq("version", input.expectedVersion);

  if (updateErr) {
    return { ok: false, code: "stale_version", error: "Could not apply template." };
  }

  await admin.from("talent_site_revisions").insert({
    talent_site_id: site.id,
    talent_profile_id: scope.talentProfile.id,
    kind: "draft",
    version: nextVersion,
    snapshot: validated.snapshot,
    created_by: scope.session.user.id,
  });

  bustTalentSiteCache(scope.talentProfile.id, scope.talentProfile.profileCode);

  return { ok: true, data: { version: nextVersion } };
}

export type SetTalentSiteCompositionModeInput = {
  mode: TalentSiteCompositionMode;
  expectedVersion: number;
};

export async function setTalentSiteCompositionModeAction(
  input: SetTalentSiteCompositionModeInput,
): Promise<TalentSiteActionResult<{ version: number }>> {
  const scope = await requireTalentSelf();
  if (!scope.ok) {
    return { ok: false, code: scope.code, error: scope.error };
  }
  if (input.mode === "custom" && !assertTalentCanUseCustomBuilder(scope.planKey)) {
    return {
      ok: false,
      code: "plan_required",
      error: planDeniedMessage("custom_builder"),
    };
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return { ok: false, code: "server_error", error: "Not configured." };
  }

  const { data: row } = await admin
    .from("talent_sites")
    .select("id, version, draft_snapshot")
    .eq("talent_profile_id", scope.talentProfile.id)
    .maybeSingle();

  if (!row) {
    return { ok: false, code: "site_not_found", error: "Personal site not found." };
  }

  const site = row as { id: string; version: number; draft_snapshot: unknown };
  if (site.version !== input.expectedVersion) {
    return { ok: false, code: "stale_version", error: "Reload and try again." };
  }

  const validated = validateTalentSiteSnapshot(site.draft_snapshot, { planKey: scope.planKey });
  if (!validated.ok) {
    return { ok: false, code: "invalid_snapshot", error: validated.error };
  }

  const snapshot: TalentSiteSnapshot = {
    ...validated.snapshot,
    compositionMode: input.mode,
  };

  const nextVersion = site.version + 1;
  const now = new Date().toISOString();

  await admin
    .from("talent_sites")
    .update({
      draft_snapshot: snapshot,
      version: nextVersion,
      draft_updated_at: now,
      updated_by: scope.session.user.id,
      updated_at: now,
    })
    .eq("id", site.id)
    .eq("version", input.expectedVersion);

  bustTalentSiteCache(scope.talentProfile.id, scope.talentProfile.profileCode);

  return { ok: true, data: { version: nextVersion } };
}

export type SaveTalentSiteCompositionInput = {
  expectedVersion: number;
  slots: TalentSiteSnapshotSection[];
};

export async function saveTalentSiteCompositionAction(
  input: SaveTalentSiteCompositionInput,
): Promise<TalentSiteActionResult<{ version: number }>> {
  const scope = await requireTalentSelf();
  if (!scope.ok) {
    return { ok: false, code: scope.code, error: scope.error };
  }
  if (!assertTalentCanSaveComposition(scope.planKey)) {
    return {
      ok: false,
      code: "plan_required",
      error: planDeniedMessage("custom_builder"),
    };
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return { ok: false, code: "server_error", error: "Not configured." };
  }

  const { data: row } = await admin
    .from("talent_sites")
    .select("id, version, draft_snapshot")
    .eq("talent_profile_id", scope.talentProfile.id)
    .maybeSingle();

  if (!row) {
    return { ok: false, code: "site_not_found", error: "Personal site not found." };
  }

  const site = row as { id: string; version: number; draft_snapshot: unknown };
  if (site.version !== input.expectedVersion) {
    return { ok: false, code: "stale_version", error: "Reload and try again." };
  }

  const validated = validateTalentSiteSnapshot(site.draft_snapshot, { planKey: scope.planKey });
  if (!validated.ok) {
    return { ok: false, code: "invalid_snapshot", error: validated.error };
  }

  const snapshot: TalentSiteSnapshot = {
    ...validated.snapshot,
    compositionMode: "custom",
    slots: input.slots.map((s, i) => ({ ...s, sortOrder: i })),
  };

  const revalidated = validateTalentSiteSnapshot(snapshot, { planKey: scope.planKey });
  if (!revalidated.ok) {
    return {
      ok: false,
      code: revalidated.code === "snapshot_too_large" ? "snapshot_too_large" : "invalid_snapshot",
      error: revalidated.error,
    };
  }

  const nextVersion = site.version + 1;
  const now = new Date().toISOString();

  await admin
    .from("talent_sites")
    .update({
      draft_snapshot: revalidated.snapshot,
      version: nextVersion,
      draft_updated_at: now,
      updated_by: scope.session.user.id,
      updated_at: now,
    })
    .eq("id", site.id)
    .eq("version", input.expectedVersion);

  await admin.from("talent_site_revisions").insert({
    talent_site_id: site.id,
    talent_profile_id: scope.talentProfile.id,
    kind: "draft",
    version: nextVersion,
    snapshot: revalidated.snapshot,
    created_by: scope.session.user.id,
  });

  bustTalentSiteCache(scope.talentProfile.id, scope.talentProfile.profileCode);

  return { ok: true, data: { version: nextVersion } };
}
