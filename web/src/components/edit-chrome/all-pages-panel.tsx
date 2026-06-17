"use client";

/**
 * AllPagesPanel — compact floating page manager launched from CommandDock.
 *
 * Reuses the same server actions as the topbar PagePicker dropdown without
 * duplicating page data stores.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import {
  createDraftPageAction,
  duplicatePageAction,
  listPagesForPickerAction,
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
                    <button
                      type="button"
                      disabled={duplicatingId === page.id}
                      onClick={() => void handleDuplicate(page.id)}
                      className="block w-full cursor-pointer rounded-[6px] border-none px-[10px] py-[7px] text-left text-[12px]"
                      style={{ background: "transparent", color: CHROME.ink }}
                    >
                      {duplicatingId === page.id ? "Duplicating…" : "Duplicate"}
                    </button>
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
