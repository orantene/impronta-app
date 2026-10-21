/**
 * offer-role-views.ts — one offer, three honest views (TUL-1373). Pure.
 *
 * "Each role gets only its part": the WORKSPACE sees every line with cost and
 * margin; the CLIENT sees prices and, per the terms, the person; a TALENT sees
 * only their own line(s) and their own cost. The client and talent view types
 * have no cost or margin fields at all, so a leak cannot be written by accident.
 */

export type OfferLine = {
  id: string;
  kind: "talent" | "house" | "custom";
  talentProfileId: string | null;
  label: string;
  units: number;
  unitPriceCents: number;
  talentCostCents: number;
  /** How the client may see the person (terms / listing `show_who`). */
  showWho: "name" | "portfolio" | "hidden";
  /** The talent's own confirmation of this line: true / false (declined) / null (not answered). */
  talentConfirmed: boolean | null;
};

const total = (l: OfferLine) => l.units * l.unitPriceCents;

export type WorkspaceOfferView = {
  lines: Array<{ id: string; label: string; talentProfileId: string | null; totalCents: number; costCents: number; marginCents: number }>;
  totalCents: number;
  costCents: number;
  marginCents: number;
};

export function workspaceOfferView(lines: readonly OfferLine[]): WorkspaceOfferView {
  const rows = lines.map((l) => {
    const t = total(l);
    const cost = l.kind === "talent" ? l.talentCostCents * l.units : 0;
    return { id: l.id, label: l.label, talentProfileId: l.talentProfileId, totalCents: t, costCents: cost, marginCents: t - cost };
  });
  return {
    lines: rows,
    totalCents: rows.reduce((s, r) => s + r.totalCents, 0),
    costCents: rows.reduce((s, r) => s + r.costCents, 0),
    marginCents: rows.reduce((s, r) => s + r.marginCents, 0),
  };
}

export type ClientPerson = { kind: "name"; name: string } | { kind: "portfolio" } | { kind: "role_only" } | { kind: "none" };

export type ClientOfferView = {
  lines: Array<{ id: string; label: string; units: number; unitPriceCents: number; totalCents: number; person: ClientPerson }>;
  totalCents: number;
};

export function clientOfferView(lines: readonly OfferLine[], talentNames: ReadonlyMap<string, string>): ClientOfferView {
  const rows = lines.map((l) => {
    let person: ClientPerson = { kind: "none" };
    if (l.kind === "talent" && l.talentProfileId) {
      const name = talentNames.get(l.talentProfileId);
      person = l.showWho === "name" && name ? { kind: "name", name } : l.showWho === "portfolio" ? { kind: "portfolio" } : { kind: "role_only" };
    }
    return { id: l.id, label: l.label, units: l.units, unitPriceCents: l.unitPriceCents, totalCents: total(l), person };
  });
  return { lines: rows, totalCents: rows.reduce((s, r) => s + r.totalCents, 0) };
}

export type TalentOfferView = {
  lines: Array<{ id: string; label: string; units: number; talentCostCents: number }>;
  /** What this person is paid for the offer, before any later change. */
  youGetCents: number;
};

export function talentOfferView(lines: readonly OfferLine[], talentProfileId: string): TalentOfferView {
  const mine = lines.filter((l) => l.kind === "talent" && l.talentProfileId === talentProfileId);
  return {
    lines: mine.map((l) => ({ id: l.id, label: l.label, units: l.units, talentCostCents: l.talentCostCents })),
    youGetCents: mine.reduce((s, l) => s + l.talentCostCents * l.units, 0),
  };
}

export type ConfirmationState =
  | { mode: "whole_offer"; pendingLineIds: []; allConfirmed: null }
  | { mode: "per_line"; pendingLineIds: string[]; declinedLineIds?: string[]; allConfirmed: boolean };

/** Today a talent approves the whole offer; per-line confirmation is optional. */
export function confirmationState(lines: readonly OfferLine[], perLine: boolean): ConfirmationState {
  if (!perLine) return { mode: "whole_offer", pendingLineIds: [], allConfirmed: null };
  const talentLines = lines.filter((l) => l.kind === "talent");
  const pending = talentLines.filter((l) => l.talentConfirmed === null).map((l) => l.id);
  const declined = talentLines.filter((l) => l.talentConfirmed === false).map((l) => l.id);
  return {
    mode: "per_line",
    pendingLineIds: pending,
    ...(declined.length > 0 ? { declinedLineIds: declined } : {}),
    allConfirmed: pending.length === 0 && declined.length === 0,
  };
}
