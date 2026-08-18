"use client";

/**
 * RevisionsDiffPanel — side-by-side structural diff view for the
 * RevisionsDrawer (T4.5 / P4-REVISIONS).
 *
 * Extracted to keep revisions-drawer.tsx under the 800-line ESLint limit.
 * Renders a two-column diff between two revision snapshots, showing which
 * top-level sections or builder-tree nodes were added, removed, or unchanged.
 */

import { useEffect, useState } from "react";
import type { ReactElement } from "react";

import { CHROME } from "./kit";
import {
  loadRevisionDiffAction,
  type RevisionListRow,
  type RevisionSnapshotSummary,
} from "@/lib/site-admin/edit-mode/revisions-actions";
import type { RevisionStructuredDiff } from "@/lib/site-admin/edit-mode/revisions-diff";
import { useEditorLocale } from "./use-editor-locale";

// ── Icons ─────────────────────────────────────────────────────────────────

function BackIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="15 18 9 12 15 6" />
    </svg>
  );
}

function KindChipSmall({ kind }: { kind: RevisionSnapshotSummary["kind"] }): ReactElement {
  const MAP = {
    draft: { label: "Draft", fg: CHROME.muted, bg: CHROME.paper, border: CHROME.lineMid },
    published: { label: "Published", fg: CHROME.green, bg: CHROME.greenBg, border: CHROME.greenLine },
    rollback: { label: "Rollback", fg: CHROME.violet, bg: CHROME.violetBg, border: CHROME.violetLine },
  } as const;
  const m = MAP[kind];
  return (
    <span
      className="inline-flex items-center rounded-full px-1.5 py-[1px]"
      style={{
        fontSize: 9.5,
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

// ── Diff computation ──────────────────────────────────────────────────────

type DiffOp = "unchanged" | "added" | "removed";

interface DiffItem {
  id: string;
  label: string;
  kind: string;
  op: DiffOp;
}

/**
 * Simple set-comparison diff: items in A but not B → removed; items in B
 * but not A → added; items in both → unchanged. Order shifts within the
 * shared set are not flagged. This is a structural heuristic adequate for
 * showing which top-level sections were added or dropped.
 */
function computeDiff(
  aItems: RevisionSnapshotSummary["items"],
  bItems: RevisionSnapshotSummary["items"],
): { aRows: DiffItem[]; bRows: DiffItem[] } {
  const aIds = new Set(aItems.map((i) => i.id));
  const bIds = new Set(bItems.map((i) => i.id));
  return {
    aRows: aItems.map((i) => ({ ...i, op: bIds.has(i.id) ? "unchanged" : "removed" })),
    bRows: bItems.map((i) => ({ ...i, op: aIds.has(i.id) ? "unchanged" : "added" })),
  };
}

const DIFF_COLORS: Record<DiffOp, { bg: string; border: string; text: string; badge?: string }> = {
  unchanged: { bg: "transparent", border: CHROME.line, text: CHROME.ink },
  added: { bg: CHROME.greenBg, border: CHROME.greenLine, text: CHROME.green, badge: "+" },
  removed: { bg: CHROME.roseBg, border: CHROME.roseLine, text: CHROME.rose, badge: "−" },
};

// ── DiffColumn ────────────────────────────────────────────────────────────

function DiffColumn({
  summary,
  rows,
  label,
}: {
  summary: RevisionSnapshotSummary;
  rows: DiffItem[];
  label: string;
}): ReactElement {
  const added = rows.filter((r) => r.op === "added").length;
  const removed = rows.filter((r) => r.op === "removed").length;
  return (
    <div className="flex-1 min-w-0 flex flex-col gap-1.5">
      {/* column header */}
      <div
        className="rounded-md px-2 py-1.5 flex items-center gap-1.5"
        style={{ background: CHROME.surface2, border: `1px solid ${CHROME.line}` }}
      >
        <KindChipSmall kind={summary.kind} />
        <span style={{ fontSize: 11, color: CHROME.muted2 }}>v{summary.version}</span>
        <span style={{ fontSize: 10, color: CHROME.muted, marginLeft: "auto", fontWeight: 500 }}>
          {label}
        </span>
      </div>
      {/* stats row */}
      {added > 0 || removed > 0 ? (
        <div className="flex gap-2 px-0.5" style={{ fontSize: 10.5 }}>
          {added > 0 && <span style={{ color: CHROME.green, fontWeight: 600 }}>+{added} added</span>}
          {removed > 0 && <span style={{ color: CHROME.rose, fontWeight: 600 }}>−{removed} removed</span>}
        </div>
      ) : (
        <div style={{ fontSize: 10.5, color: CHROME.muted2, paddingLeft: 2 }}>No structural changes</div>
      )}
      {/* diff rows */}
      <ul className="m-0 flex list-none flex-col gap-1 p-0">
        {rows.map((row) => {
          const c = DIFF_COLORS[row.op];
          return (
            <li
              key={row.id}
              className="flex items-center gap-1.5 rounded px-2 py-1"
              style={{ background: c.bg, border: `1px solid ${c.border}`, fontSize: 11, color: c.text }}
            >
              {c.badge ? (
                <span style={{ fontWeight: 700, fontSize: 12, lineHeight: 1, width: 12, flexShrink: 0 }}>
                  {c.badge}
                </span>
              ) : (
                <span style={{ width: 12, flexShrink: 0, color: CHROME.muted2, fontSize: 11, textAlign: "center" }}>
                  ·
                </span>
              )}
              <span className="truncate" style={{ fontWeight: row.op === "unchanged" ? 400 : 600 }}>
                {row.label}
              </span>
              <span style={{ fontSize: 9.5, color: row.op === "unchanged" ? CHROME.muted2 : c.text, marginLeft: "auto", flexShrink: 0, opacity: 0.75 }}>
                {row.kind}
              </span>
            </li>
          );
        })}
        {rows.length === 0 && (
          <li style={{ fontSize: 11, color: CHROME.muted, padding: "8px 0", textAlign: "center" }}>
            Empty snapshot
          </li>
        )}
      </ul>
    </div>
  );
}

// ── RevisionsDiffPanel ────────────────────────────────────────────────────

export interface RevisionsDiffPanelProps {
  pageId: string;
  revA: RevisionListRow;
  revB: RevisionListRow;
  onClose: () => void;
  /**
   * #19 — when `embedded` is true the panel is rendered inline (e.g. inside
   * the publish-drawer's card body) rather than as a full replacement for the
   * revisions list. Hides the back-button row and the explanatory banner so
   * the diff fills its card container cleanly.
   */
  embedded?: boolean;
}

export function RevisionsDiffPanel({
  pageId,
  revA,
  revB,
  onClose,
  embedded = false,
}: RevisionsDiffPanelProps): ReactElement {
  type DiffState =
    | { status: "idle" }
    | { status: "loading" }
    | { status: "error"; message: string }
    | {
        status: "loaded";
        a: RevisionSnapshotSummary;
        b: RevisionSnapshotSummary;
        diff: RevisionStructuredDiff;
      };

  const [diffState, setDiffState] = useState<DiffState>({ status: "idle" });

  useEffect(() => {
    let cancelled = false;
    setDiffState({ status: "loading" });
    void loadRevisionDiffAction({
      pageId,
      revisionIdA: revA.id,
      revisionIdB: revB.id,
    }).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setDiffState({ status: "loaded", a: res.a, b: res.b, diff: res.diff });
      } else {
        setDiffState({ status: "error", message: res.error });
      }
    }).catch((err: unknown) => {
      if (cancelled) return;
      setDiffState({
        status: "error",
        message: err instanceof Error ? err.message : "Failed to load diff.",
      });
    });
    return () => { cancelled = true; };
  }, [pageId, revA.id, revB.id]);

  return (
    <div className="flex flex-col gap-3">
      {/* back + header — hidden in embedded mode */}
      {!embedded ? (
        <>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              style={{
                height: 24,
                padding: "0 8px",
                fontSize: 10.5,
                fontWeight: 500,
                color: CHROME.muted,
                background: "transparent",
                border: `1px solid ${CHROME.line}`,
                borderRadius: 6,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
              aria-label="Back to revision list"
            >
              <BackIcon /> Back
            </button>
            <span style={{ fontSize: 12, fontWeight: 600, color: CHROME.ink }}>
              Comparing v{revA.version} ↔ v{revB.version}
            </span>
          </div>

          <div
            className="rounded-md px-3 py-2 text-[11px] leading-relaxed"
            style={{
              background: CHROME.surface2,
              border: `1px solid ${CHROME.line}`,
              color: CHROME.muted,
            }}
          >
            Side-by-side diff of added, removed, and edited blocks (copy,
            links, images, fill, type, order). Full style sits behind Show
            details. Click{" "}
            <strong style={{ color: CHROME.text }}>Back</strong> then{" "}
            <strong style={{ color: CHROME.text }}>Restore</strong> to roll back.
          </div>
        </>
      ) : null}

      {diffState.status === "loading" && (
        <div className="flex flex-col gap-1.5" aria-busy="true" aria-label="Loading diff">
          {[0, 1].map((i) => (
            <div
              key={i}
              style={{
                height: 32,
                borderRadius: 6,
                background: CHROME.surface,
                border: `1px solid ${CHROME.line}`,
                opacity: 0.6 - i * 0.15,
              }}
            />
          ))}
        </div>
      )}

      {diffState.status === "error" && (
        <div
          className="rounded-md px-3 py-2"
          style={{ fontSize: 11.5, background: CHROME.roseBg, border: `1px solid ${CHROME.roseLine}`, color: CHROME.rose }}
          role="alert"
        >
          {diffState.message}
        </div>
      )}

      {diffState.status === "loaded" && (
        <LoadedDiff
          a={diffState.a}
          b={diffState.b}
          diff={diffState.diff}
          embedded={embedded}
        />
      )}
    </div>
  );
}

function LoadedDiff({
  a,
  b,
  diff,
  embedded,
}: {
  a: RevisionSnapshotSummary;
  b: RevisionSnapshotSummary;
  diff: RevisionStructuredDiff;
  embedded: boolean;
}) {
  const { t } = useEditorLocale();
  const [openDetails, setOpenDetails] = useState<Record<string, boolean>>({});
  const { aRows, bRows } = computeDiff(a.items, b.items);
  const labelA = embedded ? "Published" : "older";
  const labelB = embedded ? "Draft (going live)" : "newer";
  const changed = diff.nodes.filter((n) => n.op === "changed");

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2 items-start">
        <DiffColumn summary={a} rows={aRows} label={labelA} />
        <DiffColumn summary={b} rows={bRows} label={labelB} />
      </div>
      {changed.length === 0 && diff.summary.added === 0 && diff.summary.removed === 0 ? (
        <p style={{ fontSize: 11.5, color: CHROME.muted, margin: 0 }}>{t("No changes")}</p>
      ) : null}
      {changed.map((node) => (
        <div
          key={node.id}
          className="rounded-md px-2.5 py-2"
          style={{ border: `1px solid ${CHROME.line}`, background: CHROME.paper }}
        >
          <div style={{ fontSize: 11.5, fontWeight: 600, color: CHROME.ink }}>
            {node.label}{" "}
            <span style={{ fontWeight: 500, color: CHROME.muted }}>{node.kind}</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-1">
            {node.properties.map((prop) => (
              <span
                key={prop.property}
                className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5"
                style={{
                  fontSize: 10,
                  background: CHROME.surface2,
                  border: `1px solid ${CHROME.line}`,
                  color: CHROME.text,
                }}
              >
                {prop.property}: {prop.before} → {prop.after}
              </span>
            ))}
          </div>
          {node.styleDetails ? (
            <button
              type="button"
              onClick={() =>
                setOpenDetails((prev) => ({ ...prev, [node.id]: !prev[node.id] }))
              }
              style={{
                marginTop: 6,
                fontSize: 10.5,
                color: CHROME.blue,
                background: "none",
                border: 0,
                cursor: "pointer",
                padding: 0,
              }}
            >
              {openDetails[node.id] ? t("Hide details") : t("Show details")}
            </button>
          ) : null}
          {openDetails[node.id] && node.styleDetails
            ? Object.entries(node.styleDetails).map(([key, value]) => (
                <div key={key} style={{ fontSize: 10.5, color: CHROME.muted }}>
                  {key}: {value.before} → {value.after}
                </div>
              ))
            : null}
        </div>
      ))}
      {diff.remainderCount > 0 ? (
        <p style={{ fontSize: 11, color: CHROME.muted, margin: 0 }}>
          {t("+{count} more changes").replace("{count}", String(diff.remainderCount))}
        </p>
      ) : null}
    </div>
  );
}
