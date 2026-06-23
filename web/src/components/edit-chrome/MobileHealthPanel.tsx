"use client";

/**
 * MobileHealthPanel — publish-drawer sub-panel for the Wave-2 "Mobile health
 * checker" (job #34).
 *
 * Shows an advisory checklist of likely mobile problems flagged by
 * `runMobileHealthCheck` (pure analysis, no server I/O). Clicking a row
 * calls `locateCanvasNode` to scroll+flash the block on the canvas — the
 * same mechanism used by the Wave-1 layers-tree bidirectional highlight
 * (freeform-layer-row.tsx, `locateCanvasNode`).
 *
 * Advisory only — never counts toward `preflightBlockingErrors`; publish
 * is never blocked. The panel collapses to a single summary line when all
 * checks pass.
 */

import { useId, useMemo, useState } from "react";

import {
  runMobileHealthCheck,
  type MobileHealthCheckKind,
  type MobileHealthIssue,
} from "@/lib/site-admin/builder-node/mobile-health";
import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";
import { locateCanvasNode } from "./freeform-layer-row";
import { CHROME } from "./kit";

// ── Icon helpers ─────────────────────────────────────────────────────────────

function MobileIcon() {
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
      <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
      <line x1="12" y1="18" x2="12" y2="18" />
    </svg>
  );
}

