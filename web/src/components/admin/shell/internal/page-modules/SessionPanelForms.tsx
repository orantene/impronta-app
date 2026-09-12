"use client";

/**
 * SessionPanelForms — the three confirm cards under W39's panel actions:
 * Substitute instructor, Move participant, Cancel session. Each runs ONE
 * engine action from `@/lib/server-actions/scheduling-engine` and turns the
 * reason word into the `dashboard.scheduling.engine.refusal.*` sentence.
 *
 * SCOPE IS THE ENGINE'S. `this | future | series` is passed through as the
 * panel's segment holds it; the engine decides what "future" means on the
 * venue's clock, never this file.
 *
 * A CANCEL WITH PAID SEATS SUCCEEDS. The command cancels and queues the
 * refunds; `paid_seats_need_refund` is drawn as a note under the done line,
 * not as a refusal (D-POS-119). Nothing is refunded inline.
 */

import { useState } from "react";

import { useT } from "@/i18n/use-t";
import { useDashboardLocale } from "@/i18n/use-dashboard-locale";
import { interpolate } from "@/i18n/interpolate";
import {
  sessionCancelAction,
  sessionMoveParticipantAction,
  sessionSetInstructorAction,
} from "@/lib/server-actions/scheduling-engine";
import { engineRefusalKey } from "./catalog/catalog-model";
import type { SessionRow } from "./appointments-classes-model";
import { ActionButton, BUTTON_PRIMARY, CARD, INPUT, Outcome } from "./appointments-classes-ui";
import { whenLine } from "./appointments-format";

const K = "dashboard.adminAppointments.board.panel";

export type Scope = "this" | "future" | "series";
export type StaffOption = { readonly id: string; readonly name: string };

type OutcomeState = { kind: "refused" | "done" | "note"; text: string } | null;

const SELECT = `${INPUT} cursor-pointer`;

function FormShell({
  testId,
  onSubmit,
  children,
}: {
  testId: string;
  onSubmit: () => void;
  children: React.ReactNode;
}) {
  return (
    <form
      data-testid={testId}
      className={`${CARD} flex flex-col gap-[8px] p-[12px]`}
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      {children}
    </form>
  );
}

function Buttons({
  busy,
  label,
  onClose,
  danger = false,
  disabled = false,
}: {
  busy: boolean;
  label: string;
  onClose: () => void;
  danger?: boolean;
  disabled?: boolean;
}) {
  const t = useT();
  return (
    <div className="flex gap-[8px]">
      <button
        type="submit"
        disabled={busy || disabled}
        className={`${BUTTON_PRIMARY} disabled:opacity-60 ${danger ? "border-admin-critical bg-admin-critical hover:bg-admin-critical-deep" : ""}`}
      >
        {busy ? t(`${K}.working`) : label}
      </button>
      <ActionButton onClick={onClose} disabled={busy}>
        {t(`${K}.close`)}
      </ActionButton>
    </div>
  );
}

