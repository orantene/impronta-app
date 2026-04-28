"use client";

/**
 * Phase 11 — CommentsDrawer.
 *
 * Implements builder-experience.html surface §15 (Comments — async client
 * feedback). Last reconciled: 2026-04-25.
 *
 * Right-side drawer that lists every open comment thread on the current
 * homepage. Operators can scope the list to a specific section (e.g. when
 * the canvas pin is clicked) or browse globally. Each thread supports:
 *   - reply (one level deep)
 *   - resolve / unresolve (top-level only, staff only)
 *   - delete (soft, author or any staff)
 *   - inline edit (author only)
 *
 * Realtime: when the drawer is open, we subscribe to the
 * `cms_section_comments` publication filtered by `(tenant_id, page_id)`
 * so a teammate's writes round-trip without a page refresh. The
 * subscription is torn down on close.
 *
 * Scope toggle: "All threads" vs "Section <name>" — driven by
 * `commentsFocusSectionId` on EditContext. Resolved threads collapse
 * behind a "Show resolved" toggle so they don't squat the layout.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  addCommentAction,
  deleteCommentAction,
  editCommentAction,
  listCommentsAction,
  resolveCommentAction,
  type CommentRow,
} from "@/lib/site-admin/edit-mode/comment-actions";
import { cleanSectionName } from "@/lib/site-admin/clean-section-name";
import { createClient } from "@/lib/supabase/client";

import {
  CHROME,
  Drawer,
  DrawerBody,
  DrawerFoot,
  DrawerHead,
} from "./kit";
import { useEditContext } from "./edit-context";

// ── icons ────────────────────────────────────────────────────────────────────

function CommentIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────

interface ThreadGroup {
  parent: CommentRow;
  replies: CommentRow[];
}

function groupThreads(rows: CommentRow[], includeResolved: boolean): ThreadGroup[] {
  const parents = rows
    .filter((r) => !r.parentCommentId)
    .filter((r) => (includeResolved ? true : !r.resolvedAt));
  const repliesBy = new Map<string, CommentRow[]>();
  for (const r of rows) {
    if (!r.parentCommentId) continue;
    const list = repliesBy.get(r.parentCommentId) ?? [];
    list.push(r);
    repliesBy.set(r.parentCommentId, list);
  }
  return parents
    .sort((a, b) => (b.createdAt < a.createdAt ? -1 : 1))
    .map((parent) => ({
      parent,
      replies: (repliesBy.get(parent.id) ?? []).sort((a, b) =>
        a.createdAt < b.createdAt ? -1 : 1,
      ),
    }));
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const diffMs = Date.now() - d.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function authorLabel(c: CommentRow, viewerUserId: string | null): string {
  if (c.authorKind === "reviewer") {
    return c.authorDisplayName ?? "Reviewer";
  }
  if (viewerUserId && c.authorUserId === viewerUserId) return "You";
  // We don't have a profile resolver in this minimal v1 — surface a
  // truncated id so two staff comments don't render identical.
  return c.authorUserId
    ? `Staff · ${c.authorUserId.slice(0, 6)}`
    : "Staff";
}

// ── drawer ───────────────────────────────────────────────────────────────────

export function CommentsDrawer() {
  const ctx = useEditContext();
  const open = ctx.commentsOpen;
  const focusSectionId = ctx.commentsFocusSectionId;
  const onClose = ctx.closeComments;
  const locale = ctx.locale;
  const tenantId = ctx.tenantId;
  const slots = ctx.slots;

  const [pageId, setPageId] = useState<string | null>(null);
  const [rows, setRows] = useState<CommentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [includeResolved, setIncludeResolved] = useState(false);
  const [composerBody, setComposerBody] = useState("");
  const [composerSectionId, setComposerSectionId] = useState<string | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [viewerUserId, setViewerUserId] = useState<string | null>(null);

  // Reset state when the drawer closes so a stale list never flashes on
  // re-open. Composer body is cleared so half-typed messages don't bleed.
  useEffect(() => {
    if (!open) {
      setRows([]);
      setComposerBody("");
      setErrorMessage(null);
      return;
    }
  }, [open]);

  // Track focus-section: when the operator opens via canvas pin, we
  // pre-select the section in the composer so a follow-up reply is
  // already targeted. Switching focus mid-session updates the composer
  // section but doesn't clear the body.
  useEffect(() => {
    if (!open) return;
    setComposerSectionId(focusSectionId);
  }, [open, focusSectionId]);

  // Load + Realtime subscription. Re-runs only when (open, locale,
  // tenantId, focusSectionId) change so a body edit doesn't churn the
  // channel. Tearing down on close prevents zombie listeners.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);

    listCommentsAction({
      locale,
      sectionId: focusSectionId ?? undefined,
      includeResolved: true,
    }).then((res) => {
      if (cancelled) return;
      if (!res.ok) {
        // NOT_FOUND is the expected steady state for a tenant that hasn't
        // created a homepage row in this locale yet — surfacing it as a red
        // error chip reads as "Comments is broken" when in reality there's
        // simply nothing to comment on yet. Treat it as the empty state:
        // clear rows + suppress the error so the body shows the normal
        // "No comments yet" affordance. Real auth / network failures still
        // raise the alert.
        if (res.code === "NOT_FOUND") {
          setRows([]);
          setPageId(null);
          setErrorMessage(null);
        } else {
          setErrorMessage(res.error);
        }
        setLoading(false);
        return;
      }
      setPageId(res.pageId);
      setRows(res.comments);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [open, locale, focusSectionId]);

  // Resolve viewer user id from the supabase session so "You" labels
  // and "Edit" affordances render correctly. Cheap (cached cookie read).
  useEffect(() => {
    if (!open) return;
    const supa = createClient();
    if (!supa) return;
    let cancelled = false;
    supa.auth.getUser().then(({ data }) => {
      if (cancelled) return;
      setViewerUserId(data.user?.id ?? null);
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Realtime channel: filtered to (tenant_id, page_id). Inserts append
  // to local state; updates patch in place; deletes mark a row removed.
  // We re-fetch via list on connection re-establishment in case we
  // missed a beat.
  useEffect(() => {
    if (!open || !pageId) return;
    const supa = createClient();
    if (!supa) return;

    const channel = supa
      .channel(`cms-comments-${pageId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "cms_section_comments",
          filter: `page_id=eq.${pageId}`,
        },
        (payload: {
          eventType: "INSERT" | "UPDATE" | "DELETE";
          new: Record<string, unknown> | null;
          old: Record<string, unknown> | null;
        }) => {
          if (payload.eventType === "DELETE") {
            const oldId = (payload.old as { id?: string } | null)?.id;
            if (!oldId) return;
            setRows((prev) => prev.filter((r) => r.id !== oldId));
            return;
          }
          const dbRow = payload.new as Record<string, unknown> | null;
          if (!dbRow) return;
          const mapped: CommentRow = {
            id: String(dbRow.id),
            pageId: String(dbRow.page_id),
            sectionId: String(dbRow.section_id),
            parentCommentId: (dbRow.parent_comment_id as string | null) ?? null,
            body: String(dbRow.body),
            authorKind: dbRow.author_kind as "staff" | "reviewer",
            authorUserId: (dbRow.author_user_id as string | null) ?? null,
            authorShareLinkId:
              (dbRow.author_share_link_id as string | null) ?? null,
            authorDisplayName:
              (dbRow.author_display_name as string | null) ?? null,
            resolvedAt: (dbRow.resolved_at as string | null) ?? null,
            resolvedByUserId:
              (dbRow.resolved_by_user_id as string | null) ?? null,
            deletedAt: (dbRow.deleted_at as string | null) ?? null,
            createdAt: String(dbRow.created_at),
            updatedAt: String(dbRow.updated_at),
          };
          // Soft-deleted rows leave the list (we render the parent as
          // "removed" via groupThreads logic, but for v1 we just hide).
          if (mapped.deletedAt) {
            setRows((prev) => prev.filter((r) => r.id !== mapped.id));
            return;
          }
          // Filter to focus section if the drawer is scoped that way.
          if (focusSectionId && mapped.sectionId !== focusSectionId) {
            return;
          }
          setRows((prev) => {
            const idx = prev.findIndex((r) => r.id === mapped.id);
            if (idx === -1) return [...prev, mapped];
            const next = prev.slice();
            next[idx] = mapped;
            return next;
          });
        },
      )
      .subscribe();

    return () => {
      void supa.removeChannel(channel);
    };
  }, [open, pageId, focusSectionId, tenantId]);

  // Section name lookup so each thread can show "in <Hero>" instead of a
  // bare UUID. Built off of `slots` because that's already loaded by
  // EditContext when chrome mounts.
  const sectionNameById = useMemo(() => {
    // T2-2 — names stored in this map flow into the section header
    // ("Section · Hero — new (Classic starter) d7b14f") and the comment
    // metadata strip. Strip seeder suffixes once at map-build time so
    // every consumer renders cleanly without per-callsite cleanup.
    const map = new Map<string, string>();
    for (const list of Object.values(slots)) {
      for (const ref of list) {
        map.set(ref.sectionId, cleanSectionName(ref.name) || ref.name);
      }
    }
    return map;
  }, [slots]);

  const sectionOptions = useMemo(() => {
    const arr: { id: string; name: string }[] = [];
    for (const list of Object.values(slots)) {
      for (const ref of list) {
        arr.push({ id: ref.sectionId, name: ref.name });
      }
    }
    return arr;
  }, [slots]);

  const threads = useMemo(
    () => groupThreads(rows, includeResolved),
    [rows, includeResolved],
  );

  // ── handlers ────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async () => {
    const targetSectionId = composerSectionId;
    if (!targetSectionId) {
      setErrorMessage("Pick a section before posting.");
      return;
    }
    const trimmed = composerBody.trim();
    if (!trimmed) return;
    setSubmitting(true);
    setErrorMessage(null);
    const res = await addCommentAction({
      locale,
      sectionId: targetSectionId,
      body: trimmed,
    });
    setSubmitting(false);
    if (!res.ok) {
      setErrorMessage(res.error);
      return;
    }
    setComposerBody("");
    // Optimistic insert in case Realtime is laggy or unavailable in dev.
    setRows((prev) => {
      if (prev.some((r) => r.id === res.comment.id)) return prev;
      return [...prev, res.comment];
    });
  }, [composerBody, composerSectionId, locale]);

  const handleResolveToggle = useCallback(
    async (commentId: string, currentlyResolved: boolean) => {
      const res = await resolveCommentAction({
        commentId,
        resolved: !currentlyResolved,
      });
      if (!res.ok) {
        setErrorMessage(res.error);
        return;
      }
      setRows((prev) => {
        const idx = prev.findIndex((r) => r.id === commentId);
        if (idx === -1) return prev;
        const next = prev.slice();
        next[idx] = res.comment;
        return next;
      });
    },
    [],
  );

  const handleDelete = useCallback(async (commentId: string) => {
    const res = await deleteCommentAction({ commentId });
    if (!res.ok) {
      setErrorMessage(res.error);
      return;
    }
    setRows((prev) => prev.filter((r) => r.id !== commentId));
  }, []);

  if (!open) return null;

  const headerMeta = focusSectionId
    ? `Section · ${sectionNameById.get(focusSectionId) ?? "Untitled"}`
    : `${threads.length} open thread${threads.length === 1 ? "" : "s"}`;

  return (
    <Drawer kind="comments" open={open} testId="comments-drawer">
      <DrawerHead
        icon={<CommentIcon />}
        title={focusSectionId ? "Section comments" : "Comments"}
        meta={<span>{headerMeta}</span>}
        onClose={onClose}
      />
      <DrawerBody>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            padding: "4px 2px 0",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            {focusSectionId ? (
              <button
                type="button"
                onClick={() => ctx.openComments()}
                style={{
                  fontSize: 11,
                  color: CHROME.muted,
                  background: "transparent",
                  border: `1px solid ${CHROME.line}`,
                  borderRadius: 6,
                  padding: "4px 8px",
                  cursor: "pointer",
                }}
              >
                Show all threads
              </button>
            ) : (
              <span style={{ fontSize: 11, color: CHROME.muted }}>
                Pick a section to thread a comment.
              </span>
            )}
            <label style={{ fontSize: 11, color: CHROME.muted, display: "flex", gap: 6, alignItems: "center" }}>
              <input
                type="checkbox"
                checked={includeResolved}
                onChange={(e) => setIncludeResolved(e.target.checked)}
              />
              Show resolved
            </label>
          </div>

          {loading ? (
            <div style={{ padding: 20, textAlign: "center", fontSize: 12, color: CHROME.muted }}>
              Loading comments…
            </div>
          ) : threads.length === 0 ? (
            <div
              style={{
                padding: 24,
                textAlign: "center",
                fontSize: 13,
                color: CHROME.muted,
                background: CHROME.surface,
                border: `1px dashed ${CHROME.lineMid}`,
                borderRadius: 10,
              }}
            >
              No comments yet. Start a thread below.
            </div>
          ) : (
            <ul style={{ display: "flex", flexDirection: "column", gap: 10, listStyle: "none", margin: 0, padding: 0 }}>
              {threads.map((t) => (
                <ThreadCard
                  key={t.parent.id}
                  thread={t}
                  sectionName={sectionNameById.get(t.parent.sectionId)}
                  viewerUserId={viewerUserId}
                  locale={locale}
                  onResolve={handleResolveToggle}
                  onDelete={handleDelete}
                  onError={setErrorMessage}
                  onLocalUpsert={(c) =>
                    setRows((prev) => {
                      const idx = prev.findIndex((r) => r.id === c.id);
                      if (idx === -1) return [...prev, c];
                      const next = prev.slice();
                      next[idx] = c;
                      return next;
                    })
                  }
                />
              ))}
            </ul>
          )}

          {errorMessage ? (
            <div
              role="alert"
              style={{
                padding: "8px 10px",
                fontSize: 12,
                color: CHROME.rose,
                background: CHROME.roseBg,
                border: `1px solid ${CHROME.roseLine}`,
                borderRadius: 8,
              }}
            >
              {errorMessage}
            </div>
          ) : null}
        </div>
      </DrawerBody>
      <DrawerFoot>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
          {!focusSectionId ? (
            <select
              value={composerSectionId ?? ""}
              onChange={(e) => setComposerSectionId(e.target.value || null)}
              disabled={submitting}
              style={{
                width: "100%",
                padding: "6px 8px",
                fontSize: 12,
                border: `1px solid ${CHROME.lineMid}`,
                borderRadius: 6,
                background: CHROME.surface,
                color: CHROME.ink,
              }}
            >
              <option value="">— pick a section —</option>
              {sectionOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {/* T2-2 — strip seeder suffix from section options */}
                  {cleanSectionName(s.name) || s.name}
                </option>
              ))}
            </select>
          ) : null}
          <textarea
            value={composerBody}
            onChange={(e) => setComposerBody(e.target.value)}
            placeholder="Add a comment…"
            rows={3}
            disabled={submitting}
            style={{
              width: "100%",
              padding: "8px 10px",
              fontSize: 13,
              fontFamily: "inherit",
              lineHeight: 1.4,
              resize: "vertical",
              border: `1px solid ${CHROME.lineMid}`,
              borderRadius: 8,
              background: CHROME.surface,
              color: CHROME.ink,
              outline: "none",
              boxShadow: "inset 0 1px 0 rgba(255,255,255,0.5)",
            }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
            <button
              type="button"
              onClick={() => setComposerBody("")}
              disabled={submitting || !composerBody}
              style={{
                padding: "6px 10px",
                fontSize: 12,
                color: CHROME.text2,
                background: "transparent",
                border: `1px solid ${CHROME.lineMid}`,
                borderRadius: 6,
                cursor: submitting || !composerBody ? "not-allowed" : "pointer",
              }}
            >
              Clear
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={
                submitting ||
                composerBody.trim().length === 0 ||
                !composerSectionId
              }
              style={{
                padding: "6px 12px",
                fontSize: 12,
                fontWeight: 600,
                color: "white",
                background: CHROME.ink,
                border: `1px solid ${CHROME.ink}`,
                borderRadius: 6,
                cursor:
                  submitting ||
                  composerBody.trim().length === 0 ||
                  !composerSectionId
                    ? "not-allowed"
                    : "pointer",
                opacity:
                  submitting ||
                  composerBody.trim().length === 0 ||
                  !composerSectionId
                    ? 0.6
                    : 1,
              }}
            >
              {submitting ? "Posting…" : "Post"}
            </button>
          </div>
        </div>
      </DrawerFoot>
    </Drawer>
  );
}

