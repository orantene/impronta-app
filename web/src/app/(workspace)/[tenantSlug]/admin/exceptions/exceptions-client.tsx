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
import {
  MOBILE_BUTTON_PRIMARY,
  MOBILE_BUTTON_SECONDARY,
  MobileCard,
  MobileEyebrow,
  MobileNote,
  MobilePill,
  MobileRow,
  MobileSheet,
  type MobilePillTone,
} from "@/components/admin/shell/internal/page-modules/MobileSheet";

const SEVERITY_PILL: Record<ExceptionSeverity, MobilePillTone> = {
  critical: "red",
  high: "coral",
  normal: "slate",
};

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

/** A label on the left, a value on the right (MW03's facts card). */
function KV({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-[12px] border-b border-admin-border-soft py-[6px] text-[13px] last:border-b-0">
      <span className="text-admin-ink-muted">{label}</span>
      <span className="text-right font-medium text-admin-ink tabular-nums">{value}</span>
    </div>
  );
}

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
  // MW03/MW04: on the phone a row opens as a sheet with the facts, what can
  // be done, and the result once it is done.
  const [openKey, setOpenKey] = useState<string | null>(null);
  const openRow = openKey ? (rows.find((r) => r.key === openKey) ?? null) : null;

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
    <main style={{ padding: "32px 28px", maxWidth: 1080, margin: "0 auto", color: C.ink }} className="max-[720px]:p-0!">
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
        <h1 style={{ margin: "4px 0 0", fontSize: 26, fontWeight: 600, letterSpacing: -0.2 }} className="max-[720px]:text-[22px]!">
          {summary.total === 0
            ? t(`${K}.titleEmpty`)
            : interpolate(t(summary.total === 1 ? `${K}.titleOne` : `${K}.titleOther`), { count: summary.total })}
        </h1>
        <p style={{ margin: "6px 0 0", fontSize: 13, color: C.inkMuted, maxWidth: 660, lineHeight: 1.5 }} className="max-[720px]:hidden">
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
        <ul style={{ listStyle: "none", padding: 0, margin: "22px 0 0", display: "grid", gap: 10 }} className="max-[720px]:mt-[12px]! max-[720px]:gap-0! max-[720px]:overflow-hidden max-[720px]:rounded-[14px] max-[720px]:border max-[720px]:border-admin-border max-[720px]:bg-admin-card">
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
                className="max-[720px]:rounded-none! max-[720px]:border-x-0! max-[720px]:border-b-0! max-[720px]:border-t! max-[720px]:border-t-admin-border-soft! max-[720px]:p-0! max-[720px]:first:border-t-0!"
              >
                {/* MW03: the phone's row — title, detail, the severity pill — opens the sheet. */}
                <button
                  type="button"
                  onClick={() => setOpenKey(row.key)}
                  className="hidden w-full cursor-pointer items-center gap-[10px] border-0 bg-transparent px-[14px] py-[12px] text-left max-[720px]:flex"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[14.5px] font-semibold leading-[1.3] text-admin-ink">{row.title}</span>
                    <span className="mt-[2px] block text-[12.5px] leading-[1.35] text-admin-ink-muted">
                      {t(`${K}.owner.${OWNER_KEY[row.owner] ?? row.owner}`)} · {interpolate(t(`${K}.ageOld`), { age: ageLabel(row.firstSeenAt, t) })}
                      {rowState?.message ? ` · ${rowState.message}` : ""}
                    </span>
                  </span>
                  <MobilePill tone={SEVERITY_PILL[row.severity]}>{t(`${K}.severity.${row.severity}`)}</MobilePill>
                </button>
                <div className="contents max-[720px]:hidden">
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
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {/* MW03 · MW04: the issue as a sheet — the facts, what can be done, the
          result. The sheet closes on "Back to Today"; the row keeps its
          result until the next load, as the desktop rows do. */}
      <MobileSheet
        open={openRow !== null}
        name="issue"
        title={openRow?.title ?? ""}
        closeLabel={t("dashboard.mobile.close")}
        onClose={() => setOpenKey(null)}
        footer={
          openRow ? (
            openRow.nextAction.kind === "resume" ? (
              <button
                type="button"
                onClick={() => void resume(openRow)}
                disabled={state[openRow.key]?.pending === true || (state[openRow.key]?.message != null && !state[openRow.key]?.failed)}
                className={MOBILE_BUTTON_PRIMARY}
              >
                {state[openRow.key]?.pending ? t(`${K}.working`) : openRow.nextAction.label}
              </button>
            ) : openRow.href ? (
              <Link href={openRow.href} className={MOBILE_BUTTON_PRIMARY}>
                {openRow.nextAction.label}
              </Link>
            ) : null
          ) : null
        }
      >
        {openRow ? (
          <>
            <MobileCard>
              <div className="px-[14px] py-[14px]">
                <div className="flex items-center gap-[8px]">
                  <span className="text-[18px] font-semibold text-admin-ink">{t(`${K}.severity.${openRow.severity}`)}</span>
                  <MobilePill tone={SEVERITY_PILL[openRow.severity]}>{t(`${K}.owner.${OWNER_KEY[openRow.owner] ?? openRow.owner}`)}</MobilePill>
                </div>
                <div className="mt-[4px] text-[12.5px] text-admin-ink-muted">{openRow.detail}</div>
              </div>
            </MobileCard>
            <MobileCard>
              <div className="px-[14px] py-[4px]">
                <KV label={t(`${K}.sheet.age`)} value={interpolate(t(`${K}.ageOld`), { age: ageLabel(openRow.firstSeenAt, t) })} />
                <KV label={t(`${K}.sheet.attempts`)} value={String(openRow.attempts)} />
                <KV label={t(`${K}.sheet.owner`)} value={t(`${K}.owner.${OWNER_KEY[openRow.owner] ?? openRow.owner}`)} />
              </div>
            </MobileCard>
            <MobileEyebrow>{t(`${K}.sheet.whatYouCanDo`)}</MobileEyebrow>
            <MobileCard>
              {openRow.nextAction.kind === "resume" ? (
                <MobileRow title={openRow.nextAction.label} detail={t(`${K}.sheet.resumeDetail`)} />
              ) : (
                <MobileRow title={openRow.nextAction.label} detail={openRow.nextAction.why} />
              )}
              {openRow.href ? (
                <MobileRow title={t(`${K}.open`)} detail={t(`${K}.sheet.openDetail`)} href={openRow.href} />
              ) : null}
            </MobileCard>
            {state[openRow.key]?.message ? (
              <MobileNote tone={state[openRow.key]?.failed ? "coral" : "slate"}>{state[openRow.key]?.message}</MobileNote>
            ) : null}
            {state[openRow.key]?.message && !state[openRow.key]?.failed ? (
              <button type="button" onClick={() => setOpenKey(null)} className={MOBILE_BUTTON_SECONDARY}>
                {t(`${K}.sheet.backToList`)}
              </button>
            ) : null}
          </>
        ) : null}
      </MobileSheet>
    </main>
  );
}
