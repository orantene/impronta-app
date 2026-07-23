"use client";

/**
 * Revision history + publish-time changelog UI for the Template Manager
 * (Builder Studio WS-D D4). Extracted from template-manager.tsx to keep that
 * file under the 800-line cap. Renders with the shared Lab design-system
 * primitives (`LAB`, `fieldStyle`) so it matches the rest of the Lab chrome.
 *
 *   - RevisionList: the per-template revision trail (version · status · date ·
 *     changelog note) with Restore-to-draft and Roll-back actions (D2).
 *   - PublishNotePanel: the optional "Changelog" input shown when publishing,
 *     threaded to publishTemplate (D4).
 */

import { useEffect, useState } from "react";

import {
  listTemplateRevisions,
  type TemplateRevisionSummary,
} from "@/lib/site-admin/builder-core/templates/registry-admin-actions";
import type {
  TemplateTreeDiff,
  PublishChecklist,
} from "@/lib/site-admin/builder-core/templates/validate-publish";
import { LAB, fieldStyle } from "./ui";

const ghostMini: React.CSSProperties = {
  padding: "3px 9px",
  borderRadius: 8,
  border: `1px solid ${LAB.border}`,
  background: "transparent",
  color: LAB.ink,
  fontSize: 11,
  fontWeight: 600,
  cursor: "pointer",
};

/** Compact date for a revision row (e.g. "Jun 15"). Falls back to "" on bad input. */
function fmtRevDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ── Revision trail (D2) ───────────────────────────────────────────────────────

