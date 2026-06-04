"use client";

/**
 * RevisionCard — extracted from revisions-drawer.tsx to keep that file under
 * the 800-line ESLint max-lines limit. Renders a single revision row in the
 * RevisionsDrawer, including:
 *   - Kind/live/label chips
 *   - #19 Inline label editor (operator-assigned named versions)
 *   - Compare (diff), Restore, and cancel-restore buttons
 *
 * Split 2026-06-03 as part of Wave 6A (Job #18 + #19).
 */

import { useEffect, useRef, useState } from "react";
import type { ReactElement } from "react";

import { CHROME, CHROME_RADII, CHROME_SHADOWS } from "./kit";
import type { RevisionListRow } from "@/lib/site-admin/edit-mode/revisions-actions";

// ── Re-exported icon helpers used by revisions-drawer.tsx ─────────────────────

export function TagIcon() {
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

export function PencilIcon() {
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
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}

export function DiffIconCard() {
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

export function RestoreIconCard() {
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

// ── Kind chip ─────────────────────────────────────────────────────────────────

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

export function KindChipCard({ kind }: { kind: RevisionListRow["kind"] }): ReactElement {
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

export function CheckIconCard() {
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

export function LiveChipCard(): ReactElement {
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
      <CheckIconCard /> Live
    </span>
  );
}

// ── Relative time ─────────────────────────────────────────────────────────────

const SECOND = 1_000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

export function formatRelativeCard(iso: string): string {
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

// ── Button styles ─────────────────────────────────────────────────────────────

export function iconBtnStyle(): React.CSSProperties {
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

export function ghostBtnStyle(): React.CSSProperties {
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

export function primaryBtnStyle(disabled: boolean): React.CSSProperties {
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

// ── RevisionCard ──────────────────────────────────────────────────────────────

export interface RevisionCardProps {
  rev: RevisionListRow;
  /** #19 — operator-assigned version label (empty string = unlabeled). */
  label: string;
  isLive: boolean;
  pending: boolean;
  confirming: boolean;
  isDiffAnchor: boolean;
  canDiff: boolean;
  onAskConfirm: () => void;
  onCancelConfirm: () => void;
  onConfirmRestore: () => void;
  onSelectForDiff: () => void;
  /** #19 — save the operator-supplied label (empty string = clear). */
  onSetLabel: (label: string) => void;
}

export function RevisionCard({
  rev,
  label,
  isLive,
  pending,
  confirming,
  isDiffAnchor,
  canDiff,
  onAskConfirm,
  onCancelConfirm,
  onConfirmRestore,
  onSelectForDiff,
  onSetLabel,
}: RevisionCardProps): ReactElement {
  const author = rev.createdBy?.displayName ?? "Unknown";
  // #19 — inline label editor state.
  const [editingLabel, setEditingLabel] = useState(false);
  const [draftLabel, setDraftLabel] = useState(label);
  const labelInputRef = useRef<HTMLInputElement>(null);

  // Sync draft when external label changes (e.g. cleared from another card).
  useEffect(() => {
    if (!editingLabel) setDraftLabel(label);
  }, [label, editingLabel]);

  function commitLabel() {
    setEditingLabel(false);
    onSetLabel(draftLabel);
  }

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
        <KindChipCard kind={rev.kind} />
        {isLive ? <LiveChipCard /> : null}
        {/* #19 — named-version label chip, shown when a label is set */}
        {label && !editingLabel ? (
          <span
            className="inline-flex items-center gap-1 rounded-full px-2 py-[2px]"
            style={{
              fontSize: 10,
              fontWeight: 600,
              letterSpacing: "0.03em",
              color: CHROME.violet,
              background: CHROME.violetBg,
              border: `1px solid ${CHROME.violetLine}`,
              maxWidth: 120,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
            title={label}
          >
            <TagIcon />
            {label}
          </span>
        ) : null}
        <span
          className="ml-auto"
          style={{ fontSize: 10.5, color: CHROME.muted2, letterSpacing: "0.02em" }}
          title={new Date(rev.createdAt).toLocaleString()}
        >
          {formatRelativeCard(rev.createdAt)}
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

      {/* #19 — inline label editor */}
      {editingLabel ? (
        <div className="flex items-center gap-1.5">
          <input
            ref={labelInputRef}
            type="text"
            value={draftLabel}
            maxLength={48}
            placeholder="Name this version…"
            onChange={(e) => setDraftLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); commitLabel(); }
              if (e.key === "Escape") { setEditingLabel(false); setDraftLabel(label); }
            }}
            autoFocus
            style={{
              flex: 1,
              background: CHROME.surface2,
              border: `1px solid ${CHROME.violetLine}`,
              borderRadius: 6,
              padding: "4px 8px",
              fontSize: 11.5,
              color: CHROME.ink,
              outline: "none",
            }}
            aria-label="Version label"
          />
          <button
            type="button"
            onClick={commitLabel}
            style={primaryBtnStyle(false)}
            aria-label="Save label"
          >
            Save
          </button>
          <button
            type="button"
            onClick={() => { setEditingLabel(false); setDraftLabel(label); }}
            style={ghostBtnStyle()}
            aria-label="Cancel label edit"
          >
            ×
          </button>
        </div>
      ) : null}

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
          {/* #19 — Name/tag button: opens inline label editor. */}
          {!confirming && !editingLabel ? (
            <button
              type="button"
              onClick={() => { setEditingLabel(true); setDraftLabel(label); }}
              disabled={pending}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                height: 24,
                padding: "0 8px",
                fontSize: 10.5,
                fontWeight: 600,
                color: label ? CHROME.violet : CHROME.muted,
                background: label ? CHROME.violetBg : CHROME.paper,
                border: `1px solid ${label ? CHROME.violetLine : CHROME.lineMid}`,
                borderRadius: 6,
                cursor: pending ? "not-allowed" : "pointer",
                transition: "background 120ms ease, color 120ms ease",
              }}
              title={label ? `Rename "${label}"` : "Name this version"}
              aria-label={label ? `Rename this version (currently "${label}")` : "Name this version"}
              aria-pressed={editingLabel}
            >
              <PencilIcon />
            </button>
          ) : null}

          {/* Compare button — visible when ≥2 revisions exist. */}
          {canDiff && !confirming && !editingLabel ? (
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
              <DiffIconCard />
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
          ) : !editingLabel ? (
            <button
              type="button"
              onClick={onAskConfirm}
              disabled={pending}
              style={iconBtnStyle()}
              title="Restore as draft"
              aria-label="Restore this snapshot as your current draft"
            >
              <RestoreIconCard /> Restore
            </button>
          ) : null}
        </span>
      </div>
    </article>
  );
}
