"use server";

/**
 * Posts v1 "Diseño de posts" + builder page-tree POSTS group actions
 * (TUL-1008). Two families, two guards, one engine (`post-layout-store.ts`):
 *
 *   workspace* — workspace admins. Scope = the session tenant; writes go
 *                through the session client and `tenantScopedQuery`
 *                (the tenant-scoped cms_pages path), RLS is the backstop.
 *   talent*    — the talent's own personal site (`talent_sites.post_layout`).
 *                The profile id comes from the session, never from input.
 *
 * Tenant / talent ids NEVER come from client input.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { assertNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { parsePostLayout, type PostLayoutSection } from "@/lib/cms/post-layout";
import {
  createSupabasePostLayoutStore,
  ensurePostLayout,
  savePostLayout,
  type PostLayoutStore,
} from "@/lib/cms/post-layout-store";
import type { PostListRow } from "@/lib/cms/post-writer-types";
import { listPostsForOwner } from "@/lib/cms/posts-writer-read";
import type { PostScope } from "@/lib/cms/posts-writer";
import { requireTenantScope } from "@/lib/saas";
import { requireSession } from "@/lib/server/action-guards";
import { logServerError } from "@/lib/server/safe-error";
import { requireTalentSelf } from "@/lib/server/talent-self-guard";
import { requirePhase5Capability } from "@/lib/site-admin";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export type PostLayoutActionResult =
  | { ok: true; sections: PostLayoutSection[]; pageId: string | null }
  | { ok: false; error: string };

export type PostsTreeResult = { ok: true; posts: PostListRow[] } | { ok: false; error: string };

const FAIL = "Could not load the post design.";

type Guarded = { ok: true; scope: PostScope; supabase: SupabaseClient; store: PostLayoutStore } | { ok: false; error: string };

async function workspaceGuard(): Promise<Guarded> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return { ok: false, error: readOnly.error };
  const auth = await requireSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) return { ok: false, error: "Select an agency workspace before managing posts." };
  try {
    await requirePhase5Capability("agency.site_admin.pages.edit", scope.tenantId);
  } catch {
    return { ok: false, error: "Not authorized." };
  }
  return {
    ok: true,
    scope: { kind: "tenant", tenantId: scope.tenantId },
    supabase: auth.supabase,
    store: createSupabasePostLayoutStore(auth.supabase),
  };
}

async function talentGuard(): Promise<Guarded> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return { ok: false, error: readOnly.error };
  const self = await requireTalentSelf();
  if (!self.ok) return { ok: false, error: self.error };
  // talent_sites has no owner-RLS write policy for the session client: the
  // profile id is the session's own, so the service role writes by that id.
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, error: FAIL };
  return {
    ok: true,
    scope: { kind: "talent", talentProfileId: self.talentProfile.id },
    supabase: self.session.supabase,
    store: createSupabasePostLayoutStore(admin),
  };
}

async function ensureWith(g: Guarded, locale: string): Promise<PostLayoutActionResult> {
  if (!g.ok) return g;
  try {
    const ensured = await ensurePostLayout(g.store, g.scope, locale);
    return ensured ? { ok: true, sections: ensured.sections, pageId: ensured.pageId } : { ok: false, error: FAIL };
  } catch (error) {
    logServerError("cms/post-layout-actions/ensure", error);
    return { ok: false, error: FAIL };
  }
}

async function saveWith(g: Guarded, locale: string, sections: unknown): Promise<PostLayoutActionResult> {
  if (!g.ok) return g;
  const envelope = { kind: "post_layout", v: 1, sections };
  const valid = parsePostLayout(envelope);
  if (!valid) return { ok: false, error: "That layout is not valid." };
  try {
    const ok = await savePostLayout(g.store, g.scope, locale, valid);
    return ok ? { ok: true, sections: valid, pageId: null } : { ok: false, error: "Could not save the post design." };
  } catch (error) {
    logServerError("cms/post-layout-actions/save", error);
    return { ok: false, error: "Could not save the post design." };
  }
}

const loc = (l: string) => (l === "es" ? "es" : "en");

/** Create-on-first-use, then return the layout (and the cms_pages id for workspace sites). */
export async function workspaceEnsurePostLayoutAction(locale: string): Promise<PostLayoutActionResult> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return readOnly;
  return ensureWith(await workspaceGuard(), loc(locale));
}
export async function workspaceSavePostLayoutAction(locale: string, sections: unknown): Promise<PostLayoutActionResult> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return readOnly;
  return saveWith(await workspaceGuard(), loc(locale), sections);
}
export async function talentEnsurePostLayoutAction(locale: string): Promise<PostLayoutActionResult> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return readOnly;
  return ensureWith(await talentGuard(), loc(locale));
}
export async function talentSavePostLayoutAction(locale: string, sections: unknown): Promise<PostLayoutActionResult> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return readOnly;
  return saveWith(await talentGuard(), loc(locale), sections);
}

/** The latest posts of the workspace for the builder page tree POSTS group. */
export async function workspaceListPostsTreeAction(limit = 5): Promise<PostsTreeResult> {
  const g = await workspaceGuard();
  if (!g.ok) return g;
  try {
    return { ok: true, posts: await listPostsForOwner(g.supabase, g.scope, Math.min(10, Math.max(1, limit))) };
  } catch (error) {
    logServerError("cms/post-layout-actions/ws-tree", error);
    return { ok: false, error: "Could not load posts." };
  }
}

/** The latest posts of the talent's own site for the talent builder POSTS group. */
export async function talentListPostsTreeAction(limit = 5): Promise<PostsTreeResult> {
  const g = await talentGuard();
  if (!g.ok) return g;
  try {
    return { ok: true, posts: await listPostsForOwner(g.supabase, g.scope, Math.min(10, Math.max(1, limit))) };
  } catch (error) {
    logServerError("cms/post-layout-actions/talent-tree", error);
    return { ok: false, error: "Could not load posts." };
  }
}