/** Substitute instructor: a staff select and the scope, `sessionSetInstructorAction`. */
export function SubstituteForm({
  row,
  scope,
  staff,
  onDone,
  onClose,
}: {
  row: SessionRow;
  scope: Scope;
  staff: readonly StaffOption[];
  onDone: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const [userId, setUserId] = useState(row.instructorUserId ?? "");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<OutcomeState>(null);

  const submit = async () => {
    if (!userId) {
      setOutcome({ kind: "refused", text: t(`${K}.instructorNone`) });
      return;
    }
    setBusy(true);
    setOutcome(null);
    try {
      const res = await sessionSetInstructorAction({ sessionId: row.id, userId, scope });
      if (res.ok) {
        setOutcome({ kind: "done", text: interpolate(t(`${K}.substituted`), { updated: res.updated }) });
        onDone();
      } else {
        setOutcome({ kind: "refused", text: t(engineRefusalKey(res.reason)) });
      }
    } catch {
      setOutcome({ kind: "refused", text: t(engineRefusalKey("unavailable")) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormShell testId="session-substitute-form" onSubmit={() => void submit()}>
      <label className="flex flex-col gap-[4px] text-[12px] text-admin-ink-muted">
        <span>{t(`${K}.instructor`)}</span>
        <select className={SELECT} value={userId} onChange={(e) => setUserId(e.target.value)} data-testid="session-substitute-select">
          <option value="">{row.instructorUserId ? t(`${K}.instructorNone`) : t(`${K}.instructorUnknown`)}</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      {staff.length === 0 ? <p className="m-0 text-[11.5px] leading-[1.45] text-admin-ink-muted">{t(`${K}.noStaff`)}</p> : null}
      <Buttons busy={busy} label={t(`${K}.substituteConfirm`)} onClose={onClose} disabled={staff.length === 0} />
      {outcome ? (
        <Outcome kind={outcome.kind} testId="session-substitute-message">
          {outcome.text}
        </Outcome>
      ) : null}
    </FormShell>
  );
}

/** Move participant: the admission picked on the roster, to another session of the same series. */
export function MoveParticipantForm({
  row,
  admissionId,
  participantName,
  siblings,
  onDone,
  onClose,
}: {
  row: SessionRow;
  admissionId: string | null;
  participantName: string | null;
  siblings: readonly SessionRow[];
  onDone: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const locale = useDashboardLocale();
  const targets = siblings.filter((r) => r.seriesId !== null && r.seriesId === row.seriesId && r.id !== row.id && r.state !== "cancelled");
  const [toSessionId, setToSessionId] = useState(targets[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<OutcomeState>(null);

  const submit = async () => {
    if (!admissionId || !toSessionId) return;
    setBusy(true);
    setOutcome(null);
    try {
      const res = await sessionMoveParticipantAction({
        admissionId,
        toSessionId,
        operationKey: `move-${crypto.randomUUID()}`,
      });
      if (res.ok) {
        setOutcome({ kind: "done", text: t(`${K}.moved`) });
        onDone();
      } else {
        setOutcome({ kind: "refused", text: t(engineRefusalKey(res.reason)) });
      }
    } catch {
      setOutcome({ kind: "refused", text: t(engineRefusalKey("unavailable")) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormShell testId="session-move-form" onSubmit={() => void submit()}>
      <div className="text-[13px] font-semibold text-admin-ink">
        {t(`${K}.moveConfirm`)}
        {participantName ? ` · ${participantName}` : ""}
      </div>
      {!admissionId ? <p className="m-0 text-[11.5px] leading-[1.45] text-admin-ink-muted">{t(`${K}.movePick`)}</p> : null}
      {targets.length === 0 ? (
        <Outcome kind="note">{t(`${K}.moveNoTarget`)}</Outcome>
      ) : (
        <label className="flex flex-col gap-[4px] text-[12px] text-admin-ink-muted">
          <span>{t(`${K}.moveTo`)}</span>
          <select className={SELECT} value={toSessionId} onChange={(e) => setToSessionId(e.target.value)} data-testid="session-move-select">
            {targets.map((r) => (
              <option key={r.id} value={r.id}>
                {whenLine(r.startsAt, r.timeZone, locale)}
                {r.seatsRemaining !== null ? ` · ${r.seatsRemaining}` : ""}
              </option>
            ))}
          </select>
        </label>
      )}
      <Buttons busy={busy} label={t(`${K}.moveConfirm`)} onClose={onClose} disabled={!admissionId || targets.length === 0} />
      {outcome ? (
        <Outcome kind={outcome.kind} testId="session-move-message">
          {outcome.text}
        </Outcome>
      ) : null}
    </FormShell>
  );
}

/** Cancel session: a reason and the scope, `sessionCancelAction`; paid seats queue refunds. */
export function CancelSessionForm({
  row,
  scope,
  onDone,
  onClose,
}: {
  row: SessionRow;
  scope: Scope;
  onDone: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<OutcomeState>(null);
  const [refunds, setRefunds] = useState<number>(0);

  const submit = async () => {
    setBusy(true);
    setOutcome(null);
    try {
      const res = await sessionCancelAction({
        sessionId: row.id,
        scope,
        reason: reason.trim().slice(0, 200),
        operationKey: `cancel-${crypto.randomUUID()}`,
      });
      if (res.ok) {
        setRefunds(res.refundIntents);
        setOutcome({ kind: "done", text: interpolate(t(`${K}.cancelled`), { count: res.sessionsCancelled }) });
        onDone();
      } else {
        setOutcome({ kind: "refused", text: t(engineRefusalKey(res.reason)) });
      }
    } catch {
      setOutcome({ kind: "refused", text: t(engineRefusalKey("unavailable")) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormShell testId="session-cancel-form" onSubmit={() => void submit()}>
      <label className="flex flex-col gap-[4px] text-[12px] text-admin-ink-muted">
        <span>{t(`${K}.cancelReason`)}</span>
        <input className={INPUT} maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} data-testid="session-cancel-reason" />
      </label>
      <Buttons busy={busy} label={t(`${K}.cancelConfirm`)} onClose={onClose} danger />
      {outcome ? (
        <Outcome kind={outcome.kind} testId="session-cancel-message">
          {outcome.text}
        </Outcome>
      ) : null}
      {outcome?.kind === "done" && refunds > 0 ? (
        <Outcome kind="note" testId="session-cancel-refunds">
          {t(engineRefusalKey("paid_seats_need_refund"))} {interpolate(t(`${K}.refundsQueued`), { count: refunds })}
        </Outcome>
      ) : null}
    </FormShell>
  );
}
