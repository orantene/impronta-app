import "server-only";

/**
 * posts-scheduled-sweep.ts — the Posts half of /api/cron/publish-scheduled.
 *
 * A scheduled ("Programado") post is status='draft' with scheduled_publish_at
 * set and <= now, and no takedown. published_at is NEVER a schedule signal
 * (live-tenant drafts carry stale values). Each due row is published through the SCOPED write path
 * (tenantScopedQuery / talentScopedQuery) only when its owner holds the posts
 * capability. A row whose owner lacks it is SKIPPED with a recorded reason —
 * the row is never mutated, so renewing the plan lets the next tick publish it.
 *
 * Owner = the row's scope: tenant rows check the workspace plan, talent rows
 * check Web Office.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { publishPostNow, type PostScope } from "@/lib/cms/posts-writer";
import { loadTalentCanPublishPosts, loadWorkspaceCanPublishPosts } from "@/lib/cms/posts-scope";
import { logServerError } from "@/lib/server/safe-error";

export type DuePostRow = {
  id: string;
  tenant_id: string | null;
  talent_profile_id: string | null;
  status: string;
  published_at: string | null;
  scheduled_publish_at: string | null;
  taken_down_at: string | null;
  updated_by: string | null;
};

export const DUE_POST_COLUMNS = "id, tenant_id, talent_profile_id, status, published_at, scheduled_publish_at, taken_down_at, updated_by";

export type PostsSweepReport = {
  published: string[];
  skipped: { postId: string; reason: "owner_lacks_posts_capability" | "no_scope" | "not_due" }[];
  failed: { postId: string; error: string }[];
};

export type PostsSweepDeps = {
  nowIso: string;
  rows: DuePostRow[];
  ownerCanPublish: (scope: PostScope) => Promise<boolean>;
  publish: (row: DuePostRow, scope: PostScope) => Promise<{ ok: true } | { ok: false; error: string }>;
};

export function scopeOfRow(row: Pick<DuePostRow, "tenant_id" | "talent_profile_id">): PostScope | null {
  if (row.tenant_id) return { kind: "tenant", tenantId: row.tenant_id };
  if (row.talent_profile_id) return { kind: "talent", talentProfileId: row.talent_profile_id };
  return null;
}

/** Pure routing over injected deps (unit-tested). */
export async function runPostsScheduledSweep(deps: PostsSweepDeps): Promise<PostsSweepReport> {
  const report: PostsSweepReport = { published: [], skipped: [], failed: [] };
  const now = Date.parse(deps.nowIso);
  for (const row of deps.rows) {
    const due =
      row.status === "draft" &&
      !row.taken_down_at &&
      !!row.scheduled_publish_at &&
      Date.parse(row.scheduled_publish_at) <= now;
    if (!due) {
      report.skipped.push({ postId: row.id, reason: "not_due" });
      continue;
    }
    const scope = scopeOfRow(row);
    if (!scope) {
      report.skipped.push({ postId: row.id, reason: "no_scope" });
      continue;
    }
    if (!(await deps.ownerCanPublish(scope))) {
      report.skipped.push({ postId: row.id, reason: "owner_lacks_posts_capability" });
      continue;
    }
    const res = await deps.publish(row, scope);
    if (res.ok) report.published.push(row.id);
    else report.failed.push({ postId: row.id, error: res.error });
  }
  return report;
}

/**
 * Cron entry (service-role client). The due-row read is the one cross-scope
 * read in Posts: the cron has no tenant, it sweeps every owner. Every WRITE
 * goes through the scoped writer.
 */
export async function sweepScheduledPosts(admin: SupabaseClient, nowIso: string): Promise<PostsSweepReport> {
  const { data, error } = await admin
    .from("cms_posts")
    .select(DUE_POST_COLUMNS)
    .eq("status", "draft")
    .is("taken_down_at", null)
    .not("scheduled_publish_at", "is", null)
    .lte("scheduled_publish_at", nowIso);
  if (error) {
    logServerError("cron/publish-scheduled/posts-load-due", error);
    return { published: [], skipped: [], failed: [{ postId: "*", error: error.message }] };
  }
  const cache = new Map<string, boolean>();
  const report = await runPostsScheduledSweep({
    nowIso,
    rows: (data ?? []) as DuePostRow[],
    async ownerCanPublish(scope) {
      const key = scope.kind === "tenant" ? `t:${scope.tenantId}` : `p:${scope.talentProfileId}`;
      const hit = cache.get(key);
      if (hit !== undefined) return hit;
      const can =
        scope.kind === "tenant"
          ? await loadWorkspaceCanPublishPosts(admin, scope.tenantId)
          : await loadTalentCanPublishPosts(admin, scope.talentProfileId);
      cache.set(key, can);
      return can;
    },
    async publish(row, scope) {
      const res = await publishPostNow(
        { supabase: admin, scope, actorProfileId: null, actorKind: "system", canPublish: true, uiLocale: "en" },
        { id: row.id, fromSchedule: true },
      );
      return res.ok ? { ok: true } : { ok: false, error: `${res.code}: ${res.message}` };
    },
  });
  for (const s of report.skipped) {
    if (s.reason === "owner_lacks_posts_capability") {
      console.info(`[cron/publish-scheduled/posts] skipped ${s.postId}: owner_lacks_posts_capability`);
    }
  }
  return report;
}
