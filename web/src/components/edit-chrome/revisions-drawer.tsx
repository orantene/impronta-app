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
  CHROME_RADII,
  CHROME_SHADOWS,
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

function RestoreIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="20 6 9 17 4 12" />
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

// ── kind chip ────────────────────────────────────────────────────────────

interface KindChipMeta {
  label: string;
  fg: string;
  bg: string;
  border: string;
}

const KIND_CHIPS: Record<RevisionListRow["kind"], KindChipMeta> = {
  draft: {
    label: "Draft",
    fg: CHROME.muted,
    bg: CHROME.paper,
    border: CHROME.lineMid,
  },
  published: {
    label: "Published",
    fg: CHROME.green,
    bg: CHROME.greenBg,
    border: CHROME.greenLine,
  },
  rollback: {
    label: "Rollback",
    fg: CHROME.violet,
    bg: CHROME.violetBg,
    border: CHROME.violetLine,
  },
};

function KindChip({ kind }: { kind: RevisionListRow["kind"] }): ReactElement {
  const m = KIND_CHIPS[kind];
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-[2px]"
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.04em",
        color: m.fg,
        background: m.bg,
        border: `1px solid ${m.border}`,
      }}
    >
      {m.label}
    </span>
  );
}

function LiveChip(): ReactElement {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-[2px]"
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.04em",
        color: CHROME.blue,
        background: CHROME.blueBg,
        border: `1px solid ${CHROME.blueLine}`,
      }}
    >
      <CheckIcon /> Live
    </span>
  );
}

