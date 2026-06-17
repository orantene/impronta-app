"use client";

/**
 * AllPagesPanel — compact floating page manager launched from CommandDock.
 *
 * ONB-4: adds styled inline rename (title + live slug preview) and inline
 * delete confirm, replacing any imperative window.prompt / window.confirm call
 * on this surface. All four builder surfaces inherit via the shared chrome.
 *
 * Reuses the same server actions as the topbar PagePicker dropdown without
 * duplicating page data stores.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  createDraftPageAction,
  duplicatePageAction,
  listPagesForPickerAction,
  quickDeletePageAction,
  quickRenamePageAction,
  type PagePickerAvailability,
  type PagePickerItem,
} from "@/lib/server-actions/admin-site-pages";
import { useDirty } from "./dirty-bridge";
import { useEditContext } from "./edit-context";
import { DockFloatingPanel } from "./dock-floating-panel";
import { flushThenNavigate } from "./page-switch-flush";
import { CHROME } from "./kit";

interface AllPagesPanelProps {
  open: boolean;
  onClose: () => void;
}

/**
 * ONB-4 — pure client-side slug preview: mirrors slugifyPageName on the server
 * (lowercase, hyphens, trim) so the operator sees the derived slug as they type.
 * No network call needed; the server validates on save.
 */
function slugifyTitle(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 240);
}

// ── Inline rename form ────────────────────────────────────────────────────────

interface InlineRenameProps {
  page: PagePickerItem;
  onDone: () => void;
  onError: (msg: string) => void;
}

