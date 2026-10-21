"use client";

import { useEffect, useState } from "react";

import { answerMyAssignmentAction, readMyAssignmentAction } from "@/lib/server-actions/project-assignment-confirmation";

/**
 * TUL-1606: the person answers "are you on this job?" for THEIR OWN seat, on their booking record.
 * Confirm / Decline, ES + EN, 44px targets. It shows only when the signed-in person has a seat on
 * this booking; the server action re-checks that the seat is theirs, so this component never
 * decides ownership.
 */

export type MySeat = { assignmentId: string; roleLabel: string | null; status: "confirmed" | "declined" | "awaiting" };
type Lang = "es" | "en";

const COPY = {
  en: {
    title: "Are you on this job?",
    role: (r: string) => `Your role: ${r}`,
    confirm: "Confirm",
    decline: "Decline",
    confirmed: "You confirmed",
    declined: "You declined",
    failed: "Could not save your answer. Try again.",
    saving: "Saving…",
  },
  es: {
    title: "¿Estás en este trabajo?",
    role: (r: string) => `Tu rol: ${r}`,
    confirm: "Confirmar",
    decline: "Rechazar",
    confirmed: "Confirmaste",
    declined: "Rechazaste",
    failed: "No se pudo guardar tu respuesta. Inténtalo otra vez.",
    saving: "Guardando…",
  },
} as const;

const BTN = "inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full px-5 text-[14px] font-medium disabled:opacity-60";

/** Pure view, so it can be rendered and tested without the server actions. */
export function MyAssignmentView({
  seat,
  locale,
  busy = false,
  failed = false,
  onAnswer,
}: {
  seat: MySeat;
  locale: Lang;
  busy?: boolean;
  failed?: boolean;
  onAnswer: (status: "confirmed" | "declined") => void;
}) {
  const c = COPY[locale];
  const answered = seat.status !== "awaiting";
  return (
    <section className="mx-auto mb-4 max-w-[560px] rounded-2xl border border-[var(--tc-line,#ddd)] px-4 py-3" data-my-assignment data-state={seat.status}>
      <h2 className="text-[15px] font-semibold text-[var(--tc-ink,inherit)]">{c.title}</h2>
      {seat.roleLabel?.trim() ? <p className="mt-0.5 text-[13px] text-[var(--tc-muted)]">{c.role(seat.roleLabel.trim())}</p> : null}
      {answered ? (
        <p className="mt-2 text-[14px] text-[var(--tc-ink,inherit)]" role="status" data-my-assignment-state>
          {seat.status === "confirmed" ? c.confirmed : c.declined}
        </p>
      ) : null}
      <div className="mt-2 flex flex-wrap gap-2">
        {seat.status !== "confirmed" ? (
          <button type="button" disabled={busy} onClick={() => onAnswer("confirmed")} className={`${BTN} bg-[var(--tc-ink,#111)] text-[var(--tc-bg,#fff)]`} data-my-assignment-confirm>
            {c.confirm}
          </button>
        ) : null}
        {seat.status !== "declined" ? (
          <button type="button" disabled={busy} onClick={() => onAnswer("declined")} className={`${BTN} border border-[var(--tc-line,#ddd)]`} data-my-assignment-decline>
            {c.decline}
          </button>
        ) : null}
      </div>
      {busy ? <p className="mt-1 text-[12px] text-[var(--tc-muted)]" role="status">{c.saving}</p> : null}
      {failed ? <p className="mt-1 text-[12px] text-[var(--tc-muted)]" role="alert" data-my-assignment-failed>{c.failed}</p> : null}
    </section>
  );
}

export function MyAssignmentAnswer({ bookingId, locale }: { bookingId: string; locale: Lang }) {
  const [seat, setSeat] = useState<MySeat | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!bookingId) return;
    let cancelled = false;
    void (async () => {
      try {
        const s = await readMyAssignmentAction({ bookingId });
        if (!cancelled) setSeat(s);
      } catch {
        if (!cancelled) setSeat(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  if (!seat) return null;
  return (
    <MyAssignmentView
      seat={seat}
      locale={locale}
      busy={busy}
      failed={failed}
      onAnswer={(status) => {
        if (busy) return;
        setBusy(true);
        setFailed(false);
        void (async () => {
          try {
            const res = await answerMyAssignmentAction({ assignmentId: seat.assignmentId, status });
            if (res.ok) setSeat({ ...seat, status });
            else setFailed(true);
          } catch {
            setFailed(true);
          } finally {
            setBusy(false);
          }
        })();
      }}
    />
  );
}
