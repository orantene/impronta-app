/**
 * offer-line-confirmation.ts — each person confirms or declines THEIR OWN line
 * of a multi-person offer (TUL-1607). Pure; no prices or totals are touched.
 *
 * Rules (fail closed):
 *  - Only talent lines with a person need an answer; house/custom lines are
 *    "not_applicable".
 *  - An answer counts only for the person it was given by: it is keyed by the
 *    line AND the line's CURRENT talent, so a replaced person's answer never
 *    carries over to their successor.
 *  - A declined line reopens ONLY that line; every other line keeps its state.
 *  - The offer is fully confirmed only when it has at least one talent line and
 *    every one is confirmed. Unknown, unreadable or missing state is never
 *    confirmed.
 */

export type LineAnswerStatus = "confirmed" | "declined";

export type LineAnswer = { lineId: string; talentProfileId: string; status: LineAnswerStatus };

export type LineAnswersRead = { ok: true; answers: readonly LineAnswer[] } | { ok: false };

export type LineConfirmationState = "confirmed" | "declined" | "pending" | "not_applicable";

export type ConfirmableLine = { id: string; kind: "talent" | "house" | "custom"; talentProfileId: string | null };

export function lineConfirmationState(line: ConfirmableLine, read: LineAnswersRead): LineConfirmationState {
  if (line.kind !== "talent") return "not_applicable";
  if (!line.talentProfileId) return "pending";
  if (!read.ok) return "pending";
  const mine = read.answers.find((a) => a.lineId === line.id && a.talentProfileId === line.talentProfileId);
  if (mine && (mine.status === "confirmed" || mine.status === "declined")) return mine.status;
  return "pending";
}

export type OfferConfirmation = {
  byLine: Record<string, LineConfirmationState>;
  confirmedLineIds: string[];
  pendingLineIds: string[];
  /** Lines the person declined: only these reopen. */
  reopenedLineIds: string[];
  fullyConfirmed: boolean;
};

export function offerConfirmation(lines: readonly ConfirmableLine[], read: LineAnswersRead): OfferConfirmation {
  const byLine: Record<string, LineConfirmationState> = {};
  const confirmedLineIds: string[] = [];
  const pendingLineIds: string[] = [];
  const reopenedLineIds: string[] = [];
  for (const l of lines) {
    const s = lineConfirmationState(l, read);
    byLine[l.id] = s;
    if (s === "confirmed") confirmedLineIds.push(l.id);
    else if (s === "pending") pendingLineIds.push(l.id);
    else if (s === "declined") reopenedLineIds.push(l.id);
  }
  return {
    byLine,
    confirmedLineIds,
    pendingLineIds,
    reopenedLineIds,
    fullyConfirmed: confirmedLineIds.length > 0 && pendingLineIds.length === 0 && reopenedLineIds.length === 0,
  };
}

/** Plain-language labels for the coordinator view (ES + EN, no em dashes). */
export const LINE_STATE_LABELS: Record<"en" | "es", Record<LineConfirmationState, string>> = {
  en: { confirmed: "Confirmed", declined: "Declined, line reopened", pending: "Waiting for answer", not_applicable: "No answer needed" },
  es: { confirmed: "Confirmado", declined: "Rechazado, línea reabierta", pending: "Esperando respuesta", not_applicable: "No requiere respuesta" },
};
