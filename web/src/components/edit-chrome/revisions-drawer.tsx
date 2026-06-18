"use client";

/**
 * RevisionsDrawer — Phase 4 surface for browsing + restoring saved
 * revisions of the current page.
 *
 * Implements builder-experience.html surface §6 (Revisions — the safety
 * net). Last reconciled: 2026-04-25.
 *
 * T4.5 (P4-REVISIONS): generalised to ANY cms_page (not just the homepage).
 * - Homepage path (pageSlug=null): calls `loadHomepageRevisionsAction`.
 * - Non-homepage path (pageSlug+pageId set): calls `loadPageRevisionsAction`.
 * - Added side-by-side structural diff panel: select two revisions → click
 *   "Compare" (the diff icon) on a second revision to view the diff.
 * - Restore works for both paths via the branched `restoreRevision` callback
 *   in EditContext (homepage uses locale; non-homepage uses pageId).
 *
 * Diff panel lives in revisions-diff-panel.tsx (split to stay under the
 * 800-line ESLint limit).
 *
 * Wave 6A — #18 + #19: undo-survives-reload (in edit-context.tsx), named
 * versions (localStorage label map + inline editor in RevisionCard extracted
 * to revisions-card.tsx), and name-filter search input.
 *
 * Schema-light first pass. Reads existing `cms_page_revisions` rows
 * (already written by every save and every publish — no new column is
 * needed for the read path). Each row shows `kind` (Draft / Published /
 * Rollback), the version it was minted at, the actor's display name, a
 * relative timestamp, and a `Restore` action.
 *
 * Restore delegates to `restoreRevision` on EditContext, which wraps
 * the appropriate server action in the same CAS-safe rhythm as every
 * other composition mutation. The lib op replaces the draft composition
 * with the snapshot, bumps `cms_pages.version`, and mints a fresh
 * `kind='rollback'` row so the audit trail captures the action — the
 * operator reviews the restored draft and re-publishes when ready.
 *
 * Lazy fetch on every open: the drawer doesn't keep a long-lived list
 * because a freshly-saved draft would be missing. Re-fetching costs a
 * single round-trip and the data set is capped at 50 rows server-side.
 *
 * Mockup reference: surface 6 in `docs/mockups/builder-experience.html`.
 */

import { useEffect, useState, useCallback } from "react";
import type { ReactElement } from "react";

import {
  CHROME,
  Drawer,
  DrawerBody,
  DrawerHead,
  DrawerSkeleton,
} from "./kit";
import { useEditContext } from "./edit-context";
import {
  loadHomepageRevisionsAction,
  loadPageRevisionsAction,
  type RevisionListRow,
} from "@/lib/site-admin/edit-mode/revisions-actions";
import { RevisionsDiffPanel } from "./revisions-diff-panel";
import { RevisionCard } from "./revisions-card";

// Named-version labels are persisted client-side (this drawer + RevisionCard);
// the key lives here, not in the "use server" revisions-actions module (which
// can only export async functions).
//
// REV-1 — the labels are SCOPED per (surfaceKind + page identity). A single
// global key bled labels across surfaces in a shared browser: a label saved
// against revision `r1` of the storefront homepage would also surface on
// revision `r1` of a talent-site shell, because revision ids are unique per
// table but the label map was global. Scoping by surface + page id keeps each
// surface's named versions isolated. The `_v1` suffix is retained so legacy
// global labels degrade silently (a fresh, empty per-surface map) rather than
// throwing.
const REVISION_LABELS_KEY_PREFIX = "builder_revision_labels_v1";

/** Build the per-surface label storage key. Homepage has no pageId, so it falls
 *  back to its slug/locale; freeform surfaces key off (surfaceKind + pageId). */
function revisionLabelsStorageKey(
  surfaceKind: string,
  pageId: string | null | undefined,
  pageSlug: string | null | undefined,
  locale: string,
): string {
  const scope = pageId || pageSlug || `home:${locale}`;
  return `${REVISION_LABELS_KEY_PREFIX}:${surfaceKind}:${scope}`;
}

// ── icons ────────────────────────────────────────────────────────────────

function ClockIcon() {
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
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function DiffIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <rect x="2" y="3" width="8" height="18" rx="2" />
      <rect x="14" y="3" width="8" height="18" rx="2" />
      <line x1="10" y1="9" x2="14" y2="9" />
      <line x1="10" y1="15" x2="14" y2="15" />
    </svg>
  );
}

function TagIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <line x1="7" y1="7" x2="7.01" y2="7" />
    </svg>
  );
}

// ── Drawer ───────────────────────────────────────────────────────────────

export function RevisionsDrawer(): ReactElement | null {
  const {
    revisionsOpen,
    closeRevisions,
    locale,
    pageSlug,
    pageId,
    pageVersion,
    pageMetadata,
    restoreRevision,
    loadSurfaceRevisions,
    surfaceKind,
  } = useEditContext();

  // REV-1 — per-surface label key so named versions don't bleed across surfaces
  // sharing one browser (e.g. storefront homepage vs talent-site shell).
  const labelsStorageKey = revisionLabelsStorageKey(
    surfaceKind,
    pageId,
    pageSlug,
    locale,
  );

  // Non-homepage when both pageSlug and pageId are set.
  const isNonHomepage = Boolean(pageSlug) && Boolean(pageId);

  const [revisions, setRevisions] = useState<RevisionListRow[] | null>(null);
  const [publishedVersion, setPublishedVersion] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  // Diff: pair of revisions to compare (older=A, newer=B).
  const [diffPair, setDiffPair] = useState<[RevisionListRow, RevisionListRow] | null>(null);
  // First selection for diff-mode (waiting for the second pick).
  const [diffAnchor, setDiffAnchor] = useState<RevisionListRow | null>(null);
  // #19 — Named versions: label map persisted to localStorage. Key is revisionId.
  // REV-1 — the localStorage SLOT is scoped per surface (`labelsStorageKey`).
  const [labelMap, setLabelMap] = useState<Record<string, string>>(() => {
    if (typeof window === "undefined") return {};
    try {
      const raw = window.localStorage.getItem(labelsStorageKey);
      return raw ? (JSON.parse(raw) as Record<string, string>) : {};
    } catch {
      return {};
    }
  });

  // REV-1 — reload the label map whenever the scoped key changes (the same
  // drawer instance can be re-targeted at a different surface/page mid-session).
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(labelsStorageKey);
      setLabelMap(raw ? (JSON.parse(raw) as Record<string, string>) : {});
    } catch {
      setLabelMap({});
    }
  }, [labelsStorageKey]);
  // #19 — Search/filter input (matches against version label, kind, title).
  const [nameFilter, setNameFilter] = useState("");

  // Reset transient state on close.
  useEffect(() => {
    if (!revisionsOpen) {
      setConfirmId(null);
      setDiffPair(null);
      setDiffAnchor(null);
      setNameFilter("");
    }
  }, [revisionsOpen]);

  // #19 / REV-1 — write the label map THROUGH to the per-surface localStorage
  // key inside the setter (not via a `[labelMap, labelsStorageKey]` effect). A
  // persist effect keyed on `labelsStorageKey` would race the reload effect on a
  // surface switch and write the STALE map to the NEW key; writing through the
  // setter persists only deliberate edits against the key in force at edit time.
  const setLabel = useCallback(
    (revId: string, label: string) => {
      setLabelMap((prev) => {
        const next = { ...prev };
        if (label.trim() === "") {
          delete next[revId];
        } else {
          next[revId] = label.trim();
        }
        if (typeof window !== "undefined") {
          try {
            window.localStorage.setItem(labelsStorageKey, JSON.stringify(next));
          } catch {
            // quota / private-browsing — skip silently
          }
        }
        return next;
      });
    },
    [labelsStorageKey],
  );

  // Re-fetch on every open so a freshly-written draft revision shows up.
  useEffect(() => {
    if (!revisionsOpen) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    setRevisions(null);
    setPublishedVersion(null);

    // REV-1b — prefer the surface's OWN owner-gated list read when the active
    // adapter supplies one. The talent-site shell mounts with no `pageSlug`, so
    // without this it would fall through to `loadHomepageRevisionsAction`
    // (staff-gated) and a talent's own shell revisions would be denied. When
    // the adapter exposes `loadRevisions`, `loadSurfaceRevisions` is non-null
    // and routes the LIST read through the same owner gate REV-1 used for
    // restore. No surfaceKind fork — the routing lives in the adapter/config.
    //
    // T4.5: otherwise branch on page type. Non-homepage uses pageId + current
    // pageVersion so the drawer loads revisions for the correct page without a
    // locale-based homepage lookup; the homepage path is unchanged.
    const fetchPromise = loadSurfaceRevisions
      ? loadSurfaceRevisions()
      : isNonHomepage && pageId && pageVersion !== null
        ? loadPageRevisionsAction({ pageId, pageVersion })
        : loadHomepageRevisionsAction({ locale });

    void fetchPromise.then((res) => {
      if (cancelled) return;
      setLoading(false);
      if (res.ok) {
        setRevisions(res.revisions);
        setPublishedVersion(res.publishedVersion);
      } else {
        setError(
          res.error ??
            "Couldn't load revision history — try closing and reopening Revisions.",
        );
      }
    });

    return () => { cancelled = true; };
  }, [isNonHomepage, pageId, pageVersion, revisionsOpen, locale, loadSurfaceRevisions]);

  async function handleRestore(rev: RevisionListRow): Promise<void> {
    // Double-click race guard: block any second restore while one is in
    // flight, even if it targets a different revision row.
    if (pendingId !== null) return;
    setPendingId(rev.id);
    const res = await restoreRevision(rev.id);
    setPendingId(null);
    if (res.ok) {
      setConfirmId(null);
      closeRevisions();
    }
  }

  // Diff selection: first click sets the anchor; second click on a
  // different revision launches the diff panel (older=A, newer=B).
  // Clicking the anchor again cancels the selection.
  const handleDiffSelect = useCallback((rev: RevisionListRow) => {
    if (!diffAnchor) {
      setDiffAnchor(rev);
      return;
    }
    if (diffAnchor.id === rev.id) {
      setDiffAnchor(null);
      return;
    }
    const [olderRev, newerRev] =
      diffAnchor.version <= rev.version
        ? [diffAnchor, rev]
        : [rev, diffAnchor];
    setDiffPair([olderRev, newerRev]);
    setDiffAnchor(null);
  }, [diffAnchor]);

  // pageId used for the diff query — falls back to "" (homepage diff is
  // scoped via both revisions carrying the same page_id in the DB).
  const effectivePageId = pageId ?? "";

  return (
    <Drawer
      kind="revisions"
      open={revisionsOpen}
      zIndex={87}
      ariaLabelledBy="revisions-drawer-title"
      modal
      onRequestClose={pendingId ? undefined : closeRevisions}
      floating
      floatLabel="Revisions"
      floatPanelId="revisions"
    >
      <DrawerHead
        titleId="revisions-drawer-title"
        title={`Revisions · ${pageMetadata?.title ?? (pageSlug ? pageSlug : "Homepage")}`}
        icon={<ClockIcon />}
        meta={
          diffPair
            ? `v${diffPair[0].version} ↔ v${diffPair[1].version}`
            : revisions === null
              ? "Loading…"
              : revisions.length === 0
                ? "No revisions yet"
                : `${revisions.length} entr${revisions.length === 1 ? "y" : "ies"}`
        }
        onClose={pendingId ? undefined : closeRevisions}
      />

      <DrawerBody>
        {/* ── Diff panel replaces the list while a comparison is active ── */}
        {diffPair ? (
          <RevisionsDiffPanel
            pageId={effectivePageId}
            revA={diffPair[0]}
            revB={diffPair[1]}
            onClose={() => setDiffPair(null)}
          />
        ) : (
          <>
            {/* ── Info banner ── */}
            <div
              className="mb-3 rounded-md px-3 py-2 text-[12px] leading-relaxed"
              style={{
                background: CHROME.surface2,
                border: `1px solid ${CHROME.line}`,
                color: CHROME.muted,
              }}
            >
              <strong style={{ color: CHROME.text }}>Undo / Redo</strong> (⌘Z /
              ⌘⇧Z) depth is preserved across reloads (up to 10 steps).{" "}
              <strong style={{ color: CHROME.text }}>Restore</strong> replaces
              your draft with a saved snapshot — review the canvas, then
              publish when ready.{" "}
              {revisions && revisions.length >= 2 && (
                <>
                  Use the <DiffIcon /> button to select two revisions and see a
                  structural diff. Use the <TagIcon /> button to name a
                  checkpoint.
                </>
              )}
            </div>

            {/* ── #19 Named-version search filter ── */}
            {revisions && revisions.length > 3 ? (
              <div className="mb-3">
                <input
                  type="search"
                  placeholder="Filter by name, kind, or title…"
                  value={nameFilter}
                  onChange={(e) => setNameFilter(e.target.value)}
                  style={{
                    width: "100%",
                    background: CHROME.surface2,
                    border: `1px solid ${CHROME.line}`,
                    borderRadius: 7,
                    padding: "6px 10px",
                    fontSize: 12,
                    color: CHROME.ink,
                    outline: "none",
                  }}
                  aria-label="Filter revision history"
                />
              </div>
            ) : null}

            {/* ── Diff-select mode hint ── */}
            {diffAnchor && (
              <div
                className="mb-3 rounded-md px-3 py-2 text-[11px] leading-relaxed"
                style={{
                  background: CHROME.blueBg,
                  border: `1px solid ${CHROME.blueLine}`,
                  color: CHROME.blue,
                  fontWeight: 500,
                }}
                role="status"
                aria-live="polite"
              >
                v{diffAnchor.version} selected — click a second revision to
                compare, or click it again to cancel.
              </div>
            )}

            {/* ── Error ── */}
            {error ? (
              <div
                className="mb-3 rounded-md px-3 py-2"
                style={{
                  fontSize: 11.5,
                  background: CHROME.roseBg,
                  border: `1px solid ${CHROME.roseLine}`,
                  color: CHROME.rose,
                }}
                role="alert"
                aria-live="assertive"
              >
                {error}
              </div>
            ) : null}

            {loading && revisions === null ? <DrawerSkeleton rows={3} /> : null}

            {!loading && revisions !== null && revisions.length === 0 ? (
              <EmptyState />
            ) : null}

            {revisions && revisions.length > 0 ? (() => {
              // #19 — apply the name filter if set. Match against: assigned
              // label, kind chip label, page title at revision, version number.
              const q = nameFilter.trim().toLowerCase();
              const filtered = q
                ? revisions.filter((rev) => {
                    const label = labelMap[rev.id] ?? "";
                    return (
                      label.toLowerCase().includes(q) ||
                      rev.kind.includes(q) ||
                      (rev.titleAtRevision ?? "").toLowerCase().includes(q) ||
                      String(rev.version).includes(q)
                    );
                  })
                : revisions;

              if (filtered.length === 0) {
                return (
                  <div
                    className="rounded-md px-3 py-6 text-center"
                    style={{ fontSize: 12, color: CHROME.muted }}
                  >
                    No revisions match &ldquo;{nameFilter}&rdquo;.
                  </div>
                );
              }

              return (
                <ul className="m-0 flex list-none flex-col gap-2 p-0">
                  {filtered.map((rev) => (
                    <li key={rev.id}>
                      <RevisionCard
                        rev={rev}
                        label={labelMap[rev.id] ?? ""}
                        isLive={
                          rev.kind === "published" &&
                          publishedVersion !== null &&
                          rev.version === publishedVersion
                        }
                        pending={pendingId === rev.id}
                        confirming={confirmId === rev.id}
                        isDiffAnchor={diffAnchor?.id === rev.id}
                        canDiff={Boolean(revisions && revisions.length >= 2)}
                        onAskConfirm={() => setConfirmId(rev.id)}
                        onCancelConfirm={() => setConfirmId(null)}
                        onConfirmRestore={() => void handleRestore(rev)}
                        onSelectForDiff={() => handleDiffSelect(rev)}
                        onSetLabel={(l) => setLabel(rev.id, l)}
                      />
                    </li>
                  ))}
                </ul>
              );
            })() : null}
          </>
        )}
      </DrawerBody>
    </Drawer>
  );
}

// ── empty / skeleton ─────────────────────────────────────────────────────

function EmptyState(): ReactElement {
  return (
    <div
      className="flex flex-col items-center gap-2 rounded-md py-10 text-center"
      style={{
        background: CHROME.surface,
        border: `1px dashed ${CHROME.lineMid}`,
        color: CHROME.muted,
      }}
    >
      <span style={{ color: CHROME.muted2 }}>
        <ClockIcon />
      </span>
      <span style={{ fontSize: 12, fontWeight: 600, color: CHROME.ink }}>
        No revisions yet
      </span>
      <span style={{ fontSize: 11, color: CHROME.muted, maxWidth: 240 }}>
        Save a draft or publish the page and the first revision will appear
        here.
      </span>
    </div>
  );
}

// SkeletonList removed — replaced by shared DrawerSkeleton from "./kit".