function ChevronDown({ open }: { open: boolean }) {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      style={{
        transform: open ? "rotate(180deg)" : undefined,
        transition: "transform 160ms ease",
      }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function LocateIcon() {
  return (
    <svg
      width="10"
      height="10"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

// ── Kind labels ───────────────────────────────────────────────────────────────

const KIND_LABEL: Record<MobileHealthCheckKind, string> = {
  tiny_text: "Tiny text",
  tap_target: "Tap target",
  overflow: "Overflow",
};

const KIND_COLOR: Record<MobileHealthCheckKind, string> = {
  tiny_text: "#b45309", // amber-700
  tap_target: "#c2410c", // orange-700
  overflow: "#1d4ed8",   // blue-700
};

// ── Panel component ───────────────────────────────────────────────────────────

interface Props {
  /** The live builder tree from useEditContext(). */
  builderTree: BuilderNodeTree;
}

export function MobileHealthPanel({ builderTree }: Props) {
  const [open, setOpen] = useState(false);
  const bodyId = useId();

  const issues = useMemo(
    () => runMobileHealthCheck(builderTree),
    [builderTree],
  );

  const grouped = useMemo(() => {
    const byKind: Partial<Record<MobileHealthCheckKind, MobileHealthIssue[]>> = {};
    for (const issue of issues) {
      const bucket = byKind[issue.kind] ?? [];
      bucket.push(issue);
      byKind[issue.kind] = bucket;
    }
    return byKind;
  }, [issues]);

  const total = issues.length;
  const allClear = total === 0;

  return (
    <div
      style={{
        borderRadius: 8,
        border: `1px solid ${allClear ? "rgba(34,197,94,0.30)" : CHROME.line}`,
        background: allClear ? "rgba(34,197,94,0.06)" : CHROME.paper,
        overflow: "hidden",
      }}
    >
      {/* ── Header / toggle ─────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          background: "transparent",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
        aria-expanded={open}
        aria-controls={bodyId}
      >
        <span
          style={{
            color: allClear ? "#15803d" : CHROME.text2,
            display: "inline-flex",
          }}
        >
          <MobileIcon />
        </span>
        <span
          style={{
            flex: 1,
            fontSize: 12,
            fontWeight: 600,
            color: allClear ? "#15803d" : CHROME.ink,
          }}
        >
          Mobile health
        </span>
        {allClear ? (
          <span
            style={{
              fontSize: 10.5,
              color: "#15803d",
              fontWeight: 600,
            }}
          >
            All clear
          </span>
        ) : (
          <span
            style={{
              fontSize: 11,
              color: CHROME.muted,
              marginRight: 4,
            }}
          >
            {total} advisory{total === 1 ? "" : "s"}
          </span>
        )}
        <span style={{ color: CHROME.muted2 }}>
          <ChevronDown open={open} />
        </span>
      </button>

      {/* ── Body ─────────────────────────────────────────────────────── */}
      {open ? (
        <div
          id={bodyId}
          style={{
            borderTop: `1px solid ${CHROME.line}`,
            padding: "8px 12px 10px",
          }}
        >
          {allClear ? (
            <p
              style={{
                margin: 0,
                fontSize: 11.5,
                color: "#166534",
                lineHeight: 1.5,
              }}
            >
              No mobile issues detected in the builder tree. Tap targets,
              font sizes, and layout widths all look fine.
            </p>
          ) : (
            <>
              <p
                style={{
                  margin: "0 0 8px",
                  fontSize: 11,
                  lineHeight: 1.5,
                  color: CHROME.muted,
                }}
              >
                Advisory only — these do not block publish. Review them before going
                live on mobile devices.
              </p>
              {(["tiny_text", "tap_target", "overflow"] as const)
                .filter((kind) => (grouped[kind]?.length ?? 0) > 0)
                .map((kind) => (
                  <IssueGroup
                    key={kind}
                    kind={kind}
                    issues={grouped[kind]!}
                  />
                ))}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

// ── IssueGroup ────────────────────────────────────────────────────────────────

function IssueGroup({
  kind,
  issues,
}: {
  kind: MobileHealthCheckKind;
  issues: MobileHealthIssue[];
}) {
  const color = KIND_COLOR[kind];

  return (
    <div
      style={{
        marginBottom: 8,
        borderRadius: 6,
        border: `1px solid rgba(0,0,0,0.07)`,
        overflow: "hidden",
      }}
    >
      {/* Group header */}
      <div
        style={{
          padding: "5px 10px",
          background: "rgba(0,0,0,0.025)",
          display: "flex",
          alignItems: "center",
          gap: 6,
        }}
      >
        <span
          style={{
            display: "inline-block",
            width: 7,
            height: 7,
            borderRadius: 999,
            background: color,
            flexShrink: 0,
          }}
          aria-hidden
        />
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color,
          }}
        >
          {KIND_LABEL[kind]}
        </span>
        <span
          style={{
            marginLeft: "auto",
            fontSize: 10,
            color: CHROME.muted2,
          }}
        >
          {issues.length} item{issues.length === 1 ? "" : "s"}
        </span>
      </div>

      {/* Issue rows */}
      <ul
        style={{
          margin: 0,
          padding: "4px 0",
          listStyle: "none",
        }}
      >
        {issues.map((issue, idx) => (
          <IssueRow key={`${issue.nodeId}-${idx}`} issue={issue} />
        ))}
      </ul>
    </div>
  );
}

// ── IssueRow ──────────────────────────────────────────────────────────────────

function IssueRow({ issue }: { issue: MobileHealthIssue }) {
  return (
    <li
      style={{
        padding: "6px 10px",
        display: "flex",
        alignItems: "flex-start",
        gap: 8,
        borderTop: "1px solid rgba(0,0,0,0.04)",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Node kind badge */}
        <div
          style={{
            marginBottom: 2,
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: CHROME.muted2,
          }}
        >
          {issue.nodeKind.replace(/_/g, " ")}
        </div>
        {/* Message */}
        <p
          style={{
            margin: 0,
            fontSize: 11.5,
            lineHeight: 1.45,
            color: CHROME.text,
          }}
        >
          {issue.message}
        </p>
      </div>

      {/* "Show on canvas" locate button — reuses Wave-1 locateCanvasNode */}
      <button
        type="button"
        onClick={() => locateCanvasNode(issue.nodeId)}
        title={`Scroll canvas to ${issue.nodeId}`}
        style={{
          flexShrink: 0,
          marginTop: 2,
          display: "inline-flex",
          alignItems: "center",
          gap: 4,
          height: 24,
          padding: "0 7px",
          fontSize: 10,
          fontWeight: 600,
          color: CHROME.text2,
          background: CHROME.surface,
          border: `1px solid ${CHROME.lineMid}`,
          borderRadius: 5,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        <LocateIcon />
        Show
      </button>
    </li>
  );
}
