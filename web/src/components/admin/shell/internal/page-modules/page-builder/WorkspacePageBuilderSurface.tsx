"use client";

/**
 * WorkspacePageBuilderSurface (Gap 2) — the workspace "Website → Page Builder"
 * surface, repointed from the RETIRED legacy block editor (`PageBuilderPage`)
 * to the WS6 FREEFORM page builder (`WorkspaceBuilderMount`).
 *
 * It keeps the legacy surface's page-LIST management (list / create / delete /
 * status) — those affordances are unchanged — but when the operator opens a
 * page it mounts the full freeform `WorkspaceBuilderMount` for that page's slug
 * instead of the old three-column block editor.
 *
 * SAFETY (the migration's #1 rule): a page whose stored `workspace_pages.blocks`
 * are LEGACY `PageBlock[]` is NOT fed raw into the freeform editor. The
 * workspace-page adapter converts legacy blocks → an equivalent freeform tree
 * on load (`convertLegacyPageBlocksToBuilderNodes`), and that conversion is
 * non-destructive — the row's stored legacy blocks are untouched until the
 * operator explicitly saves, so the PUBLISHED page keeps rendering identically
 * (the shape-aware `/p/` renderer routes legacy rows to `BlocksRenderer`) until
 * then.
 *
 * Styling note: this surface lives under `components/admin/shell`, where new
 * inline `style={{…}}` is frozen by the `ratchet/no-new-inline-style` rule, so
 * it is built entirely with the admin Tailwind token utilities
 * (`text-admin-*`, `bg-admin-*`, `border-admin-*`, `font-admin-*`,
 * `rounded-admin-*`).
 */

import { useCallback, useEffect, useState, useTransition } from "react";

import {
  createPage,
  deletePage,
  listPages,
} from "@/app/(workspace)/[tenantSlug]/admin/website/actions";
import { useAdminShell } from "../../state";
import { EmptyState, Icon, PrimaryButton, SecondaryButton } from "../../primitives";
import { WorkspaceBuilderMount } from "./WorkspaceBuilderMount";

type PageListRow = {
  id: string;
  slug: string;
  title: string;
  status: string;
  updatedAt: string;
};