function InlineRenameForm({ page, onDone, onError }: InlineRenameProps) {
  const [title, setTitle] = useState(page.title);
  const [slugDraft, setSlugDraft] = useState(page.slug);
  const [slugEdited, setSlugEdited] = useState(false);
  const [saving, setSaving] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);

  // Auto-focus on mount
  useEffect(() => {
    titleRef.current?.focus();
    titleRef.current?.select();
  }, []);

  // Derive slug from title unless the user has manually edited the slug field.
  const derivedSlug = slugEdited ? slugDraft : (page.slug === "" ? "" : slugifyTitle(title));

  async function handleSave() {
    const t = title.trim();
    const s = derivedSlug.trim();
    if (!t) { onError("Title is required."); return; }
    // Homepage slug is always "" and not editable.
    if (page.slug === "") {
      setSaving(true);
      try {
        const res = await quickRenamePageAction({ id: page.id, title: t, slug: "" });
        if (res.ok) { onDone(); } else { onError(res.error); }
      } finally { setSaving(false); }
      return;
    }
    if (!s) { onError("Slug is required."); return; }
    setSaving(true);
    try {
      const res = await quickRenamePageAction({ id: page.id, title: t, slug: s });
      if (res.ok) { onDone(); } else { onError(res.error); }
    } finally { setSaving(false); }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") { void handleSave(); }
    if (e.key === "Escape") { onDone(); }
  }

  const isHome = page.slug === "";

  return (
    <div
      className="rounded-[10px] border px-[10px] py-[9px]"
      style={{ borderColor: CHROME.accent, background: CHROME.paper }}
    >
      <input
        ref={titleRef}
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={saving}
        placeholder="Page title"
        className="mb-[6px] w-full rounded-[6px] border px-[8px] py-[6px] text-[13px] font-medium focus:outline-none focus-visible:ring-2 focus-visible:ring-[#7c3aed]/35"
        style={{ borderColor: CHROME.line, background: CHROME.surface, color: CHROME.ink }}
      />
      {!isHome ? (
        <div className="mb-[6px]">
          <div
            className="mb-[2px] flex items-center gap-[4px] rounded-[6px] border px-[8px] py-[5px] text-[11px]"
            style={{ borderColor: CHROME.line, background: CHROME.surface, color: CHROME.ink2 }}
          >
            <span style={{ color: CHROME.muted }}>slug:</span>
            <input
              type="text"
              value={derivedSlug}
              onChange={(e) => { setSlugDraft(e.target.value); setSlugEdited(true); }}
              onKeyDown={handleKeyDown}
              disabled={saving}
              placeholder="page-slug"
              className="min-w-0 flex-1 border-none bg-transparent text-[11px] focus:outline-none"
              style={{ color: CHROME.ink }}
            />
          </div>
          <p className="truncate px-[2px] text-[10px]" style={{ color: CHROME.muted }}>
            Preview: /{derivedSlug || "…"}
          </p>
        </div>
      ) : null}
      <div className="flex items-center gap-[6px]">
        <button
          type="button"
          disabled={saving}
          onClick={() => void handleSave()}
          className="rounded-[6px] px-[10px] py-[5px] text-[11px] font-semibold transition-colors disabled:opacity-50"
          style={{ background: CHROME.accent, color: "#fff" }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          disabled={saving}
          onClick={onDone}
          className="rounded-[6px] px-[8px] py-[5px] text-[11px] transition-colors"
          style={{ color: CHROME.muted }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Inline delete confirm ─────────────────────────────────────────────────────

interface InlineDeleteProps {
  page: PagePickerItem;
  onDone: () => void;
  onError: (msg: string) => void;
}

function InlineDeleteConfirm({ page, onDone, onError }: InlineDeleteProps) {
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    try {
      const res = await quickDeletePageAction({ id: page.id });
      if (res.ok) { onDone(); } else { onError(res.error); }
    } finally { setDeleting(false); }
  }

  return (
    <div
      className="rounded-[10px] border px-[10px] py-[9px]"
      style={{ borderColor: CHROME.rose, background: "rgba(190,18,60,0.04)" }}
    >
      <p className="mb-[8px] text-[12px]" style={{ color: CHROME.ink }}>
        Delete <strong>{page.title}</strong>? This can&rsquo;t be undone.
      </p>
      <div className="flex items-center gap-[6px]">
        <button
          type="button"
          disabled={deleting}
          onClick={() => void handleDelete()}
          className="rounded-[6px] px-[10px] py-[5px] text-[11px] font-semibold transition-colors disabled:opacity-50"
          style={{ background: CHROME.rose, color: "#fff" }}
        >
          {deleting ? "Deleting…" : "Delete page"}
        </button>
        <button
          type="button"
          disabled={deleting}
          onClick={onDone}
          className="rounded-[6px] px-[8px] py-[5px] text-[11px] transition-colors"
          style={{ color: CHROME.muted }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export function AllPagesPanel({ open, onClose }: AllPagesPanelProps) {
  const router = useRouter();
  const dirty = useDirty();
  const { pageId, pageSlug, openRevisions, flushBuilderTreeSave } =
    useEditContext();
  const [pages, setPages] = useState<PagePickerItem[] | null>(null);
  const [availability, setAvailability] = useState<PagePickerAvailability | null>(null);
  const [loading, setLoading] = useState(false);
  const [fetchErr, setFetchErr] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [navigating, setNavigating] = useState(false);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [moreOpenId, setMoreOpenId] = useState<string | null>(null);
  // ONB-4 — inline editing state: one page at a time can be in rename or delete mode.
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const workspaceWebsiteHref = "/admin/website/pages";

  const loadPages = useCallback(() => {
    setLoading(true);
    setFetchErr(null);
    void listPagesForPickerAction()
      .then((result) => {
        if (result.ok) {
          setPages(result.pages);
          setAvailability(result.availability);
        } else {
          setFetchErr(result.error);
          setPages([]);
        }
      })
      .catch(() => {
        setFetchErr("Couldn't load pages — try again.");
        setPages([]);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!open) {
      setPages(null);
      setMoreOpenId(null);
      setRenamingId(null);
      setDeletingId(null);
      return;
    }
    loadPages();
  }, [open, loadPages]);

  // CANVAS-2 — silent autosave flush on page switch (no blocking confirm()).
  // The shared flushThenNavigate awaits the EditProvider flush when dirty so the
  // debounced draft commits before the route change (a fire-and-forget save
  // would race the navigation and trip VERSION_CONFLICT). The `navigating` guard
  // disables the nav controls so the operator can't double-trigger mid-flush.
  async function navToPage(slug: string) {
    if (navigating) return;
    setNavigating(true);
    try {
      await flushThenNavigate({
        dirty,
        flush: flushBuilderTreeSave,
        navigate: () => {
          onClose();
          router.push(slug === "" ? "/?edit=1" : `/${slug}?edit=1`);
        },
      });
    } finally {
      setNavigating(false);
    }
  }

  async function handleCreatePage() {
    if (availability && !availability.canCreatePages) {
      setFetchErr(
        availability.createPageHint ?? "Upgrade your plan to create additional pages.",
      );
      return;
    }
    setCreating(true);
    setFetchErr(null);
    try {
      const result = await createDraftPageAction();
      if (result.ok) {
        // Flush the current page's draft before navigating to the new page so
        // un-persisted edits aren't lost when the route changes (see navToPage).
        await flushThenNavigate({
          dirty,
          flush: flushBuilderTreeSave,
          navigate: () => {
            onClose();
            router.push(result.slug ? `/${result.slug}?edit=1` : "/?edit=1");
          },
        });
      } else {
        setFetchErr(result.error);
      }
    } finally {
      setCreating(false);
    }
  }

  async function handleDuplicate(sourceId: string) {
    if (availability && !availability.canCreatePages) {
      setFetchErr(
        availability.createPageHint ?? "Upgrade your plan to create additional pages.",
      );
      return;
    }
    setDuplicatingId(sourceId);
    try {
      const result = await duplicatePageAction(sourceId);
      if (result.ok) {
        onClose();
        router.push(
          result.slug === ""
            ? "/?edit=1&panel=pageSettings"
            : `/${result.slug}?edit=1&panel=pageSettings`,
        );
      } else {
        setFetchErr(result.error);
        loadPages();
      }
    } finally {
      setDuplicatingId(null);
    }
  }

  // ONB-4 — after a rename or delete completes, reload the list to reflect changes.
  function handleInlineDone() {
    setRenamingId(null);
    setDeletingId(null);
    setMoreOpenId(null);
    loadPages();
  }

  function handleInlineError(msg: string) {
    setFetchErr(msg);
    setRenamingId(null);
    setDeletingId(null);
  }

  return (
    <DockFloatingPanel
      panelId="all-pages"
      title="All pages"
      open={open}
      onClose={onClose}
      width={320}
      testId="all-pages-panel"
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-[10px] py-[10px]">
        <button
          type="button"
          disabled={creating || (availability != null && !availability.canCreatePages)}
          onClick={() => void handleCreatePage()}
          className="mb-[8px] flex w-full cursor-pointer items-center gap-[8px] rounded-[10px] border-none px-[10px] py-[9px] text-left transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          style={{ background: CHROME.paper2, color: CHROME.ink }}
        >
          <span aria-hidden style={{ color: CHROME.accent }}>
            +
          </span>
          <span className="text-[13px] font-semibold">
            {creating ? "Creating…" : "Add page"}
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            onClose();
            openRevisions();
          }}
          className="mb-[10px] flex w-full cursor-pointer items-center gap-[8px] rounded-[10px] border-none px-[10px] py-[8px] text-left text-[12px] transition-colors"
          style={{ background: "transparent", color: CHROME.muted }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = CHROME.paper2;
            e.currentTarget.style.color = CHROME.ink2;
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = CHROME.muted;
          }}
        >
          Page history & revisions
        </button>

        {loading ? (
          <p className="px-[6px] text-[12px]" style={{ color: CHROME.muted }}>
            Loading…
          </p>
        ) : null}
        {fetchErr ? (
          <p className="px-[6px] text-[12px]" style={{ color: CHROME.rose }}>
            {fetchErr}
          </p>
        ) : null}

        {pages?.map((page) => {
          const isCurrent = page.id === pageId;
          const isHome = page.slug === "" || page.slug === pageSlug;

          // ONB-4 — inline forms replace the ⋯ menu entries for this page.
          if (renamingId === page.id) {
            return (
              <div key={page.id} className="mb-[4px]">
                <InlineRenameForm
                  page={page}
                  onDone={handleInlineDone}
                  onError={handleInlineError}
                />
              </div>
            );
          }
          if (deletingId === page.id) {
            return (
              <div key={page.id} className="mb-[4px]">
                <InlineDeleteConfirm
                  page={page}
                  onDone={handleInlineDone}
                  onError={handleInlineError}
                />
              </div>
            );
          }

          return (
            <div
              key={page.id}
              className="group mb-[4px] flex items-center gap-[4px] rounded-[10px] px-[4px] py-[3px]"
              style={{ background: isCurrent ? "rgba(61,79,124,0.08)" : "transparent" }}
            >
              <button
                type="button"
                disabled={isCurrent || navigating}
                onClick={() => void navToPage(page.slug)}
                className="flex min-w-0 flex-1 cursor-pointer items-center gap-[8px] rounded-[8px] border-none bg-transparent px-[6px] py-[6px] text-left disabled:cursor-default"
              >
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium" style={{ color: CHROME.ink }}>
                  {page.title}
                  {page.slug === "" ? (
                    <span className="ml-[6px] text-[10px] font-semibold uppercase tracking-wide" style={{ color: CHROME.muted }}>
                      Home
                    </span>
                  ) : null}
                </span>
                {page.status === "draft" ? (
                  <span
                    className="shrink-0 rounded-[4px] px-[5px] py-[1px] text-[9px] font-semibold uppercase"
                    style={{ background: CHROME.amberBg, color: CHROME.amber }}
                  >
                    Draft
                  </span>
                ) : null}
              </button>
              <div className="relative shrink-0">
                <button
                  type="button"
                  title="More page actions"
                  aria-label="More page actions"
                  aria-expanded={moreOpenId === page.id}
                  onClick={() =>
                    setMoreOpenId((id) => (id === page.id ? null : page.id))
                  }
                  className="inline-flex h-[28px] w-[28px] cursor-pointer items-center justify-center rounded-[8px] border-none opacity-0 transition-opacity group-hover:opacity-100"
                  style={{ background: CHROME.paper2, color: CHROME.muted }}
                >
                  ⋯
                </button>
                {moreOpenId === page.id ? (
                  <div
                    className="absolute right-0 top-[30px] z-[10] min-w-[140px] rounded-[10px] p-[4px]"
                    style={{
                      background: CHROME.surface,
                      border: `1px solid ${CHROME.line}`,
                      boxShadow:
                        "0 12px 32px -8px rgba(0,0,0,0.18), 0 2px 8px rgba(0,0,0,0.06)",
                    }}
                  >
                    {/* ONB-4 — styled inline rename instead of window.prompt */}
                    <button
                      type="button"
                      onClick={() => {
                        setMoreOpenId(null);
                        setRenamingId(page.id);
                      }}
                      className="block w-full cursor-pointer rounded-[6px] border-none px-[10px] py-[7px] text-left text-[12px]"
                      style={{ background: "transparent", color: CHROME.ink }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = CHROME.paper2; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      disabled={duplicatingId === page.id}
                      onClick={() => void handleDuplicate(page.id)}
                      className="block w-full cursor-pointer rounded-[6px] border-none px-[10px] py-[7px] text-left text-[12px]"
                      style={{ background: "transparent", color: CHROME.ink }}
                      onMouseEnter={(e) => { e.currentTarget.style.background = CHROME.paper2; }}
                      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                    >
                      {duplicatingId === page.id ? "Duplicating…" : "Duplicate"}
                    </button>
                    {/* ONB-4 — styled inline delete instead of window.confirm */}
                    {!isHome ? (
                      <button
                        type="button"
                        onClick={() => {
                          setMoreOpenId(null);
                          setDeletingId(page.id);
                        }}
                        className="block w-full cursor-pointer rounded-[6px] border-none px-[10px] py-[7px] text-left text-[12px]"
                        style={{ background: "transparent", color: CHROME.rose }}
                        onMouseEnter={(e) => { e.currentTarget.style.background = "rgba(190,18,60,0.06)"; }}
                        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
                      >
                        Delete
                      </button>
                    ) : null}
                    {!isHome ? (
                      <Link
                        href={workspaceWebsiteHref}
                        target="_blank"
                        className="block rounded-[6px] px-[10px] py-[7px] text-[12px] no-underline"
                        style={{ color: CHROME.muted }}
                        onClick={() => setMoreOpenId(null)}
                      >
                        Manage in admin
                      </Link>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          );
        })}

        {pages && pages.length === 0 && !loading ? (
          <p className="px-[6px] text-[12px]" style={{ color: CHROME.muted }}>
            No pages yet.
          </p>
        ) : null}
      </div>
    </DockFloatingPanel>
  );
}
