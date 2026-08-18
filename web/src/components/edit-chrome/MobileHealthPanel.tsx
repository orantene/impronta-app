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
 * Mostly advisory. The one exception (W3-M1) is **definite** horizontal
 * overflow (a block whose fixed width/min-width on mobile exceeds the narrowest
 * viewport): those rows are marked `blocking` and are ALSO surfaced as blocking
 * `mobile_overflow` errors by the publish preflight, which disables Publish now.
 * This panel badges them "Blocks publish" so the two surfaces agree; the softer
 * heuristics stay advisory. The panel collapses to a single summary line when
 * all checks pass.
 */

import { useEffect, useId, useMemo, useState } from "react";

import {
  runMobileHealthCheck,
  type MobileHealthCheckKind,
  type MobileHealthIssue,
} from "@/lib/site-admin/builder-node/mobile-health";
import { collectMobileFixes } from "@/lib/site-admin/builder-node/mobile-fix";
import type { BuilderNodeTree } from "@/lib/site-admin/builder-node/types";
import { locateCanvasNode } from "./freeform-layer-row";
import { useMaybeEditContext } from "./edit-context";
import { useEditorLocale } from "./use-editor-locale";
import { Button } from "./kit";
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
  trapped_drawer: "Trapped menu",
};

// Three distinguishable, on-palette hues. No gold/rust in admin chrome, so the
// rust that used to mark tap-target issues is now the violet chrome accent,
// which reads as distinctly against the two blues as the rust did.
const KIND_COLOR: Record<MobileHealthCheckKind, string> = {
  tiny_text: "#2c5fdb", // cool attention blue (CHROME.amber / CHROME.blue)
  tap_target: "#7c3aed", // violet chrome accent (CHROME.accent)
  overflow: "#1d4ed8",   // blue-700
  trapped_drawer: "#0f766e", // teal-700 — distinct from the two blues + violet
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
  const blockingCount = useMemo(
    () => issues.filter((issue) => issue.blocking).length,
    [issues],
  );

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
        ) : blockingCount > 0 ? (
          <span
            style={{
              fontSize: 11,
              color: "#b91c1c",
              fontWeight: 600,
              marginRight: 4,
            }}
          >
            {blockingCount} block{blockingCount === 1 ? "s" : ""} publish
            {total > blockingCount ? ` · ${total - blockingCount} advisory` : ""}
          </span>
        ) : (
          <span
            style={{
              fontSize: 11,
              color: CHROME.muted,
              marginRight: 4,
            }}
          >
            {total} advisor{total === 1 ? "y" : "ies"}
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
                {blockingCount > 0 ? (
                  <>
                    <strong style={{ color: "#b91c1c" }}>
                      Rows marked “Blocks publish” force horizontal scrolling on
                      phones and must be fixed before you can publish.
                    </strong>{" "}
                    The rest are advisory, review them before going live.
                  </>
                ) : (
                  <>
                    Advisory only, these do not block publish. Review them before
                    going live on mobile devices.
                  </>
                )}
              </p>
              <FixMobileIssuesAction builderTree={builderTree} />
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

// ── Fix mobile issues (W3-M3) ─────────────────────────────────────────────────

function WandIcon() {
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
      <path d="M15 4V2" />
      <path d="M15 16v-2" />
      <path d="M8 9h2" />
      <path d="M20 9h2" />
      <path d="M17.8 11.8 19 13" />
      <path d="M15 9h.01" />
      <path d="M17.8 6.2 19 5" />
      <path d="m3 21 9-9" />
      <path d="M12.2 6.2 11 5" />
    </svg>
  );
}

type FixApplyState = "idle" | "applying" | "done" | "error";

