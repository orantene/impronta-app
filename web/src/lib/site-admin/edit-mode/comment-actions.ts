"use server";

/**
 * Phase 11 — section-comment server actions (staff side).
 *
 * Operators thread comments on individual homepage sections from the
 * Comments drawer. Staff actions are gated on `requireStaff` +
 * `requireTenantScope` and write through RLS via the per-request
 * Supabase client (the `cms_section_comments_staff_all` policy permits).
 *
 * Reviewer-side authoring (share-link recipients with `comment: 'rw'`)
 * uses a sibling module at runtime — gated on the share-link JWT
 * verification rather than a real auth session, and writes via the
 * service-role client. That module is not in this file because the
 * trust boundary is materially different and lumping them together
 * makes both harder to audit.
 *
 * Realtime: every staff write flows through the same `cms_section_comments`
 * publication, so a second tab subscribing on `(tenant_id, page_id)`
 * sees the new row without a refresh. The actions don't ship Realtime
 * channel logic themselves — that lives client-side in the drawer.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import { requireStaff } from "@/lib/server/action-guards";
import { requireTenantScope } from "@/lib/saas";
import { logServerError } from "@/lib/server/safe-error";
import { isLocale, type Locale } from "@/lib/site-admin/locales";

// ── shared types ────────────────────────────────────────────────────────

export type CommentAuthorKind = "staff" | "reviewer";

export interface CommentRow {
  id: string;
  pageId: string;
  sectionId: string;
  parentCommentId: string | null;
  body: string;
  authorKind: CommentAuthorKind;
  authorUserId: string | null;
  authorShareLinkId: string | null;
  authorDisplayName: string | null;
  resolvedAt: string | null;
  resolvedByUserId: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface CommentDbRow {
  id: string;
  page_id: string;
  section_id: string;
  parent_comment_id: string | null;
  body: string;
  author_kind: CommentAuthorKind;
  author_user_id: string | null;
  author_share_link_id: string | null;
  author_display_name: string | null;
  resolved_at: string | null;
  resolved_by_user_id: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

function rowToComment(r: CommentDbRow): CommentRow {
  return {
    id: r.id,
    pageId: r.page_id,
    sectionId: r.section_id,
    parentCommentId: r.parent_comment_id,
    body: r.body,
    authorKind: r.author_kind,
    authorUserId: r.author_user_id,
    authorShareLinkId: r.author_share_link_id,
    authorDisplayName: r.author_display_name,
    resolvedAt: r.resolved_at,
    resolvedByUserId: r.resolved_by_user_id,
    deletedAt: r.deleted_at,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

function asLocale(raw: string | undefined): Locale | null {
  return isLocale(raw ?? "en") ? ((raw ?? "en") as Locale) : null;
}

const MIN_BODY_LENGTH = 1;
const MAX_BODY_LENGTH = 4000;

function normalizeBody(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length < MIN_BODY_LENGTH || trimmed.length > MAX_BODY_LENGTH) {
    return null;
  }
  return trimmed;
}

// ── homepage page-id resolver ───────────────────────────────────────────

async function resolveHomepagePageId(
  supabase: SupabaseClient,
  tenantId: string,
  locale: Locale,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("cms_pages")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("locale", locale)
    .eq("is_system_owned", true)
    .eq("system_template_key", "homepage")
    .maybeSingle<{ id: string }>();
  if (error || !data) return null;
  return data.id;
}

// ── list ────────────────────────────────────────────────────────────────

export interface ListCommentsInput {
  locale?: string;
  /** Optional section filter — when set, returns only comments on this section. */
  sectionId?: string;
  /** Optional resolution filter — `false` excludes resolved threads. */
  includeResolved?: boolean;
}

export type ListCommentsResult =
  | { ok: true; pageId: string; comments: CommentRow[] }
  | { ok: false; error: string; code?: string };

export async function listCommentsAction(
  input: ListCommentsInput = {},
): Promise<ListCommentsResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error, code: "UNAUTHORIZED" };

  const scope = await requireTenantScope().catch(() => null);
  if (!scope) {
    return {
      ok: false,
      error: "Select an agency workspace to read comments.",
      code: "NO_TENANT",
    };
  }

  const locale = asLocale(input.locale);
  if (!locale) return { ok: false, error: "Invalid locale.", code: "BAD_INPUT" };

  const pageId = await resolveHomepagePageId(
    auth.supabase,
    scope.tenantId,
    locale,
  );
  if (!pageId) {
    return { ok: false, error: "Homepage row not found.", code: "NOT_FOUND" };
  }

  let query = auth.supabase
    .from("cms_section_comments")
    .select(
      "id, page_id, section_id, parent_comment_id, body, author_kind, author_user_id, author_share_link_id, author_display_name, resolved_at, resolved_by_user_id, deleted_at, created_at, updated_at",
    )
    .eq("tenant_id", scope.tenantId)
    .eq("page_id", pageId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true });

  if (input.sectionId) {
    query = query.eq("section_id", input.sectionId);
  }
  if (input.includeResolved === false) {
    query = query.is("resolved_at", null);
  }

  const { data, error } = await query;
  if (error) {
    logServerError("section-comments/list", error);
    return { ok: false, error: error.message, code: "READ_FAILED" };
  }

  return {
    ok: true,
    pageId,
    comments: ((data ?? []) as CommentDbRow[]).map(rowToComment),
  };
}

