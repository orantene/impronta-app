import "server-only";

/**
 * posts-platform-admin.ts — Posts v1 takedown (TUL-1011), platform-admin only.
 *
 * Takedown is the one Posts write that is deliberately NOT tenant-scoped: the
 * platform admin hides a post on ANY tenant or talent site. That is why it
 * lives apart from `posts-writer.ts` (whose static test forbids raw `.from()`):
 * this module is the single, named exception, and it only runs behind
 * `assertPlatformAdmin` in `posts-takedown-actions.ts`.
 *
 * The caller passes a SERVICE-ROLE client. The DB trigger
 * `cms_posts_guard_takedown` accepts taken_down_* writes from `service_role`
 * (and from `is_platform_admin()`), and rejects every staff session. The
 * writer layer separately rejects any taken_down_* field in a tenant/talent
 * patch (`forbidden_field`), so the owner can never clear a takedown.
 *
 * Takedown never rewrites the owner's `noindex`: the public read serves a
 * taken-down post as a noindexed 404, so restore returns the owner's own SEO
 * settings untouched.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";

export const TAKEDOWN_REASON_MAX = 500;

export type TakedownResult =
  | { ok: true }
  | { ok: false; code: "reason_required" | "not_found" | "already_taken_down" | "not_taken_down" | "write_failed"; message: string };

export function normalizeTakedownReason(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, TAKEDOWN_REASON_MAX);
}

type PostStateRow = { id: string; taken_down_at: string | null };

async function loadState(admin: SupabaseClient, postId: string): Promise<PostStateRow | null | "error"> {
  const { data, error } = await admin
    .from("cms_posts")
    .select("id, taken_down_at")
    .eq("id", postId)
    .maybeSingle<PostStateRow>();
  if (error) {
    logServerError("cms/posts-platform-admin/load", error);
    return "error";
  }
  return data ?? null;
}

export async function takedownPostRow(
  admin: SupabaseClient,
  input: { postId: string; actorId: string; reason: string; now?: Date },
): Promise<TakedownResult> {
  const reason = normalizeTakedownReason(input.reason);
  if (!reason) return { ok: false, code: "reason_required", message: "A reason is required." };
  const state = await loadState(admin, input.postId);
  if (state === "error") return { ok: false, code: "write_failed", message: "Could not hide the post." };
  if (!state) return { ok: false, code: "not_found", message: "Post not found." };
  if (state.taken_down_at) return { ok: false, code: "already_taken_down", message: "Already hidden." };
  const { error } = await admin
    .from("cms_posts")
    .update({
      taken_down_at: (input.now ?? new Date()).toISOString(),
      taken_down_by: input.actorId,
      taken_down_reason: reason,
    })
    .eq("id", input.postId);
  if (error) {
    logServerError("cms/posts-platform-admin/takedown", error);
    return { ok: false, code: "write_failed", message: "Could not hide the post." };
  }
  return { ok: true };
}

export async function restorePostRow(
  admin: SupabaseClient,
  input: { postId: string },
): Promise<TakedownResult> {
  const state = await loadState(admin, input.postId);
  if (state === "error") return { ok: false, code: "write_failed", message: "Could not restore the post." };
  if (!state) return { ok: false, code: "not_found", message: "Post not found." };
  if (!state.taken_down_at) return { ok: false, code: "not_taken_down", message: "Post is not hidden." };
  const { error } = await admin
    .from("cms_posts")
    .update({ taken_down_at: null, taken_down_by: null, taken_down_reason: null })
    .eq("id", input.postId);
  if (error) {
    logServerError("cms/posts-platform-admin/restore", error);
    return { ok: false, code: "write_failed", message: "Could not restore the post." };
  }
  return { ok: true };
}

export type PlatformPostRow = {
  id: string;
  title: string;
  slug: string;
  locale: string;
  status: string;
  /** Tenant name, talent display name, or null when both are gone. */
  ownerName: string | null;
  ownerKind: "workspace" | "talent";
  updatedAt: string | null;
  takenDown: boolean;
  takenDownReason: string | null;
};

type ListRow = {
  id: string;
  title: string | null;
  slug: string;
  locale: string;
  status: string;
  tenant_id: string | null;
  talent_profile_id: string | null;
  updated_at: string | null;
  taken_down_at: string | null;
  taken_down_reason: string | null;
};