export function RevisionList({
  templateId,
  onRestore,
  onRollback,
}: {
  templateId: string;
  onRestore: (version: number) => void;
  onRollback: (version: number) => void;
}) {
  const [revs, setRevs] = useState<TemplateRevisionSummary[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await listTemplateRevisions(templateId).catch(() => null);
      if (cancelled) return;
      if (!res || !res.ok) {
        setErr(res?.error ?? "Could not load revisions.");
        setRevs([]);
        return;
      }
      setRevs(res.data);
    })();
    return () => {
      cancelled = true;
    };
  }, [templateId]);

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${LAB.borderSoft}` }}>
      {err ? (
        <div style={{ fontSize: 11.5, color: LAB.red }}>{err}</div>
      ) : revs === null ? (
        <div style={{ fontSize: 11.5, color: LAB.inkMuted }}>Loading revisions…</div>
      ) : revs.length === 0 ? (
        <div style={{ fontSize: 11.5, color: LAB.inkMuted }}>
          No published revisions yet. Publish to create the first snapshot.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          {revs.map((r) => (
            <div
              key={r.version}
              style={{ display: "flex", alignItems: "center", gap: 10, fontSize: 11.5, color: LAB.inkMuted }}
            >
              <span style={{ fontFamily: "ui-monospace, monospace" }}>v{r.version}</span>
              <span>{r.status}</span>
              <span style={{ color: LAB.inkDim, whiteSpace: "nowrap" }}>{fmtRevDate(r.created_at)}</span>
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  color: r.note ? LAB.ink : LAB.inkDim,
                  fontStyle: r.note ? "normal" : "italic",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
                title={r.note ?? undefined}
              >
                {r.note ?? "No changelog"}
              </span>
              <button
                type="button"
                onClick={() => onRestore(r.version)}
                style={ghostMini}
                title="Copy this revision's content onto the live draft (does not publish)."
              >
                Restore to draft
              </button>
              <button
                type="button"
                onClick={() => onRollback(r.version)}
                style={{ ...ghostMini, color: LAB.accent, borderColor: LAB.accent }}
                title="Re-publish this revision's content as a new version (one-click rollback)."
              >
                Roll back to this version
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Publish-time changelog panel (D4) ─────────────────────────────────────────

/**
 * Inline panel shown when the admin clicks Publish. The changelog note is
 * optional — leaving it blank publishes exactly as before (note → null). On
 * confirm the note is threaded to publishTemplate, which stamps it on both the
 * revision snapshot and the template row's `changelog` convenience column.
 *
 * `treeDiff` (G3) is advisory — when supplied, shows "No changes since v(N) —
 * re-publishing only bumps the version" or "Tree changed since v(N)" before
 * the admin confirms, so they can decide whether the publish is intentional.
 * `publishedVersion` is the last published version number (for the label).
 */
export function PublishNotePanel({
  value,
  busy,
  ctaLabel,
  treeDiff,
  publishedVersion,
  checklist,
  onChange,
  onCancel,
  onConfirm,
}: {
  value: string;
  busy: boolean;
  ctaLabel: string;
  /** Advisory diff result from getPublishDiff. Omitting it hides the hint. */
  treeDiff?: TemplateTreeDiff | null;
  /** Last published version number — shown in the diff hint label. */
  publishedVersion?: number | null;
  /**
   * A6 — pre-publish checklist (has content / bindings / description /
   * thumbnail / changelog). When supplied, the panel shows the pass/fail rows
   * and DISABLES confirm while a blocking row fails — so the admin sees what's
   * missing BEFORE shipping, replacing the old post-failure error.
   */
  checklist?: PublishChecklist | null;
  onChange: (v: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  // A6 — blocking-row failure hard-disables confirm (was the window.confirm gate).
  const blocked = checklist != null && !checklist.canPublish;
  // Build the diff hint line when the verdict is available (G3).
  const diffHint: { text: string; tone: string } | null = (() => {
    if (!treeDiff) return null;
    const vLabel =
      treeDiff.hasPrevious && publishedVersion != null
        ? `v${publishedVersion}`
        : null;
    if (!treeDiff.changed) {
      return {
        text: vLabel
          ? `No changes since ${vLabel}, re-publishing only bumps the version.`
          : "No changes since last publish, re-publishing only bumps the version.",
        tone: LAB.accent,
      };
    }
    return {
      text: vLabel
        ? `Tree changed since ${vLabel}.`
        : "Tree changed since last publish.",
      tone: LAB.inkMuted,
    };
  })();

  return (
    <div
      style={{
        marginTop: 10,
        paddingTop: 10,
        borderTop: `1px solid ${LAB.borderSoft}`,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      {checklist ? (
        <div
          data-testid="publish-checklist"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 5,
            background: "rgba(255,255,255,0.03)",
            border: `1px solid ${LAB.borderSoft}`,
            borderRadius: 8,
            padding: "8px 10px",
          }}
        >
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              letterSpacing: 0.4,
              textTransform: "uppercase",
              color: LAB.inkMuted,
            }}
          >
            Pre-publish checklist
          </span>
          {checklist.rows.map((r) => {
            const tone = r.pass
              ? LAB.accent
              : r.blocking
                ? LAB.red
                : LAB.inkMuted;
            return (
              <div
                key={r.key}
                data-testid={`publish-check-${r.key}`}
                style={{ display: "flex", alignItems: "baseline", gap: 7, fontSize: 11.5 }}
              >
                <span aria-hidden style={{ color: tone, fontWeight: 700, width: 12 }}>
                  {r.pass ? "✓" : r.blocking ? "✕" : "!"}
                </span>
                <span style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
                  <span style={{ color: r.pass ? LAB.ink : tone, fontWeight: 600 }}>
                    {r.label}
                    {!r.pass && !r.blocking ? (
                      <span style={{ color: LAB.inkDim, fontWeight: 500 }}> · optional</span>
                    ) : null}
                  </span>
                  {!r.pass && r.detail ? (
                    <span style={{ color: LAB.inkDim, fontSize: 11 }}>{r.detail}</span>
                  ) : null}
                </span>
              </div>
            );
          })}
          {blocked ? (
            <div style={{ fontSize: 11, color: LAB.red, marginTop: 2 }}>
              Fix the blocking items above before publishing.
            </div>
          ) : checklist.hasWarnings ? (
            <div style={{ fontSize: 11, color: LAB.inkMuted, marginTop: 2 }}>
              Optional items are missing, you can still publish.
            </div>
          ) : null}
        </div>
      ) : null}
      {diffHint ? (
        <div
          style={{
            fontSize: 11.5,
            color: diffHint.tone,
            background: diffHint.tone === LAB.accent
              ? "rgba(93,211,160,0.08)"
              : "rgba(255,255,255,0.04)",
            borderRadius: 7,
            padding: "5px 10px",
          }}
        >
          {diffHint.text}
        </div>
      ) : null}
      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 600,
            letterSpacing: 0.4,
            textTransform: "uppercase",
            color: LAB.inkMuted,
          }}
        >
          Changelog (optional)
        </span>
        <input
          style={{ ...fieldStyle, width: "100%", outline: "none" }}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="What changed in this version? (shown in revision history)"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter" && !busy && !blocked) onConfirm();
            else if (e.key === "Escape") onCancel();
          }}
        />
      </label>
      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          style={{
            padding: "6px 12px",
            borderRadius: 8,
            border: `1px solid ${LAB.border}`,
            background: "transparent",
            color: LAB.ink,
            fontSize: 11.5,
            fontWeight: 600,
            cursor: busy ? "default" : "pointer",
          }}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={onConfirm}
          disabled={busy || blocked}
          title={
            blocked
              ? "Resolve the blocking checklist items before publishing."
              : undefined
          }
          style={{
            padding: "6px 13px",
            borderRadius: 8,
            border: "none",
            background: LAB.accent,
            color: LAB.accentInk,
            fontSize: 11.5,
            fontWeight: 700,
            opacity: busy || blocked ? 0.5 : 1,
            cursor: busy || blocked ? "default" : "pointer",
          }}
        >
          {ctaLabel}
        </button>
      </div>
    </div>
  );
}