// ── add ─────────────────────────────────────────────────────────────────

export interface AddCommentInput {
  locale?: string;
  sectionId: string;
  body: string;
  parentCommentId?: string;
}

export type AddCommentResult =
  | { ok: true; comment: CommentRow }
  | { ok: false; error: string; code?: string };

export async function addCommentAction(
  input: AddCommentInput,
): Promise<AddCommentResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error, code: "UNAUTHORIZED" };

  const scope = await requireTenantScope().catch(() => null);
  if (!scope) {
    return {
      ok: false,
      error: "Select an agency workspace to comment.",
      code: "NO_TENANT",
    };
  }

  const locale = asLocale(input.locale);
  if (!locale) return { ok: false, error: "Invalid locale.", code: "BAD_INPUT" };

  if (!input.sectionId) {
    return { ok: false, error: "Missing section.", code: "BAD_INPUT" };
  }

  const body = normalizeBody(input.body);
  if (!body) {
    return {
      ok: false,
      error: `Comment must be between ${MIN_BODY_LENGTH} and ${MAX_BODY_LENGTH} characters.`,
      code: "BAD_INPUT",
    };
  }

  const pageId = await resolveHomepagePageId(
    auth.supabase,
    scope.tenantId,
    locale,
  );
  if (!pageId) {
    return { ok: false, error: "Homepage row not found.", code: "NOT_FOUND" };
  }

  // If replying, verify the parent exists in the same tenant + page so a
  // forged parentId can't graft a reply onto another tenant's thread.
  if (input.parentCommentId) {
    const { data: parent, error: parentErr } = await auth.supabase
      .from("cms_section_comments")
      .select("id, parent_comment_id, page_id, tenant_id, deleted_at")
      .eq("id", input.parentCommentId)
      .eq("tenant_id", scope.tenantId)
      .eq("page_id", pageId)
      .is("deleted_at", null)
      .maybeSingle<{
        id: string;
        parent_comment_id: string | null;
        page_id: string;
        tenant_id: string;
        deleted_at: string | null;
      }>();
    if (parentErr) {
      logServerError("section-comments/add-load-parent", parentErr);
      return { ok: false, error: parentErr.message, code: "READ_FAILED" };
    }
    if (!parent) {
      return {
        ok: false,
        error: "Parent comment not found.",
        code: "NOT_FOUND",
      };
    }
    if (parent.parent_comment_id) {
      return {
        ok: false,
        error: "Replies are limited to one level deep.",
        code: "BAD_INPUT",
      };
    }
  }

  const { data: inserted, error: insertErr } = await auth.supabase
    .from("cms_section_comments")
    .insert({
      tenant_id: scope.tenantId,
      page_id: pageId,
      section_id: input.sectionId,
      parent_comment_id: input.parentCommentId ?? null,
      body,
      author_kind: "staff",
      author_user_id: auth.user.id,
      author_share_link_id: null,
      author_display_name: null,
    })
    .select(
      "id, page_id, section_id, parent_comment_id, body, author_kind, author_user_id, author_share_link_id, author_display_name, resolved_at, resolved_by_user_id, deleted_at, created_at, updated_at",
    )
    .single<CommentDbRow>();

  if (insertErr || !inserted) {
    logServerError("section-comments/add", insertErr);
    return {
      ok: false,
      error: insertErr?.message ?? "Failed to add comment.",
      code: "WRITE_FAILED",
    };
  }

  return { ok: true, comment: rowToComment(inserted) };
}

// ── edit ────────────────────────────────────────────────────────────────

export interface EditCommentInput {
  commentId: string;
  body: string;
}

export type EditCommentResult =
  | { ok: true; comment: CommentRow }
  | { ok: false; error: string; code?: string };

