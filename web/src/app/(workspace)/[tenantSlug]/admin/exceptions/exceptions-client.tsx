"use client";

/**
 * The Exceptions queue, rendered.
 *
 * THE IDEMPOTENCY KEY IS MINTED PER ROW ON MOUNT, NOT PER CLICK. That is the
 * whole reason the client holds one at all: a key minted inside the handler
 * would be different on every press, and three anxious taps on "issue the
 * missing tickets" would be three intents rather than one. Minted per row and
 * held, the second and third press land on the same claim and are told the
 * first is still running — which is true, and is the answer the operator
 * needs.
 *
 * A ROW THAT NEEDS A PERSON HAS NO BUTTON. Not a disabled one — none. The
 * model expresses that as `nextAction.kind === "inspect"`, and this component
 * has no branch that can render a control for it, so a later edit cannot
 * accidentally re-enable a second refund.
 *
 * AFTER A SUCCESSFUL RESUME THE ROW STAYS, WEARING ITS RESULT. Removing it
 * would claim the underlying problem is fixed, and three of the four verbs
 * only ARM a worker — the effect happens up to a minute later and can fail
 * again. The row disappears on the next load, when the source query no longer
 * returns it, which is the only honest signal that it is actually gone.
 */

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import { newCommandId } from "@/lib/commands/envelope";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import type { ExceptionRow, ExceptionSeverity, ExceptionSummary } from "@/lib/exceptions/model";
import { resumeExceptionAction } from "../_exceptions-actions";

const K = "dashboard.issues";

// Reads the workspace theme rather than carrying its own palette. A hardcoded
// hex here would survive a rebrand and put an unthemed panel in the middle of a
// themed admin — and severity is exactly the wrong place to be off-brand, since
// "critical" has to look like this workspace's critical. The `--tl-*` tokens
// are the marketing scale the admin surfaces already alias.
const C = {
  ink: "var(--tl-ink)",
  inkMuted: "var(--tl-muted)",
  inkDim: "var(--tl-muted-soft)",
  border: "var(--tl-hairline)",
  borderSoft: "var(--tl-hairline)",
  card: "var(--tl-surface-raised)",
  surface: "var(--tl-surface)",
  critical: "var(--tl-error)",
  criticalSoft: "var(--tl-error-bg)",
  high: "var(--tl-warning)",
  highSoft: "var(--tl-warning-bg)",
  normal: "var(--tl-muted)",
  normalSoft: "var(--tl-surface-deep)",
  accent: "var(--tl-info)",
  onAccent: "var(--tl-on-inverse)",
} as const;

const SEVERITY_CHROME: Record<ExceptionSeverity, { fg: string; bg: string }> = {
  critical: { fg: C.critical, bg: C.criticalSoft },
  high: { fg: C.high, bg: C.highSoft },
  normal: { fg: C.normal, bg: C.normalSoft },
};

const OWNER_KEY: Record<string, string> = {
  money: "money",
  door: "door",
  coordination: "coordination",
  operations: "operations",
};

/**
 * `t` is threaded in rather than closed over at module scope, since
 * `useT()` is only callable inside a component — the label text is the only
 * translatable part, everything else here is a pure duration calculation.
 */
function ageLabel(iso: string, t: (key: string) => string): string {
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms)) return t(`${K}.ageUnknown`);
  const m = ms / 60_000;
  if (m < 1) return t(`${K}.ageJustNow`);
  if (m < 60) return `${Math.floor(m)}m`;
  const h = m / 60;
  if (h < 24) return `${Math.floor(h)}h`;
  return `${Math.floor(h / 24)}d`;
}

type RowState = { pending: boolean; message: string | null; failed: boolean };