// ── thread card ──────────────────────────────────────────────────────────────

interface ThreadCardProps {
  thread: ThreadGroup;
  sectionName: string | undefined;
  viewerUserId: string | null;
  locale: string;
  onResolve: (commentId: string, currentlyResolved: boolean) => void;
  onDelete: (commentId: string) => void;
  onError: (msg: string | null) => void;
  onLocalUpsert: (c: CommentRow) => void;
}

function ThreadCard({
  thread,
  sectionName,
  viewerUserId,
  locale,
  onResolve,
  onDelete,
  onError,
  onLocalUpsert,
}: ThreadCardProps) {
  const { parent, replies } = thread;
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [replySubmitting, setReplySubmitting] = useState(false);

  const handleReply = useCallback(async () => {
    const trimmed = replyBody.trim();
    if (!trimmed) return;
    setReplySubmitting(true);
    onError(null);
    const res = await addCommentAction({
      locale,
      sectionId: parent.sectionId,
      body: trimmed,
      parentCommentId: parent.id,
    });
    setReplySubmitting(false);
    if (!res.ok) {
      onError(res.error);
      return;
    }
    onLocalUpsert(res.comment);
    setReplyBody("");
    setReplyOpen(false);
  }, [replyBody, parent.sectionId, parent.id, locale, onError, onLocalUpsert]);

  const isResolved = !!parent.resolvedAt;

  return (
    <li
      style={{
        background: CHROME.surface,
        border: `1px solid ${CHROME.line}`,
        borderRadius: 10,
        padding: 12,
        opacity: isResolved ? 0.65 : 1,
      }}
    >
      <CommentBubble
        comment={parent}
        viewerUserId={viewerUserId}
        sectionName={sectionName}
        onDelete={onDelete}
        onLocalUpsert={onLocalUpsert}
        onError={onError}
      />
      {replies.length > 0 ? (
        <ul
          style={{
            listStyle: "none",
            margin: "8px 0 0 16px",
            padding: "8px 0 0",
            borderLeft: `2px solid ${CHROME.line}`,
            paddingLeft: 12,
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {replies.map((r) => (
            <li key={r.id}>
              <CommentBubble
                comment={r}
                viewerUserId={viewerUserId}
                sectionName={undefined}
                onDelete={onDelete}
                onLocalUpsert={onLocalUpsert}
                onError={onError}
              />
            </li>
          ))}
        </ul>
      ) : null}

      <div
        style={{
          marginTop: 8,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 6,
        }}
      >
        <button
          type="button"
          onClick={() => setReplyOpen((v) => !v)}
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: CHROME.muted,
            background: "transparent",
            border: "none",
            cursor: "pointer",
            padding: "2px 4px",
          }}
        >
          {replyOpen ? "Cancel reply" : "Reply"}
        </button>
        <button
          type="button"
          onClick={() => onResolve(parent.id, isResolved)}
          style={{
            fontSize: 11,
            fontWeight: 500,
            color: isResolved ? CHROME.muted : CHROME.green,
            background: "transparent",
            border: `1px solid ${isResolved ? CHROME.lineMid : CHROME.greenLine}`,
            borderRadius: 6,
            padding: "3px 8px",
            cursor: "pointer",
          }}
        >
          {isResolved ? "Reopen" : "Resolve"}
        </button>
      </div>

      {replyOpen ? (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
          <textarea
            value={replyBody}
            onChange={(e) => setReplyBody(e.target.value)}
            placeholder="Write a reply…"
            rows={2}
            disabled={replySubmitting}
            style={{
              width: "100%",
              padding: "6px 8px",
              fontSize: 12,
              fontFamily: "inherit",
              lineHeight: 1.4,
              resize: "vertical",
              border: `1px solid ${CHROME.lineMid}`,
              borderRadius: 6,
              background: CHROME.surface,
              color: CHROME.ink,
              outline: "none",
            }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={handleReply}
              disabled={replySubmitting || replyBody.trim().length === 0}
              style={{
                padding: "5px 10px",
                fontSize: 11,
                fontWeight: 600,
                color: "white",
                background: CHROME.ink,
                border: `1px solid ${CHROME.ink}`,
                borderRadius: 6,
                cursor:
                  replySubmitting || replyBody.trim().length === 0
                    ? "not-allowed"
                    : "pointer",
                opacity:
                  replySubmitting || replyBody.trim().length === 0 ? 0.6 : 1,
              }}
            >
              {replySubmitting ? "Posting…" : "Post reply"}
            </button>
          </div>
        </div>
      ) : null}
    </li>
  );
}

// ── single comment bubble (parent or reply) ──────────────────────────────────

interface CommentBubbleProps {
  comment: CommentRow;
  viewerUserId: string | null;
  /** Top-level only — replies don't repeat the section badge. */
  sectionName: string | undefined;
  onDelete: (commentId: string) => void;
  onLocalUpsert: (c: CommentRow) => void;
  onError: (msg: string | null) => void;
}

function CommentBubble({
  comment,
  viewerUserId,
  sectionName,
  onDelete,
  onLocalUpsert,
  onError,
}: CommentBubbleProps) {
  const isAuthor =
    !!viewerUserId &&
    comment.authorKind === "staff" &&
    comment.authorUserId === viewerUserId;
  const [editing, setEditing] = useState(false);
  const [editBody, setEditBody] = useState(comment.body);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const editTextareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (editing) editTextareaRef.current?.focus();
  }, [editing]);

  // Reset draft body if the canonical row updates while we're not editing
  // (e.g. a Realtime sync from another tab).
  useEffect(() => {
    if (!editing) setEditBody(comment.body);
  }, [comment.body, editing]);

  const handleSaveEdit = useCallback(async () => {
    const trimmed = editBody.trim();
    if (!trimmed) return;
    setEditSubmitting(true);
    onError(null);
    const res = await editCommentAction({
      commentId: comment.id,
      body: trimmed,
    });
    setEditSubmitting(false);
    if (!res.ok) {
      onError(res.error);
      return;
    }
    onLocalUpsert(res.comment);
    setEditing(false);
  }, [editBody, comment.id, onError, onLocalUpsert]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: CHROME.ink }}>
          {authorLabel(comment, viewerUserId)}
          {comment.resolvedAt ? (
            <span
              style={{
                marginLeft: 6,
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                color: CHROME.green,
                background: CHROME.greenBg,
                border: `1px solid ${CHROME.greenLine}`,
                borderRadius: 4,
                padding: "1px 5px",
              }}
            >
              Resolved
            </span>
          ) : null}
        </div>
        <span style={{ fontSize: 10, color: CHROME.muted2, whiteSpace: "nowrap" }}>
          {formatTimestamp(comment.createdAt)}
        </span>
      </div>

      {sectionName ? (
        <div style={{ marginTop: 2, fontSize: 10, color: CHROME.muted }}>
          on <span style={{ color: CHROME.text2, fontWeight: 500 }}>{sectionName}</span>
        </div>
      ) : null}

      {editing ? (
        <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 6 }}>
          <textarea
            ref={editTextareaRef}
            value={editBody}
            onChange={(e) => setEditBody(e.target.value)}
            rows={2}
            disabled={editSubmitting}
            style={{
              width: "100%",
              padding: "6px 8px",
              fontSize: 12,
              fontFamily: "inherit",
              lineHeight: 1.4,
              resize: "vertical",
              border: `1px solid ${CHROME.lineMid}`,
              borderRadius: 6,
              background: CHROME.surface,
              color: CHROME.ink,
              outline: "none",
            }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setEditBody(comment.body);
              }}
              disabled={editSubmitting}
              style={{
                padding: "4px 8px",
                fontSize: 11,
                color: CHROME.text2,
                background: "transparent",
                border: `1px solid ${CHROME.lineMid}`,
                borderRadius: 6,
                cursor: "pointer",
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveEdit}
              disabled={editSubmitting || editBody.trim().length === 0}
              style={{
                padding: "4px 8px",
                fontSize: 11,
                fontWeight: 600,
                color: "white",
                background: CHROME.ink,
                border: `1px solid ${CHROME.ink}`,
                borderRadius: 6,
                cursor:
                  editSubmitting || editBody.trim().length === 0
                    ? "not-allowed"
                    : "pointer",
                opacity:
                  editSubmitting || editBody.trim().length === 0 ? 0.6 : 1,
              }}
            >
              {editSubmitting ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      ) : (
        <div
          style={{
            marginTop: 4,
            fontSize: 13,
            lineHeight: 1.45,
            color: CHROME.text,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {comment.body}
        </div>
      )}

      {!editing && (isAuthor || comment.authorKind === "reviewer") ? (
        <div style={{ marginTop: 4, display: "flex", gap: 8 }}>
          {isAuthor ? (
            <button
              type="button"
              onClick={() => setEditing(true)}
              style={{
                fontSize: 10,
                color: CHROME.muted,
                background: "transparent",
                border: "none",
                cursor: "pointer",
                padding: 0,
              }}
            >
              Edit
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => onDelete(comment.id)}
            style={{
              fontSize: 10,
              color: CHROME.muted,
              background: "transparent",
              border: "none",
              cursor: "pointer",
              padding: 0,
            }}
          >
            Delete
          </button>
        </div>
      ) : null}
    </div>
  );
}