// ── relative time ────────────────────────────────────────────────────────

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diff = Date.now() - then;
  if (diff < MINUTE) return "just now";
  if (diff < HOUR) {
    const m = Math.floor(diff / MINUTE);
    return `${m}m ago`;
  }
  if (diff < DAY) {
    const h = Math.floor(diff / HOUR);
    return `${h}h ago`;
  }
  if (diff < 7 * DAY) {
    const d = Math.floor(diff / DAY);
    return `${d}d ago`;
  }
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
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
  } = useEditContext();

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

  // Reset transient state on close.
  useEffect(() => {
    if (!revisionsOpen) {
      setConfirmId(null);
      setDiffPair(null);
      setDiffAnchor(null);
    }
  }, [revisionsOpen]);

  // Re-fetch on every open so a freshly-written draft revision shows up.
  useEffect(() => {
    if (!revisionsOpen) return;

    let cancelled = false;
    setLoading(true);
    setError(null);
    setRevisions(null);
    setPublishedVersion(null);

    // T4.5: Branch on page type. Non-homepage uses pageId + current
    // pageVersion so the drawer loads revisions for the correct page
    // without a locale-based homepage lookup.
    const fetchPromise =
      isNonHomepage && pageId && pageVersion !== null
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
  }, [isNonHomepage, pageId, pageVersion, revisionsOpen, locale]);

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
              ⌘⇧Z) applies to this editing session only and does not survive a
              full reload.{" "}
              <strong style={{ color: CHROME.text }}>Restore</strong> replaces
              your draft with a saved snapshot — review the canvas, then
              publish when ready.{" "}
              {revisions && revisions.length >= 2 && (
                <>
                  Use the <DiffIcon /> button to select two revisions and see a
                  structural diff.
                </>
              )}
            </div>

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

            {revisions && revisions.length > 0 ? (
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {revisions.map((rev) => (
                  <li key={rev.id}>
                    <RevisionCard
                      rev={rev}
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
                    />
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        )}
      </DrawerBody>
    </Drawer>
  );
}

// ── card ─────────────────────────────────────────────────────────────────

interface RevisionCardProps {
  rev: RevisionListRow;
  isLive: boolean;
  pending: boolean;
  confirming: boolean;
  isDiffAnchor: boolean;
  canDiff: boolean;
  onAskConfirm: () => void;
  onCancelConfirm: () => void;
  onConfirmRestore: () => void;
  onSelectForDiff: () => void;
}

function RevisionCard({
  rev,
  isLive,
  pending,
  confirming,
  isDiffAnchor,
  canDiff,
  onAskConfirm,
  onCancelConfirm,
  onConfirmRestore,
  onSelectForDiff,
}: RevisionCardProps): ReactElement {
  const author = rev.createdBy?.displayName ?? "Unknown";
  return (
    <article
      className="flex flex-col gap-2"
      style={{
        background: isDiffAnchor ? CHROME.blueBg : CHROME.surface,
        border: `1px solid ${isDiffAnchor ? CHROME.blueLine : CHROME.line}`,
        borderRadius: CHROME_RADII.md,
        boxShadow: CHROME_SHADOWS.card,
        padding: "10px 12px",
        transition: "background 120ms ease, border-color 120ms ease",
      }}
    >
      <header className="flex items-center gap-2">
        <KindChip kind={rev.kind} />
        {isLive ? <LiveChip /> : null}
        <span
          className="ml-auto"
          style={{ fontSize: 10.5, color: CHROME.muted2, letterSpacing: "0.02em" }}
          title={new Date(rev.createdAt).toLocaleString()}
        >
          {formatRelative(rev.createdAt)}
        </span>
      </header>

      <div className="flex items-baseline gap-2">
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: CHROME.ink,
            letterSpacing: "-0.005em",
          }}
        >
          {rev.titleAtRevision ?? "Page"}
        </span>
        <span style={{ fontSize: 11, color: CHROME.muted2 }}>· v{rev.version}</span>
      </div>

      <div
        className="flex items-center justify-between gap-2"
        style={{ fontSize: 11, color: CHROME.muted }}
      >
        <span>
          {author}
          <span style={{ color: CHROME.muted2 }}> · </span>
          {rev.sectionCount} section{rev.sectionCount === 1 ? "" : "s"}
        </span>

        <span className="flex items-center gap-1">
          {/* Compare button — visible when ≥2 revisions exist. */}
          {canDiff && !confirming ? (
            <button
              type="button"
              onClick={onSelectForDiff}
              disabled={pending}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                height: 24,
                padding: "0 8px",
                fontSize: 10.5,
                fontWeight: 600,
                color: isDiffAnchor ? CHROME.blue : CHROME.muted,
                background: isDiffAnchor ? CHROME.blueBg : CHROME.paper,
                border: `1px solid ${isDiffAnchor ? CHROME.blueLine : CHROME.lineMid}`,
                borderRadius: 6,
                cursor: pending ? "not-allowed" : "pointer",
                transition: "background 120ms ease, color 120ms ease",
              }}
              title={isDiffAnchor ? "Deselect from compare" : "Select for compare"}
              aria-label={isDiffAnchor ? "Deselect this revision from the comparison" : "Select this revision for comparison"}
              aria-pressed={isDiffAnchor}
            >
              <DiffIcon />
            </button>
          ) : null}

          {confirming ? (
            <span className="flex items-center gap-1.5">
              <span style={{ color: CHROME.muted, fontWeight: 500 }}>Restore?</span>
              <button
                type="button"
                onClick={onCancelConfirm}
                disabled={pending}
                style={ghostBtnStyle()}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={onConfirmRestore}
                disabled={pending}
                style={primaryBtnStyle(pending)}
              >
                {pending ? "Restoring…" : "Yes, restore"}
              </button>
            </span>
          ) : isLive ? (
            <span style={{ color: CHROME.muted2, fontStyle: "italic" }}>
              Current published
            </span>
          ) : (
            <button
              type="button"
              onClick={onAskConfirm}
              disabled={pending}
              style={iconBtnStyle()}
              title="Restore as draft"
              aria-label="Restore this snapshot as your current draft"
            >
              <RestoreIcon /> Restore
            </button>
          )}
        </span>
      </div>
    </article>
  );
}

// ── button styles ────────────────────────────────────────────────────────

function iconBtnStyle(): React.CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    height: 24,
    padding: "0 8px",
    fontSize: 10.5,
    fontWeight: 600,
    color: CHROME.ink,
    background: CHROME.paper,
    border: `1px solid ${CHROME.lineMid}`,
    borderRadius: 6,
    cursor: "pointer",
    transition: "background 120ms ease, color 120ms ease",
  };
}

function ghostBtnStyle(): React.CSSProperties {
  return {
    height: 24,
    padding: "0 8px",
    fontSize: 10.5,
    fontWeight: 500,
    color: CHROME.muted,
    background: "transparent",
    border: `1px solid ${CHROME.line}`,
    borderRadius: 6,
    cursor: "pointer",
  };
}

function primaryBtnStyle(disabled: boolean): React.CSSProperties {
  return {
    height: 24,
    padding: "0 10px",
    fontSize: 10.5,
    fontWeight: 600,
    color: "#fff",
    background: disabled ? CHROME.muted2 : CHROME.accent,
    border: "none",
    borderRadius: 6,
    cursor: disabled ? "wait" : "pointer",
    boxShadow: CHROME_SHADOWS.card,
  };
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

