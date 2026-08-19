"use server";

/**
 * W3 — post server actions (thin wrappers).
 *
 * The Posts manager's write path, mirroring `admin-site-pages.ts` in shape:
 * each action
 *   1. guards session + tenant scope,
 *   2. validates its plain-object input,
 *   3. delegates to the lib-layer operation in
 *      `lib/site-admin/server/posts.ts` (capability / revision / tenant-scope
 *      discipline lives there),
 *   4. returns a tagged union with a human-readable error.
 *
 * Posts are simpler than pages (no composition, no CAS version, no system
 * rows), so these take plain objects like `quickRenamePageAction` rather
 * than FormData + Zod.
 *
 * Capabilities (checked in the lib layer, mirroring pages exactly):
 *   create / save / delete → `agency.site_admin.pages.edit`
 *   publish / unpublish    → `agency.site_admin.pages.publish`
 */

import { requireSession } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";
import { CLIENT_ERROR, logServerError } from "@/lib/server/safe-error";
import { loadTenantLocaleSettings } from "@/lib/site-admin/server/locale-resolver";
import { isPostLocale, type PostLocale } from "@/lib/cms/posts-shared";
import {
  createDraftPost,
  deletePost,
  getPostForEdit,
  publishPost,
  savePost,
  unpublishPost,
  type PostEditorRecord,
} from "@/lib/site-admin/server/posts";

export type PostActionResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

type SessionOk = Extract<Awaited<ReturnType<typeof requireSession>>, { ok: true }>;

type Guarded =
  | { ok: true; auth: SessionOk; tenantId: string }
  | { ok: false; error: string };

async function guard(): Promise<Guarded> {
  const auth = await requireSession();
  if (!auth.ok) return { ok: false, error: auth.error };
  const scope = await requireTenantScope().catch(() => null);
  if (!scope) {
    return { ok: false, error: "Select an agency workspace before managing posts." };
  }
  return { ok: true, auth, tenantId: scope.tenantId };
}

/**
 * Always the FAILURE variant — declared narrowly so it is assignable to every
 * action's result union, including `getPostForEditAction`'s (whose success
 * shape carries `post`, not `id`).
 */
function forbiddenOr(error: unknown, fallback: string): { ok: false; error: string } {
  if (error instanceof Error && /forbidden/i.test(error.message)) {
    return { ok: false, error: "Not authorized." };
  }
  return { ok: false, error: fallback };
}

// ---- create ----------------------------------------------------------------

/**
 * Create an "Untitled post" draft at the tenant's default locale and return
 * its id so the client can open the editor on it — same flow as
 * `createDraftPageAction`.
 */
export async function createDraftPostAction(): Promise<PostActionResult> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };

  try {
    const localeSettings = await loadTenantLocaleSettings(g.tenantId).catch(() => null);
    const defaultLocale = localeSettings?.defaultLocale ?? "en";
    const locale: PostLocale = isPostLocale(defaultLocale) ? defaultLocale : "en";
    const result = await createDraftPost(g.auth.supabase, {
      tenantId: g.tenantId,
      locale,
      actorProfileId: g.auth.user.id,
    });
    if (!result.ok) return { ok: false, error: result.message };
    return { ok: true, id: result.data.id };
  } catch (error) {
    logServerError("site-admin/posts/create-draft-action", error);
    return forbiddenOr(error, CLIENT_ERROR.update);
  }
}

// ---- read for the editor ---------------------------------------------------

/** Load one post's full editable record (the list projection has no body). */
export async function getPostForEditAction(
  postId: string,
): Promise<{ ok: true; post: PostEditorRecord } | { ok: false; error: string }> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };

  try {
    const result = await getPostForEdit(g.auth.supabase, {
      tenantId: g.tenantId,
      postId,
    });
    if (!result.ok) return { ok: false, error: result.message };
    return { ok: true, post: result.data };
  } catch (error) {
    logServerError("site-admin/posts/get-for-edit-action", error);
    return forbiddenOr(error, "Could not load the post.");
  }
}

// ---- save ------------------------------------------------------------------

export async function savePostAction(input: {
  id: string;
  locale: string;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  metaTitle: string | null;
  metaDescription: string | null;
}): Promise<PostActionResult> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };

  if (!isPostLocale(input.locale)) {
    return { ok: false, error: "Pick English or Spanish for the language." };
  }

  try {
    const result = await savePost(g.auth.supabase, {
      tenantId: g.tenantId,
      values: {
        id: input.id,
        locale: input.locale,
        slug: input.slug,
        title: input.title,
        excerpt: input.excerpt,
        body: input.body,
        metaTitle: input.metaTitle,
        metaDescription: input.metaDescription,
      },
      actorProfileId: g.auth.user.id,
    });
    if (!result.ok) return { ok: false, error: result.message };
    return { ok: true, id: result.data.id };
  } catch (error) {
    logServerError("site-admin/posts/save-action", error);
    return forbiddenOr(error, CLIENT_ERROR.update);
  }
}

// ---- publish / unpublish ---------------------------------------------------

export async function publishPostAction(postId: string): Promise<PostActionResult> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };

  try {
    const result = await publishPost(g.auth.supabase, {
      tenantId: g.tenantId,
      postId,
      actorProfileId: g.auth.user.id,
    });
    if (!result.ok) return { ok: false, error: result.message };
    return { ok: true, id: result.data.id };
  } catch (error) {
    logServerError("site-admin/posts/publish-action", error);
    return forbiddenOr(error, "Not authorized to publish.");
  }
}

export async function unpublishPostAction(postId: string): Promise<PostActionResult> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };

  try {
    const result = await unpublishPost(g.auth.supabase, {
      tenantId: g.tenantId,
      postId,
      actorProfileId: g.auth.user.id,
    });
    if (!result.ok) return { ok: false, error: result.message };
    return { ok: true, id: result.data.id };
  } catch (error) {
    logServerError("site-admin/posts/unpublish-action", error);
    return forbiddenOr(error, "Not authorized to publish.");
  }
}

// ---- delete ----------------------------------------------------------------

export async function deletePostAction(postId: string): Promise<PostActionResult> {
  const g = await guard();
  if (!g.ok) return { ok: false, error: g.error };

  try {
    const result = await deletePost(g.auth.supabase, {
      tenantId: g.tenantId,
      postId,
    });
    if (!result.ok) return { ok: false, error: result.message };
    return { ok: true, id: result.data.id };
  } catch (error) {
    logServerError("site-admin/posts/delete-action", error);
    return forbiddenOr(error, CLIENT_ERROR.update);
  }
}