/**
 * The one-click "Fix mobile issues" action. Turns every fixable mobile problem
 * (fixed-width overflow that blocks publish + the soft multi-column / split
 * advisories) into an APPLIED, undoable responsive override via the context's
 * `fixAllMobileIssues` (one Cmd+Z reverts the whole batch). Every state is
 * explicit: idle → applying → done ("Fixed N issues") → error. Detection re-runs
 * automatically because the committed tree flows back through `builderTree`, so
 * the panel reflects the (hopefully clean) new state.
 *
 * Renders nothing when there is no edit context or nothing fixable — the softer
 * tiny-text / tap-target advisories stay advisory-only (their correct value is a
 * judgement call, so they are never auto-fixed).
 */
function FixMobileIssuesAction({ builderTree }: { builderTree: BuilderNodeTree }) {
  const ctx = useMaybeEditContext();
  const { t } = useEditorLocale();
  const [state, setState] = useState<FixApplyState>("idle");
  const [fixedCount, setFixedCount] = useState(0);

  const fixableCount = useMemo(
    () => collectMobileFixes(builderTree).length,
    [builderTree],
  );

  // Re-detection reset: once the tree changes and there are fixable issues
  // again, drop any prior "done" summary back to an actionable button.
  useEffect(() => {
    if (state === "done" && fixableCount > 0) setState("idle");
  }, [state, fixableCount]);

  if (!ctx?.fixAllMobileIssues) return null;

  // Success summary (persists until the tree changes / new fixables appear).
  if (state === "done") {
    const label =
      fixedCount === 1
        ? t("Fixed {count} mobile issue").replace("{count}", String(fixedCount))
        : t("Fixed {count} mobile issues").replace("{count}", String(fixedCount));
    return (
      <div
        role="status"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 10,
          padding: "8px 10px",
          borderRadius: 7,
          border: "1px solid rgba(34,197,94,0.30)",
          background: "rgba(34,197,94,0.08)",
          fontSize: 11.5,
          fontWeight: 600,
          color: "#15803d",
        }}
      >
        <CheckIcon />
        {label}
      </div>
    );
  }

  if (fixableCount === 0) return null;

  async function onFix() {
    if (!ctx?.fixAllMobileIssues || state === "applying") return;
    setState("applying");
    try {
      const result = await ctx.fixAllMobileIssues();
      if (result.ok) {
        setFixedCount(result.fixedCount);
        setState("done");
      } else {
        setState("error");
      }
    } catch {
      setState("error");
    }
  }

  return (
    <div style={{ marginBottom: 10 }}>
      <Button
        variant="primary"
        size="sm"
        leadingIcon={<WandIcon />}
        loading={state === "applying"}
        onClick={() => void onFix()}
        style={{ width: "100%" }}
      >
        {state === "applying" ? t("Fixing…") : t("Fix mobile issues")}
      </Button>
      {state === "error" ? (
        <p
          role="alert"
          style={{
            margin: "6px 2px 0",
            fontSize: 11,
            lineHeight: 1.45,
            color: "#b91c1c",
          }}
        >
          {t("Could not fix mobile issues. Please try again.")}
        </p>
      ) : (
        <p
          style={{
            margin: "5px 2px 0",
            fontSize: 10.5,
            lineHeight: 1.4,
            color: CHROME.muted,
          }}
        >
          {t("One click applies mobile-safe overrides.")}
        </p>
      )}
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <polyline points="20 6 9 17 4 12" />
    </svg>
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
        {/* Node kind badge + blocking pill */}
        <div
          style={{
            marginBottom: 2,
            display: "flex",
            alignItems: "center",
            gap: 6,
            fontSize: 9.5,
            fontWeight: 700,
            letterSpacing: "0.06em",
            textTransform: "uppercase",
            color: CHROME.muted2,
          }}
        >
          <span>{issue.nodeKind.replace(/_/g, " ")}</span>
          {issue.blocking ? (
            <span
              style={{
                borderRadius: 4,
                border: "1px solid rgba(185,28,28,0.4)",
                background: "rgba(185,28,28,0.08)",
                color: "#b91c1c",
                padding: "1px 5px",
                letterSpacing: "0.04em",
              }}
            >
              Blocks publish
            </span>
          ) : null}
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
