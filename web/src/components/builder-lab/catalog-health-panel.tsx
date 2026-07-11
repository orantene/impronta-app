"use client";

/**
 * CatalogHealthPanel (D8) — the top-of-Catalog triage strip.
 *
 * Renders the four health buckets the PURE `analyzeCatalogHealth` derives
 * (orphaned category / unsatisfiable binding / dead weight / asymmetric
 * surface) as a compact, dismissible strip above the Catalog views. Each bucket
 * shows its count; expanding a bucket lists the offending rows, and clicking a
 * row jumps to it (the host reuses the same jump O10/O6 wired —
 * `handleAllIndexJump`-style) via `onJumpToIssue`.
 *
 * Zero-issue state collapses to a single "all clear" line so the strip never
 * shouts when the Catalog is healthy. All visuals use the shared `LAB` tokens.
 */

import { useState } from "react";

import type {
  CatalogHealthIssue,
  CatalogHealthReport,
} from "./catalog-health";
import { LAB as T, LabBadge, LabChip, RADII } from "./ui";

export interface CatalogHealthPanelProps {
  report: CatalogHealthReport;
  /** Jump to an offending row — the host maps this to the gallery/manager jump
   *  (mirrors `handleAllIndexJump`). */
  onJumpToIssue?: (issue: CatalogHealthIssue) => void;
}

export function CatalogHealthPanel({
  report,
  onJumpToIssue,
}: CatalogHealthPanelProps) {
  // Which bucket is expanded (single-open accordion, matching the Lab's
  // one-open editor convention). null ⇒ all collapsed.
  const [openBucket, setOpenBucket] = useState<string | null>(null);

  const total = report.totalIssues;
  // Healthy → a quiet all-clear line; nothing to triage.
  if (total === 0) {
    return (
      <div
        data-testid="lab-catalog-health"
        data-health-total="0"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          borderRadius: RADII.card,
          border: `1px solid ${T.borderSoft}`,
          background: T.cardSoft,
          color: T.inkMuted,
          fontSize: 12,
        }}
      >
        <span aria-hidden style={{ color: T.accent, fontWeight: 700 }}>
          ✓
        </span>
        Catalog health: no orphans, unsatisfiable bindings, dead weight, or
        asymmetric surfaces.
      </div>
    );
  }

  return (
    <div
      data-testid="lab-catalog-health"
      data-health-total={total}
      style={{
        borderRadius: RADII.card,
        border: `1px solid ${T.border}`,
        background: T.card,
        overflow: "hidden",
      }}
    >
      {/* Header — total + bucket pills. */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
          padding: "10px 12px",
          borderBottom: `1px solid ${T.borderSoft}`,
        }}
      >
        <LabBadge tone="custom" bg={T.redBg} fg={T.red}>
          {total} {total === 1 ? "issue" : "issues"}
        </LabBadge>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: T.ink }}>
          Catalog health
        </span>
        <span style={{ fontSize: 11, color: T.inkDim }}>
          Triage orphans, unsatisfiable bindings, dead weight, and asymmetric
          surfaces.
        </span>
      </div>

      {/* Four bucket rows. */}
      <div role="list" aria-label="Catalog health buckets">
        {report.buckets.map((bucket) => (
          <CatalogHealthBucketRow
            key={bucket.key}
            bucketKey={bucket.key}
            title={bucket.title}
            blurb={bucket.blurb}
            issues={bucket.issues}
            open={openBucket === bucket.key}
            onToggle={() =>
              setOpenBucket((cur) =>
                cur === bucket.key ? null : bucket.key,
              )
            }
            onJumpToIssue={onJumpToIssue}
          />
        ))}
      </div>
    </div>
  );
}

function CatalogHealthBucketRow({
  bucketKey,
  title,
  blurb,
  issues,
  open,
  onToggle,
  onJumpToIssue,
}: {
  bucketKey: string;
  title: string;
  blurb: string;
  issues: CatalogHealthIssue[];
  open: boolean;
  onToggle: () => void;
  onJumpToIssue?: (issue: CatalogHealthIssue) => void;
}) {
  const count = issues.length;
  const empty = count === 0;
  const expanded = open && !empty;

  return (
    <div role="listitem" style={{ borderTop: `1px solid ${T.borderSoft}` }}>
      <button
        type="button"
        data-testid={`lab-health-bucket-${bucketKey}`}
        data-health-count={count}
        aria-expanded={expanded}
        disabled={empty}
        onClick={onToggle}
        className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5DD3A0]/60"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          width: "100%",
          textAlign: "left",
          padding: "9px 12px",
          background: "transparent",
          border: "none",
          color: T.ink,
          cursor: empty ? "default" : "pointer",
          opacity: empty ? 0.65 : 1,
        }}
      >
        {!empty && (
          <span
            aria-hidden
            style={{
              display: "inline-block",
              width: 8,
              transition: "transform 120ms",
              transform: expanded ? "rotate(90deg)" : "none",
              color: T.inkMuted,
              fontSize: 10,
            }}
          >
            ▶
          </span>
        )}
        {empty && (
          <span aria-hidden style={{ width: 8, color: T.accent, fontSize: 10 }}>
            ✓
          </span>
        )}
        <LabChip tone={empty ? "accent" : "neutral"}>{count}</LabChip>
        <span style={{ fontSize: 12.5, fontWeight: 600 }}>{title}</span>
        <span
          style={{
            fontSize: 11,
            color: T.inkDim,
            flex: "1 1 auto",
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {blurb}
        </span>
      </button>

      {expanded && (
        <ul
          style={{
            listStyle: "none",
            margin: 0,
            padding: "0 12px 10px 30px",
            display: "flex",
            flexDirection: "column",
            gap: 4,
          }}
        >
          {issues.map((issue, i) => (
            <li key={`${issue.dbTemplateId ?? issue.rowId ?? "x"}-${i}`}>
              <button
                type="button"
                data-testid={`lab-health-issue-${bucketKey}`}
                onClick={() => onJumpToIssue?.(issue)}
                className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5DD3A0]/60"
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: 1,
                  width: "100%",
                  textAlign: "left",
                  padding: "6px 9px",
                  borderRadius: RADII.control,
                  background: T.cardSoft,
                  border: `1px solid ${T.borderSoft}`,
                  color: T.ink,
                  cursor: onJumpToIssue ? "pointer" : "default",
                }}
              >
                <span style={{ fontSize: 12, fontWeight: 600 }}>
                  {issue.label}
                </span>
                <span style={{ fontSize: 10.5, color: T.inkMuted }}>
                  {issue.detail}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