/** PostgREST `or()` and ilike treat these specially; strip them from a search term. */
export function sanitizeSearchTerm(raw: string): string {
  return raw.replace(/[%_,()*\\"']/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

export async function listPostsForPlatformAdmin(
  admin: SupabaseClient,
  opts: { search?: string; onlyHidden?: boolean; limit?: number } = {},
): Promise<PlatformPostRow[]> {
  const term = sanitizeSearchTerm(opts.search ?? "");
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 200);

  let tenantIds: string[] = [];
  let talentIds: string[] = [];
  if (term) {
    const [tenants, talents] = await Promise.all([
      admin.from("agencies").select("id").ilike("display_name", `%${term}%`).limit(50),
      admin.from("talent_profiles").select("id").ilike("display_name", `%${term}%`).limit(50),
    ]);
    tenantIds = ((tenants.data ?? []) as { id: string }[]).map((r) => r.id);
    talentIds = ((talents.data ?? []) as { id: string }[]).map((r) => r.id);
  }

  let q = admin
    .from("cms_posts")
    .select("id, title, slug, locale, status, tenant_id, talent_profile_id, updated_at, taken_down_at, taken_down_reason")
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (opts.onlyHidden) q = q.not("taken_down_at", "is", null);
  if (term) {
    const parts = [`title.ilike.%${term}%`, `slug.ilike.%${term}%`];
    if (tenantIds.length) parts.push(`tenant_id.in.(${tenantIds.join(",")})`);
    if (talentIds.length) parts.push(`talent_profile_id.in.(${talentIds.join(",")})`);
    q = q.or(parts.join(","));
  }
  const { data, error } = await q;
  if (error) {
    logServerError("cms/posts-platform-admin/list", error);
    return [];
  }
  const rows = (data ?? []) as ListRow[];
  const needTenants = [...new Set(rows.map((r) => r.tenant_id).filter((v): v is string => !!v))];
  const needTalents = [...new Set(rows.map((r) => r.talent_profile_id).filter((v): v is string => !!v))];
  const [tn, tl] = await Promise.all([
    needTenants.length ? admin.from("agencies").select("id, display_name").in("id", needTenants) : Promise.resolve({ data: [] }),
    needTalents.length ? admin.from("talent_profiles").select("id, display_name").in("id", needTalents) : Promise.resolve({ data: [] }),
  ]);
  const tenantName = new Map(((tn.data ?? []) as { id: string; display_name: string | null }[]).map((r) => [r.id, r.display_name]));
  const talentName = new Map(((tl.data ?? []) as { id: string; display_name: string | null }[]).map((r) => [r.id, r.display_name]));
  return rows.map((r) => ({
    id: r.id,
    title: r.title ?? "",
    slug: r.slug,
    locale: r.locale,
    status: r.status,
    ownerKind: r.tenant_id ? "workspace" : "talent",
    ownerName: (r.tenant_id ? tenantName.get(r.tenant_id) : r.talent_profile_id ? talentName.get(r.talent_profile_id) : null) ?? null,
    updatedAt: r.updated_at,
    takenDown: r.taken_down_at !== null,
    takenDownReason: r.taken_down_reason,
  }));
}

// ---- gated entry points ----------------------------------------------------

/** Resolved on the SERVER by the action layer: is the session a platform admin. */
export type PlatformAdminGate = () => Promise<
  { ok: true; userId: string; admin: SupabaseClient } | { ok: false; error: string }
>;

function notAllowed(message: string): TakedownResult {
  return { ok: false, code: "write_failed", message: message || "Platform admin access required." };
}

export async function takedownPost(
  gate: PlatformAdminGate,
  input: { postId: string; reason: string },
): Promise<TakedownResult> {
  const g = await gate();
  if (!g.ok) return notAllowed(g.error);
  return takedownPostRow(g.admin, { postId: input.postId, actorId: g.userId, reason: input.reason });
}

export async function restorePost(gate: PlatformAdminGate, input: { postId: string }): Promise<TakedownResult> {
  const g = await gate();
  if (!g.ok) return notAllowed(g.error);
  return restorePostRow(g.admin, { postId: input.postId });
}
