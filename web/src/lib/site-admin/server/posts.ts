import "server-only";

/**
 * posts.ts — the lib layer for Website → Posts (W3).
 *
 * The lean equivalent of `./pages.ts` for `cms_posts`: every state change
 * funnels through here so capability / tenant-scope / revision discipline
 * lives in one place. Posts have no composition, no CAS version column and
 * no system-owned rows, so this stays deliberately small.
 *
 * CAPABILITIES — mirrored from pages EXACTLY
 * ──────────────────────────────────────────
 *   create / save / delete → `agency.site_admin.pages.edit`
 *   publish / unpublish    → `agency.site_admin.pages.publish`
 * (`publishPage` and `archivePage` both gate on pages.publish; unpublishing
 * a post changes live visibility the same way archiving a page does.)
 *
 * TENANT SCOPE
 * ────────────
 * Every `cms_posts` read/write goes through `tenantScopedQuery`. The
 * `cms_post_revisions` insert has no tenant_id column, so it binds to a
 * `post_id` that was ALWAYS fetched tenant-scoped first — the same shape
 * `writePageRevision` uses. `posts-tenant-isolation.static.test.ts` asserts
 * both facts against this file's source.
 *
 * REVISIONS
 * ─────────
 * One `cms_post_revisions` row per save (kind='draft') and per publish
 * (kind='published'), snapshotting the editor fields — mirroring
 * `projectRevisionSnapshot` in pages.ts.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { requirePhase5Capability } from "@/lib/site-admin";
import { tenantScopedQuery } from "@/lib/supabase/tenant-scoped-query";
import { logServerError } from "@/lib/server/safe-error";
import {
  isPostLocale,
  isValidPostSlug,
  type PostLocale,
} from "@/lib/cms/posts-shared";

// ---- shapes ----------------------------------------------------------------

/** The editable fields, as the editor loads and saves them. */
export type PostEditorRecord = {
  id: string;
  locale: PostLocale;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  status: string;
  metaTitle: string | null;
  metaDescription: string | null;
  publishedAt: string | null;
  updatedAt: string | null;
};

export type PostSaveValues = {
  id: string;
  locale: PostLocale;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  metaTitle: string | null;
  metaDescription: string | null;
};

export type PostOpResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; message: string };

type PostRow = {
  id: string;
  locale: string;
  slug: string;
  title: string;
  excerpt: string;
  body: string;
  status: string;
  meta_title: string | null;
  meta_description: string | null;
  published_at: string | null;
  updated_at: string | null;
};

const POST_COLUMNS =
  "id, locale, slug, title, excerpt, body, status, meta_title, meta_description, published_at, updated_at";

function toEditorRecord(row: PostRow): PostEditorRecord {
  return {
    id: row.id,
    locale: isPostLocale(row.locale) ? row.locale : "en",
    slug: row.slug,
    title: row.title,
    excerpt: row.excerpt ?? "",
    body: row.body ?? "",
    status: row.status,
    metaTitle: row.meta_title,
    metaDescription: row.meta_description,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
  };
}

// ---- revisions -------------------------------------------------------------

/**
 * Editor-field snapshot persisted in `cms_post_revisions.snapshot`, mirroring
 * pages' `projectRevisionSnapshot`. A failed insert is logged, never thrown —
 * the post write already landed and losing a revision must not fail the save
 * (same policy as `writePageRevision`).
 */
async function writePostRevision(
  supabase: SupabaseClient,
  params: {
    postId: string;
    kind: "draft" | "published";
    row: PostRow;
    actorProfileId: string;
  },
): Promise<void> {
  const snapshot = {
    locale: params.row.locale,
    slug: params.row.slug,
    title: params.row.title,
    excerpt: params.row.excerpt,
    body: params.row.body,
    status: params.row.status,
    meta_title: params.row.meta_title,
    meta_description: params.row.meta_description,
    published_at: params.row.published_at,
  };
  const { error } = await supabase.from("cms_post_revisions").insert({
    post_id: params.postId,
    kind: params.kind,
    snapshot,
    created_by: params.actorProfileId,
  });
  if (error) {
    logServerError("site-admin/posts/revision-insert", error);
  }
}

// ---- reads -----------------------------------------------------------------

