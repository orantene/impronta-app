/**
 * offer-line-confirmation-view.ts — what each viewer sees of the per-line
 * confirmations on an offer (TUL-1608). Pure.
 *
 * Per-line confirmation is TALENT READINESS only. It is shown next to the offer
 * status ("3 of 4 confirmed") and never changes or blocks the client's approval,
 * the total, or any money: no approval or payment code imports this module.
 *
 *  - A manager (staff or appointed coordinator) sees every talent line.
 *  - Anyone else sees only the lines that are theirs (and gets the buttons),
 *    never another person's name or answer; they still get the overall count.
 *  - Unreadable answers are Awaiting, never Confirmed (fail closed).
 */

import { offerConfirmation, type ConfirmableLine, type LineAnswersRead, type LineConfirmationState } from "./offer-line-confirmation";

export type ViewLine = ConfirmableLine & { label: string };

export type OfferLineConfirmationRow = {
  lineId: string;
  label: string;
  state: Exclude<LineConfirmationState, "not_applicable">;
  /** The signed-in person owns this line: they get Confirm / Decline. */
  mine: boolean;
};

export type OfferLineConfirmationView = {
  rows: OfferLineConfirmationRow[];
  summary: { confirmed: number; total: number };
  /** False when the answers could not be read: show nothing, never "0 of N". */
  readable: boolean;
};

export function buildOfferLineConfirmationView(input: {
  lines: readonly ViewLine[];
  read: LineAnswersRead;
  viewer: { manager: boolean; ownProfileIds: readonly string[] };
}): OfferLineConfirmationView {
  const oc = offerConfirmation(input.lines, input.read);
  const own = new Set(input.viewer.ownProfileIds);
  const rows: OfferLineConfirmationRow[] = [];
  let total = 0;
  for (const l of input.lines) {
    const s = oc.byLine[l.id];
    if (s === "not_applicable" || s === undefined) continue;
    total += 1;
    const mine = l.talentProfileId !== null && own.has(l.talentProfileId);
    if (!input.viewer.manager && !mine) continue;
    rows.push({ lineId: l.id, label: l.label, state: s, mine });
  }
  return { rows, summary: { confirmed: oc.confirmedLineIds.length, total }, readable: input.read.ok };
}

export function confirmationSummaryText(summary: { confirmed: number; total: number }, locale: "en" | "es"): string {
  if (summary.total <= 0) return "";
  return locale === "es"
    ? `${summary.confirmed} de ${summary.total} confirmados`
    : `${summary.confirmed} of ${summary.total} confirmed`;
}