export async function editCommentAction(
  input: EditCommentInput,
): Promise<EditCommentResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error, code: "UNAUTHORIZED" };

  const scope = await requireTenantScope().catch(() => null);
  if (!scope) {
    return {
      ok: false,
      error: "Select an agency workspace.",
      code: "NO_TENANT",
    };
  }

  const body = normalizeBody(input.body);
  if (!body) {
    return {
      ok: false,
      error: `Comment must be between ${MIN_BODY_LENGTH} and ${MAX_BODY_LENGTH} characters.`,
      code: "BAD_INPUT",
    };
  }

  // Authorship rule: only the original author can edit. Staff can resolve
  // / delete, but they don't get to edit body text written by someone else.
  const { data: existing, error: loadErr } = await auth.supabase
    .from("cms_section_comments")
    .select("id, author_user_id, tenant_id, deleted_at")
    .eq("id", input.commentId)
    .eq("tenant_id", scope.tenantId)
    .is("deleted_at", null)
    .maybeSingle<{
      id: string;
      author_user_id: string | null;
      tenant_id: string;
      deleted_at: string | null;
    }>();
  if (loadErr) {
    logServerError("section-comments/edit-load", loadErr);
    return { ok: false, error: loadErr.message, code: "READ_FAILED" };
  }
  if (!existing) {
    return { ok: false, error: "Comment not found.", code: "NOT_FOUND" };
  }
  if (existing.author_user_id !== auth.user.id) {
    return {
      ok: false,
      error: "Only the author can edit this comment.",
      code: "FORBIDDEN",
    };
  }

  const { data: updated, error: updateErr } = await auth.supabase
    .from("cms_section_comments")
    .update({ body })
    .eq("id", input.commentId)
    .eq("tenant_id", scope.tenantId)
    .select(
      "id, page_id, section_id, parent_comment_id, body, author_kind, author_user_id, author_share_link_id, author_display_name, resolved_at, resolved_by_user_id, deleted_at, created_at, updated_at",
    )
    .single<CommentDbRow>();

  if (updateErr || !updated) {
    logServerError("section-comments/edit", updateErr);
    return {
      ok: false,
      error: updateErr?.message ?? "Failed to edit comment.",
      code: "WRITE_FAILED",
    };
  }

  return { ok: true, comment: rowToComment(updated) };
}

// ── resolve / unresolve ─────────────────────────────────────────────────

export interface ResolveCommentInput {
  commentId: string;
  /** When false, clears the resolved marker (re-opens the thread). */
  resolved?: boolean;
}

export type ResolveCommentResult =
  | { ok: true; comment: CommentRow }
  | { ok: false; error: string; code?: string };

export async function resolveCommentAction(
  input: ResolveCommentInput,
): Promise<ResolveCommentResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error, code: "UNAUTHORIZED" };

  const scope = await requireTenantScope().catch(() => null);
  if (!scope) {
    return {
      ok: false,
      error: "Select an agency workspace.",
      code: "NO_TENANT",
    };
  }

  const resolved = input.resolved !== false;
  const nowIso = new Date().toISOString();

  const { data: updated, error: updateErr } = await auth.supabase
    .from("cms_section_comments")
    .update({
      resolved_at: resolved ? nowIso : null,
      resolved_by_user_id: resolved ? auth.user.id : null,
    })
    .eq("id", input.commentId)
    .eq("tenant_id", scope.tenantId)
    .is("deleted_at", null)
    // Resolution lives on the top-level row only — don't let a UI bug
    // resolve a reply.
    .is("parent_comment_id", null)
    .select(
      "id, page_id, section_id, parent_comment_id, body, author_kind, author_user_id, author_share_link_id, author_display_name, resolved_at, resolved_by_user_id, deleted_at, created_at, updated_at",
    )
    .maybeSingle<CommentDbRow>();

  if (updateErr) {
    logServerError("section-comments/resolve", updateErr);
    return {
      ok: false,
      error: updateErr.message,
      code: "WRITE_FAILED",
    };
  }
  if (!updated) {
    return { ok: false, error: "Top-level comment not found.", code: "NOT_FOUND" };
  }

  return { ok: true, comment: rowToComment(updated) };
}

// ── delete (soft) ───────────────────────────────────────────────────────

export interface DeleteCommentInput {
  commentId: string;
}

export type DeleteCommentResult =
  | { ok: true; commentId: string }
  | { ok: false; error: string; code?: string };

/**
 * Soft-deletes a comment. Author can delete their own; staff can delete
 * anyone's (moderation). Replies don't lose their parent visually — the
 * client renders deleted parents as "Comment removed" placeholders.
 */
export async function deleteCommentAction(
  input: DeleteCommentInput,
): Promise<DeleteCommentResult> {
  const auth = await requireStaff();
  if (!auth.ok) return { ok: false, error: auth.error, code: "UNAUTHORIZED" };

  const scope = await requireTenantScope().catch(() => null);
  if (!scope) {
    return {
      ok: false,
      error: "Select an agency workspace.",
      code: "NO_TENANT",
    };
  }

  const { error: updateErr, data } = await auth.supabase
    .from("cms_section_comments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", input.commentId)
    .eq("tenant_id", scope.tenantId)
    .is("deleted_at", null)
    .select("id")
    .maybeSingle<{ id: string }>();

  if (updateErr) {
    logServerError("section-comments/delete", updateErr);
    return { ok: false, error: updateErr.message, code: "WRITE_FAILED" };
  }
  if (!data) {
    return { ok: false, error: "Comment not found.", code: "NOT_FOUND" };
  }

  return { ok: true, commentId: data.id };
}
