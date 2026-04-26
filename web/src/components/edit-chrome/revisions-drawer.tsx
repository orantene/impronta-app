"use client";

/**
 * RevisionsDrawer — Phase 4 surface for browsing + restoring saved
 * revisions of the current page.
 *
 * Implements builder-experience.html surface §6 (Revisions — the safety
 * net). Last reconciled: 2026-04-25.
 *
 * Schema-light first pass. Reads existing `cms_page_revisions` rows
 * (already written by every save and every publish — no new column is
 * needed for the read path) via `loadHomepageRevisionsAction`. Each row
 * shows `kind` (Draft / Published / Rollback), the version it was
 * minted at, the actor's display name, a relative timestamp, and a
 * `Restore` action.
 *
 * Restore delegates to `restoreRevision` on EditContext, which wraps
 * `restoreHomepageRevisionAction` in the same CAS-safe rhythm as every
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
 * The deeper schema (named drafts via `name`/`note`/`tag` enum) lands
 * later when Save-as-named-draft is uplifted from its lightweight
 * Phase 2 wiring.
 */

import { useEffect, useState } from "react";
import type { ReactElement } from "react";

import {
  CHROME,
  CHROME_RADII,
  CHROME_SHADOWS,
  Drawer,
  DrawerBody,
  DrawerHead,
} from "./kit";
import { useEditContext } from "./edit-context";
import {
  loadHomepageRevisionsAction,
  type RevisionListRow,
} from "@/lib/site-admin/edit-mode/revisions-actions";

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
  // Fall through to a localised date — drops the "ago" suffix because
  // older entries read better as a calendar reference.
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
    pageMetadata,
    restoreRevision,
  } = useEditContext();

  const [revisions, setRevisions] = useState<RevisionListRow[] | null>(null);
  const [publishedVersion, setPublishedVersion] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  // Re-fetch on every open so a freshly-written draft revision shows up.
  // The 50-row server-side cap means this is always a single small
  // round-trip; we don't need to hold the list across closes.
  useEffect(() => {
    if (!revisionsOpen) {
      setConfirmId(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    void loadHomepageRevisionsAction({ locale }).then((res) => {
      if (cancelled) return;
      setLoading(false);
      if (res.ok) {
        setRevisions(res.revisions);
        setPublishedVersion(res.publishedVersion);
      } else {
        setError(res.error ?? "Could not load revisions.");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [revisionsOpen, locale]);

  async function handleRestore(rev: RevisionListRow): Promise<void> {
    setPendingId(rev.id);
    const res = await restoreRevision(rev.id);
    setPendingId(null);
    if (res.ok) {
      setConfirmId(null);
      closeRevisions();
    }
  }

  return (
    <Drawer kind="revisions" open={revisionsOpen} zIndex={87}>
      <DrawerHead
        eyebrow="Revisions"
        title={pageMetadata?.title ?? "Homepage"}
        titleStyle="display"
        icon={<ClockIcon />}
        meta={
          revisions === null
            ? "Loading…"
            : revisions.length === 0
              ? "No revisions yet"
              : `${revisions.length} entr${revisions.length === 1 ? "y" : "ies"}`
        }
        onClose={pendingId ? undefined : closeRevisions}
      />

      <DrawerBody padding="14px 14px 24px">
        {error ? (
          <div
            className="mb-3 rounded-md px-3 py-2"
            style={{
              fontSize: 11.5,
              background: CHROME.roseBg,
              border: `1px solid ${CHROME.roseLine}`,
              color: CHROME.rose,
            }}
          >
            {error}
          </div>
        ) : null}

        {loading && revisions === null ? <SkeletonList /> : null}

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
                  onAskConfirm={() => setConfirmId(rev.id)}
                  onCancelConfirm={() => setConfirmId(null)}
                  onConfirmRestore={() => void handleRestore(rev)}
                />
              </li>
            ))}
          </ul>
        ) : null}
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
  onAskConfirm: () => void;
  onCancelConfirm: () => void;
  onConfirmRestore: () => void;
}

function RevisionCard({
  rev,
  isLive,
  pending,
  confirming,
  onAskConfirm,
  onCancelConfirm,
  onConfirmRestore,
}: RevisionCardProps): ReactElement {
  const author = rev.createdBy?.displayName ?? "Unknown";
  return (
    <article
      className="flex flex-col gap-2"
      style={{
        background: CHROME.surface,
        border: `1px solid ${CHROME.line}`,
        borderRadius: CHROME_RADII.md,
        boxShadow: CHROME_SHADOWS.card,
        padding: "10px 12px",
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
          {rev.titleAtRevision ?? "Homepage"}
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
          >
            <RestoreIcon /> Restore
          </button>
        )}
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
    background: disabled ? CHROME.muted2 : CHROME.ink,
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
        Save a draft or publish the homepage and the first revision will appear
        here.
      </span>
    </div>
  );
}

function SkeletonList(): ReactElement {
  return (
    <ul className="m-0 flex list-none flex-col gap-2 p-0">
      {[0, 1, 2].map((i) => (
        <li
          key={i}
          style={{
            height: 78,
            background: CHROME.surface,
            border: `1px solid ${CHROME.line}`,
            borderRadius: CHROME_RADII.md,
            opacity: 0.55 - i * 0.12,
          }}
        />
      ))}
    </ul>
  );
}
