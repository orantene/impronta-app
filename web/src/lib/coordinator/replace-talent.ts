/**
 * replace-talent.ts — a person declines or drops out: replace them and re-send
 * only what changed (TUL-1373). Pure; the caller persists and notifies.
 *
 *  - Only the dropped person's lines change. The client price of a line is NOT
 *    touched; the new person has not confirmed yet.
 *  - Payouts move: the dropped person loses their part, the new person gains
 *    theirs. The margin moves by the difference in cost only.
 *  - The client is told only if they were shown the dropped person (by name or
 *    as a portfolio entry) or would now be shown the new one. A person who was
 *    never shown stays invisible to the client.
 *  - It refuses what it cannot do safely: a person not on the offer, the same
 *    person, an invalid cost.
 */

import type { OfferLine } from "./offer-line";

export type Replacement = {
  talentProfileId: string;
  /** What the new person will be paid per unit. Required: a replacement without a cost has no payout. */
  costCents: number;
  showWho: "name" | "portfolio" | "hidden";
};

export type ReplacementPlan =
  | {
      ok: true;
      lines: OfferLine[];
      changedLineIds: string[];
      unchangedLineIds: string[];
      payoutMoves: Array<{ talentProfileId: string; deltaCents: number }>;
      /** How much the workspace margin changes (positive = more margin). */
      marginDeltaCents: number;
      clientNotice: "none" | "person_changed";
      notify: { dropped: string; added: string };
    }
  | { ok: false; reason: "not_on_offer" | "same_person" | "invalid_cost" };

const shown = (w: OfferLine["showWho"]) => w === "name" || w === "portfolio";

export function planReplacement(input: {
  lines: readonly OfferLine[];
  droppedTalentId: string;
  replacement: Replacement;
}): ReplacementPlan {
  const { droppedTalentId, replacement } = input;
  const theirs = input.lines.filter((l) => l.kind === "talent" && l.talentProfileId === droppedTalentId);
  if (theirs.length === 0) return { ok: false, reason: "not_on_offer" };
  if (replacement.talentProfileId === droppedTalentId) return { ok: false, reason: "same_person" };
  if (!Number.isFinite(replacement.costCents) || replacement.costCents < 0 || !Number.isInteger(replacement.costCents)) {
    return { ok: false, reason: "invalid_cost" };
  }

  let droppedPay = 0;
  let addedPay = 0;
  let visible = false;
  const lines = input.lines.map((l) => {
    if (l.kind !== "talent" || l.talentProfileId !== droppedTalentId) return { ...l };
    droppedPay += l.talentCostCents * l.units;
    addedPay += replacement.costCents * l.units;
    if (shown(l.showWho) || shown(replacement.showWho)) visible = true;
    return {
      ...l,
      talentProfileId: replacement.talentProfileId,
      talentCostCents: replacement.costCents,
      showWho: replacement.showWho,
      talentConfirmed: null,
    };
  });
  const changed = new Set(theirs.map((l) => l.id));
  return {
    ok: true,
    lines,
    changedLineIds: input.lines.filter((l) => changed.has(l.id)).map((l) => l.id),
    unchangedLineIds: input.lines.filter((l) => !changed.has(l.id)).map((l) => l.id),
    payoutMoves: [
      { talentProfileId: droppedTalentId, deltaCents: -droppedPay },
      { talentProfileId: replacement.talentProfileId, deltaCents: addedPay },
    ],
    marginDeltaCents: droppedPay - addedPay,
    clientNotice: visible ? "person_changed" : "none",
    notify: { dropped: droppedTalentId, added: replacement.talentProfileId },
  };
}