export function ExceptionsClient({
  rows,
  summary,
  unavailable,
}: {
  rows: ExceptionRow[];
  summary: ExceptionSummary;
  unavailable: string[];
}) {
  const t = useT();
  const [state, setState] = useState<Record<string, RowState>>({});

  // One key per row, for the life of this mount. See the header.
  const keys = useMemo(() => {
    const map: Record<string, string> = {};
    for (const row of rows) map[row.key] = `exc-${row.key}-${newCommandId()}`;
    return map;
  }, [rows]);

  const resume = useCallback(
    async (row: ExceptionRow) => {
      if (row.nextAction.kind !== "resume") return;
      setState((s) => ({ ...s, [row.key]: { pending: true, message: null, failed: false } }));
      const result = await resumeExceptionAction({
        verb: row.nextAction.verb,
        sourceId: row.sourceId,
        idempotencyKey: keys[row.key] ?? `exc-${row.key}`,
      });
      setState((s) => ({
        ...s,
        [row.key]: {
          pending: false,
          // A KEYED ANSWER IS TRANSLATED; ANYTHING ELSE IS THE RUNNER'S OWN
          // ENGLISH. The key is preferred because it names a decision the
          // operator has to act on, and this surface ships in three languages.
          message: result.ok
            ? result.message
            : result.messageKey
              ? t(`${K}.result.${result.messageKey}`)
              : result.error,
          failed: !result.ok,
        },
      }));
    },
    [keys, t],
  );

  return (
    <main style={{ padding: "32px 28px", maxWidth: 1080, margin: "0 auto", color: C.ink }}>
      <header>
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: C.inkMuted,
            textTransform: "uppercase",
            letterSpacing: 0.6,
          }}
        >
          {t(`${K}.eyebrow`)}
        </div>
        <h1 style={{ margin: "4px 0 0", fontSize: 26, fontWeight: 600, letterSpacing: -0.2 }}>
          {summary.total === 0
            ? t(`${K}.titleEmpty`)
            : interpolate(t(summary.total === 1 ? `${K}.titleOne` : `${K}.titleOther`), { count: summary.total })}
        </h1>
        <p style={{ margin: "6px 0 0", fontSize: 13, color: C.inkMuted, maxWidth: 660, lineHeight: 1.5 }}>
          {t(`${K}.subtitle`)}
        </p>
      </header>

      {unavailable.length > 0 && (
        <div
          role="alert"
          style={{
            marginTop: 18,
            padding: "12px 16px",
            borderRadius: 12,
            background: C.criticalSoft,
            border: `1px solid rgba(127,29,29,0.25)`,
            color: C.critical,
            fontSize: 13,
          }}
        >
          {interpolate(t(`${K}.incomplete`), { sources: unavailable.join(", ") })}
        </div>
      )}

      {summary.total > 0 && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 18 }}>
          {(["critical", "high", "normal"] as const).map((severity) =>
            summary.bySeverity[severity] > 0 ? (
              <span
                key={severity}
                style={{
                  fontSize: 11.5,
                  fontWeight: 700,
                  padding: "4px 10px",
                  borderRadius: 999,
                  background: SEVERITY_CHROME[severity].bg,
                  color: SEVERITY_CHROME[severity].fg,
                }}
              >
                {interpolate(t(`${K}.severityCount`), {
                  count: summary.bySeverity[severity],
                  severity: t(`${K}.severity.${severity}Lower`),
                })}
              </span>
            ) : null,
          )}
        </div>
      )}

      {summary.total === 0 && unavailable.length === 0 ? (
        <div
          style={{
            marginTop: 22,
            background: C.card,
            border: `1px dashed ${C.border}`,
            borderRadius: 14,
            padding: "36px 22px",
            textAlign: "center",
            color: C.inkMuted,
            fontSize: 13,
          }}
        >
          {t(`${K}.allClear`)}
        </div>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: "22px 0 0", display: "grid", gap: 10 }}>
          {rows.map((row) => {
            const chrome = SEVERITY_CHROME[row.severity];
            const rowState = state[row.key];
            return (
              <li
                key={row.key}
                style={{
                  background: C.card,
                  border: `1px solid ${row.severity === "critical" ? "rgba(127,29,29,0.25)" : C.borderSoft}`,
                  borderRadius: 14,
                  padding: "14px 18px",
                }}
              >
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: 0.4,
                      textTransform: "uppercase",
                      padding: "2px 8px",
                      borderRadius: 999,
                      background: chrome.bg,
                      color: chrome.fg,
                    }}
                  >
                    {t(`${K}.severity.${row.severity}`)}
                  </span>
                  <span style={{ fontSize: 11.5, color: C.inkDim }}>
                    {t(`${K}.owner.${OWNER_KEY[row.owner] ?? row.owner}`)}
                  </span>
                  <span style={{ flex: 1 }} />
                  {row.attempts > 0 && (
                    <span style={{ fontSize: 11.5, color: C.inkDim }}>
                      {interpolate(t(row.attempts === 1 ? `${K}.attemptsOne` : `${K}.attemptsOther`), {
                        count: row.attempts,
                      })}
                    </span>
                  )}
                  <span style={{ fontSize: 11.5, color: C.inkMuted }}>
                    {interpolate(t(`${K}.ageOld`), { age: ageLabel(row.firstSeenAt, t) })}
                  </span>
                </div>

                <div style={{ marginTop: 6, fontSize: 15, fontWeight: 600 }}>{row.title}</div>
                <div style={{ marginTop: 3, fontSize: 13, color: C.inkMuted, lineHeight: 1.5 }}>
                  {row.detail}
                </div>

                <div
                  style={{
                    marginTop: 12,
                    display: "flex",
                    gap: 10,
                    alignItems: "center",
                    flexWrap: "wrap",
                  }}
                >
                  {row.nextAction.kind === "resume" ? (
                    <button
                      type="button"
                      onClick={() => void resume(row)}
                      disabled={rowState?.pending === true}
                      style={{
                        fontSize: 12.5,
                        fontWeight: 600,
                        padding: "7px 14px",
                        borderRadius: 999,
                        border: `1px solid ${C.accent}`,
                        background: C.accent,
                        color: C.onAccent,
                        cursor: rowState?.pending ? "progress" : "pointer",
                      }}
                    >
                      {rowState?.pending ? t(`${K}.working`) : row.nextAction.label}
                    </button>
                  ) : (
                    <span
                      style={{
                        fontSize: 12.5,
                        color: C.inkMuted,
                        background: C.surface,
                        border: `1px solid ${C.borderSoft}`,
                        borderRadius: 999,
                        padding: "7px 14px",
                      }}
                    >
                      {row.nextAction.why}
                    </span>
                  )}

                  {row.href && (
                    <Link
                      href={row.href}
                      style={{ fontSize: 12.5, fontWeight: 600, color: C.accent, textDecoration: "none" }}
                    >
                      {row.nextAction.kind === "inspect" ? row.nextAction.label : t(`${K}.open`)} ›
                    </Link>
                  )}

                  {rowState?.message && (
                    <span
                      role="status"
                      style={{
                        fontSize: 12.5,
                        color: rowState.failed ? C.critical : C.inkMuted,
                      }}
                    >
                      {rowState.message}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
