"use server";

import { loadTalentPersonalSiteDashboardState } from "@/lib/talent-site/server/dashboard-state";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import {
  assertTalentCanEditPersonalSite,
  assertTalentCanPublishPersonalSite,
  requireTalentSelf,
} from "@/lib/server/talent-self-guard";
import { bustTalentSiteCache } from "@/lib/talent-site/cache-tags";
import { buildStarterSnapshotForTalent } from "@/lib/talent-site/server/load-starter-data";
import type { TalentSiteActionResult, TalentSiteSnapshot } from "@/lib/talent-site/types";
import { validateTalentSiteSnapshot } from "@/lib/talent-site/validation";

const PLAN_DENIED =
  "Upgrade to Max to edit or publish again." as const;

export async function fetchTalentPersonalSiteDashboardStateAction() {
  return loadTalentPersonalSiteDashboardState();
}

function planDenied<T = void>(): TalentSiteActionResult<T> {
  return { ok: false, code: "plan_required", error: PLAN_DENIED };
}

export async function createTalentPersonalSiteDraftAction(): Promise<
  TalentSiteActionResult<{ siteId: string; version: number }>
> {
  const scope = await requireTalentSelf();
  if (!scope.ok) {
    return { ok: false, code: scope.code, error: scope.error };
  }
  if (!assertTalentCanEditPersonalSite(scope.planKey)) {
    return planDenied();
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
      data: { siteId: (existing as { id: string }).id, version: (existing as { version: number }).version },
    };
  }

  const starter = await buildStarterSnapshotForTalent(scope.talentProfile.id);
  if (!starter) {
    return { ok: false, code: "server_error", error: "Could not build starter content." };
  }

  const validated = validateTalentSiteSnapshot(starter);
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

  const { error: revErr } = await admin.from("talent_site_revisions").insert({
    talent_site_id: siteId,
    talent_profile_id: scope.talentProfile.id,
    kind: "draft",
    version,
    snapshot: validated.snapshot,
    created_by: scope.session.user.id,
  });

  if (revErr) {
    logServerError("talentSite.createDraft.revision", revErr);
  }

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
    return planDenied();
  }

  const validated = validateTalentSiteSnapshot(input.snapshot);
  if (!validated.ok) {
    return { ok: false, code: "invalid_snapshot", error: validated.error };
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return { ok: false, code: "server_error", error: "Not configured." };
  }

  const { data: row, error: fetchErr } = await admin
    .from("talent_sites")
    .select("id, version, talent_profile_id")
    .eq("talent_profile_id", scope.talentProfile.id)
    .maybeSingle();

  if (fetchErr || !row) {
    return { ok: false, code: "site_not_found", error: "Personal site not found." };
  }

  const site = row as { id: string; version: number; talent_profile_id: string };
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
    return planDenied();
  }

  const admin = createServiceRoleClient();
  if (!admin) {
    return { ok: false, code: "server_error", error: "Not configured." };
  }

  const { data: row, error: fetchErr } = await admin
    .from("talent_sites")
    .select("id, version, draft_snapshot, talent_profile_id")
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

  const validated = validateTalentSiteSnapshot(site.draft_snapshot);
  if (!validated.ok) {
    return { ok: false, code: "invalid_snapshot", error: validated.error };
  }

  const publishedAt = new Date().toISOString();
  const publishedSnapshot: TalentSiteSnapshot = {
    ...validated.snapshot,
    publishedAt,
    pageVersion: site.version + 1,
  };

  const nextVersion = site.version + 1;

  const { error: updateErr } = await admin
    .from("talent_sites")
    .update({
      status: "published",
      published_snapshot: publishedSnapshot,
      draft_snapshot: validated.snapshot,
      version: nextVersion,
      published_at: publishedAt,
      unpublished_at: null,
      draft_updated_at: publishedAt,
      updated_by: scope.session.user.id,
      updated_at: publishedAt,
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
    return planDenied();
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