function StatusPillLocal({ status }: { status: string }) {
  const tone =
    status === "published"
      ? "bg-admin-success-soft text-admin-success-deep"
      : status === "scheduled"
        ? "bg-admin-amber-soft text-admin-amber-deep"
        : "bg-admin-surface-alt text-admin-ink-muted";
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-admin-10 font-bold uppercase tracking-wide font-admin-body ${tone}`}
    >
      {status}
    </span>
  );
}

function TrashIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

function ChevronLeftIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  );
}

export function WorkspacePageBuilderSurface() {
  const { tenantSlug, toast, locale, bridgeTenantIdentity } = useAdminShell();

  const [pages, setPages] = useState<PageListRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingSlug, setEditingSlug] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const tenantId = bridgeTenantIdentity?.tenantId ?? null;

  const loadPages = useCallback(async () => {
    if (!tenantSlug) return;
    setLoading(true);
    const res = await listPages(tenantSlug);
    if (res.ok) {
      setPages(
        res.pages.map((p) => ({
          id: p.id,
          slug: p.slug,
          title: p.title,
          status: p.status,
          updatedAt: p.updatedAt,
        })),
      );
    }
    setLoading(false);
  }, [tenantSlug]);

  useEffect(() => {
    void loadPages();
  }, [loadPages]);

  const handleCreatePage = () => {
    if (!tenantSlug) return;
    startSaving(async () => {
      const res = await createPage(tenantSlug);
      if (!res.ok) {
        toast(res.error);
        return;
      }
      await loadPages();
      setEditingSlug(res.slug);
      toast("Page created — opening the builder…");
    });
  };

  const handleDelete = (pageId: string) => {
    if (!tenantSlug) return;
    setConfirmDelete(null);
    startSaving(async () => {
      const res = await deletePage(tenantSlug, pageId);
      if (!res.ok) {
        toast(res.error);
        return;
      }
      await loadPages();
      toast("Page deleted.");
    });
  };

  // ── Full-screen freeform editor for one page ───────────────────────────────
  if (editingSlug && tenantId) {
    return (
      <div className="flex min-h-[480px] flex-col">
        <div className="flex items-center gap-2.5 border-b border-admin-border-soft bg-admin-surface px-4 py-2.5">
          <button
            type="button"
            onClick={() => {
              setEditingSlug(null);
              void loadPages();
            }}
            className="flex items-center gap-1 p-0 text-admin-13 font-semibold text-admin-indigo-deep font-admin-body"
          >
            <ChevronLeftIcon /> Pages
          </button>
          <span className="text-admin-border-soft">|</span>
          <code className="font-mono text-admin-12 text-admin-ink-muted">/{tenantSlug}/p/{editingSlug}</code>
        </div>
        <WorkspaceBuilderMount
          tenantId={tenantId}
          pageSlug={editingSlug}
          workspacePlan={bridgeTenantIdentity?.planTier ?? null}
          tenantSiteLabel={bridgeTenantIdentity?.displayName ?? "Workspace page builder"}
          workspaceMembershipSlug={bridgeTenantIdentity?.slug ?? tenantSlug ?? null}
          locale={locale}
        />
      </div>
    );
  }

  // ── Pages list ─────────────────────────────────────────────────────────────
  return (
    <div className="p-5 font-admin-body">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="m-0 text-admin-18 font-semibold font-admin-display text-admin-ink">Pages</h3>
          <p className="mt-1 mb-0 text-admin-13 text-admin-ink-muted">
            Build and publish pages for your workspace storefront with the visual page builder.
          </p>
        </div>
        <PrimaryButton size="sm" onClick={handleCreatePage} disabled={saving || !tenantSlug}>
          <span className="flex items-center gap-1.5">
            <Icon name="plus" size={13} stroke={2} /> New page
          </span>
        </PrimaryButton>
      </div>

      {loading ? (
        <div className="text-admin-13 text-admin-ink-muted">Loading…</div>
      ) : pages.length === 0 ? (
        <EmptyState
          icon="info"
          title="No pages yet"
          body="Create your first page to publish content on your workspace storefront."
        />
      ) : (
        <div className="flex flex-col gap-2">
          {pages.map((page) => (
            <div
              key={page.id}
              className="flex cursor-pointer items-center gap-3.5 rounded-admin-lg border border-admin-border-soft bg-admin-surface px-4 py-3 transition-colors hover:border-admin-indigo-deep"
              onClick={() => setEditingSlug(page.slug)}
            >
              <div className="min-w-0 flex-1">
                <div className="mb-0.5 flex items-center gap-2">
                  <StatusPillLocal status={page.status} />
                  <span className="font-mono text-admin-11 text-admin-ink-muted">/{page.slug}</span>
                </div>
                <div className="truncate text-admin-13 font-semibold text-admin-ink">{page.title}</div>
                <div className="mt-0.5 text-admin-11 text-admin-ink-dim">
                  Last edited {new Date(page.updatedAt).toLocaleDateString()}
                </div>
              </div>
              <div className="flex flex-shrink-0 items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmDelete(page.id);
                  }}
                  className="p-1 text-admin-ink-muted opacity-60"
                  title="Delete page"
                >
                  <TrashIcon />
                </button>
                <SecondaryButton size="sm" onClick={() => setEditingSlug(page.slug)}>
                  Edit
                </SecondaryButton>
              </div>
            </div>
          ))}
        </div>
      )}

      {confirmDelete && (
        <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/40">
          <div className="w-[90%] max-w-[360px] rounded-admin-xl bg-admin-surface p-7 font-admin-body">
            <h3 className="mb-2.5 mt-0 text-admin-17 font-admin-display text-admin-ink">Delete this page?</h3>
            <p className="mb-5 mt-0 text-admin-13 text-admin-ink-muted">This cannot be undone. All revisions will be deleted.</p>
            <div className="flex justify-end gap-2.5">
              <SecondaryButton size="sm" onClick={() => setConfirmDelete(null)}>Cancel</SecondaryButton>
              <PrimaryButton size="sm" onClick={() => handleDelete(confirmDelete)}>Delete</PrimaryButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