/** Load one post's full editable record, tenant-scoped. */
export async function getPostForEdit(
  supabase: SupabaseClient,
  params: { tenantId: string; postId: string },
): Promise<PostOpResult<PostEditorRecord>> {
  await requirePhase5Capability("agency.site_admin.pages.edit", params.tenantId);

  const { data, error } = await tenantScopedQuery(supabase, "cms_posts", params.tenantId)
    .select(POST_COLUMNS)
    .eq("id", params.postId)
    .maybeSingle<PostRow>();

  if (error) {
    logServerError("site-admin/posts/get-for-edit", error);
    return { ok: false, code: "READ_FAILED", message: "Could not load the post." };
  }
  if (!data) {
    return { ok: false, code: "NOT_FOUND", message: "Post not found. Reload to see the latest list." };
  }
  return { ok: true, data: toEditorRecord(data) };
}

// ---- create ----------------------------------------------------------------

/**
 * Create an "Untitled post" draft with a unique placeholder slug — same
 * flow as `createDraftPageAction`: the operator lands in the editor and the
 * slug auto-follows the first real title they type.
 */
export async function createDraftPost(
  supabase: SupabaseClient,
  params: { tenantId: string; locale: PostLocale; actorProfileId: string },
): Promise<PostOpResult<{ id: string }>> {
  await requirePhase5Capability("agency.site_admin.pages.edit", params.tenantId);

  const base = `untitled-post-${Date.now().toString(36)}`;
  let slug = base;
  for (let i = 2; i <= 30; i++) {
    const { data: existing } = await tenantScopedQuery(supabase, "cms_posts", params.tenantId)
      .select("id")
      .eq("locale", params.locale)
      .eq("slug", slug)
      .maybeSingle();
    if (!existing) break;
    slug = `${base}-${i}`;
    if (i === 30) slug = `${base}-${Math.random().toString(36).slice(2, 10)}`;
  }

  const { data, error } = await tenantScopedQuery(supabase, "cms_posts", params.tenantId)
    .insert({
      locale: params.locale,
      slug,
      title: "Untitled post",
      excerpt: "",
      body: "",
      status: "draft",
      include_in_sitemap: true,
      created_by: params.actorProfileId,
      updated_by: params.actorProfileId,
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !data) {
    logServerError("site-admin/posts/create-draft", error ?? new Error("insert returned no row"));
    return { ok: false, code: "CREATE_FAILED", message: "Could not create the post." };
  }
  return { ok: true, data: { id: data.id } };
}

// ---- save ------------------------------------------------------------------

/**
 * Save the editable fields of an existing post and write a kind='draft'
 * revision. Publishing state is NOT touched here — an edit to a published
 * post goes live on save (posts have no draft-of-published layer in v1),
 * which the editor states out loud next to the Save button.
 */
export async function savePost(
  supabase: SupabaseClient,
  params: { tenantId: string; values: PostSaveValues; actorProfileId: string },
): Promise<PostOpResult<{ id: string }>> {
  await requirePhase5Capability("agency.site_admin.pages.edit", params.tenantId);
  const { values } = params;

  const title = values.title.trim();
  const slug = values.slug.trim().toLowerCase();
  if (!title) return { ok: false, code: "VALIDATION_FAILED", message: "Give the post a title before saving." };
  if (!isValidPostSlug(slug)) {
    return {
      ok: false,
      code: "VALIDATION_FAILED",
      message: "The address may only contain lowercase letters, digits, and hyphens.",
    };
  }
  if (!isPostLocale(values.locale)) {
    return { ok: false, code: "VALIDATION_FAILED", message: "Pick English or Spanish for the language." };
  }

  // Unique per (tenant, locale, slug) — surface the conflict as a sentence,
  // not a Postgres unique-violation code.
  const { data: clash } = await tenantScopedQuery(supabase, "cms_posts", params.tenantId)
    .select("id")
    .eq("locale", values.locale)
    .eq("slug", slug)
    .neq("id", values.id)
    .maybeSingle();
  if (clash) {
    return {
      ok: false,
      code: "SLUG_TAKEN",
      message: "Another post in this language already uses that address. Choose a different one.",
    };
  }

  const { data, error } = await tenantScopedQuery(supabase, "cms_posts", params.tenantId)
    .update({
      locale: values.locale,
      slug,
      title,
      excerpt: values.excerpt.trim(),
      body: values.body,
      meta_title: values.metaTitle?.trim() || null,
      meta_description: values.metaDescription?.trim() || null,
      updated_by: params.actorProfileId,
    })
    .eq("id", values.id)
    .select(POST_COLUMNS)
    .maybeSingle<PostRow>();

  if (error) {
    logServerError("site-admin/posts/save", error);
    return { ok: false, code: "SAVE_FAILED", message: "Could not save the post. Try again." };
  }
  if (!data) {
    return { ok: false, code: "NOT_FOUND", message: "Post not found. Reload to see the latest list." };
  }

  await writePostRevision(supabase, {
    postId: data.id,
    kind: "draft",
    row: data,
    actorProfileId: params.actorProfileId,
  });
  return { ok: true, data: { id: data.id } };
}

// ---- publish / unpublish ---------------------------------------------------

/** Publish: status='published', stamp published_at, revision kind='published'. */
export async function publishPost(
  supabase: SupabaseClient,
  params: { tenantId: string; postId: string; actorProfileId: string },
): Promise<PostOpResult<{ id: string }>> {
  await requirePhase5Capability("agency.site_admin.pages.publish", params.tenantId);

  const { data, error } = await tenantScopedQuery(supabase, "cms_posts", params.tenantId)
    .update({
      status: "published",
      published_at: new Date().toISOString(),
      updated_by: params.actorProfileId,
    })
    .eq("id", params.postId)
    .select(POST_COLUMNS)
    .maybeSingle<PostRow>();

  if (error) {
    logServerError("site-admin/posts/publish", error);
    return { ok: false, code: "PUBLISH_FAILED", message: "Could not publish the post. Try again." };
  }
  if (!data) {
    return { ok: false, code: "NOT_FOUND", message: "Post not found. Reload to see the latest list." };
  }

  await writePostRevision(supabase, {
    postId: data.id,
    kind: "published",
    row: data,
    actorProfileId: params.actorProfileId,
  });
  return { ok: true, data: { id: data.id } };
}

/**
 * Unpublish: back to draft. `published_at` is cleared so no surface can
 * mistake the post for live — the public RLS policy keys on status, and the
 * admin list keys on published_at for its "since" line.
 */
export async function unpublishPost(
  supabase: SupabaseClient,
  params: { tenantId: string; postId: string; actorProfileId: string },
): Promise<PostOpResult<{ id: string }>> {
  await requirePhase5Capability("agency.site_admin.pages.publish", params.tenantId);

  const { data, error } = await tenantScopedQuery(supabase, "cms_posts", params.tenantId)
    .update({
      status: "draft",
      published_at: null,
      updated_by: params.actorProfileId,
    })
    .eq("id", params.postId)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (error) {
    logServerError("site-admin/posts/unpublish", error);
    return { ok: false, code: "UNPUBLISH_FAILED", message: "Could not unpublish the post. Try again." };
  }
  if (!data) {
    return { ok: false, code: "NOT_FOUND", message: "Post not found. Reload to see the latest list." };
  }
  return { ok: true, data: { id: data.id } };
}

// ---- delete ----------------------------------------------------------------

/**
 * Delete a post for good. Refused while the post is published — the same
 * novice guard the UI enforces (`derivePostActions`), repeated server-side
 * so a stale button can never skip it. Revisions cascade with the row.
 */
export async function deletePost(
  supabase: SupabaseClient,
  params: { tenantId: string; postId: string },
): Promise<PostOpResult<{ id: string }>> {
  await requirePhase5Capability("agency.site_admin.pages.edit", params.tenantId);

  const { data: current } = await tenantScopedQuery(supabase, "cms_posts", params.tenantId)
    .select("id, status")
    .eq("id", params.postId)
    .maybeSingle<{ id: string; status: string }>();

  if (!current) {
    return { ok: false, code: "NOT_FOUND", message: "Post not found. Reload to see the latest list." };
  }
  if (current.status === "published") {
    return {
      ok: false,
      code: "STILL_PUBLISHED",
      message: "This post is live. Unpublish it first, then delete it.",
    };
  }

  const { error } = await tenantScopedQuery(supabase, "cms_posts", params.tenantId)
    .delete()
    .eq("id", params.postId);

  if (error) {
    logServerError("site-admin/posts/delete", error);
    return { ok: false, code: "DELETE_FAILED", message: "Could not delete the post. Try again." };
  }
  return { ok: true, data: { id: params.postId } };
}
