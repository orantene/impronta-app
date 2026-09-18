/**
 * L6 (Messages v5, D-MSG-132): pure diff between two offer versions, for the
 * "Compare" two-column view (board D18). Never a network call — the shell
 * loads both versions' line rows (via the staff offer reader) and hands them
 * here; the sheet tints a row `added` / `removed` / `changed` from the
 * result.
 *
 * A line is matched across versions by `sourceServiceId` when both sides have
 * one, else by `talentProfileId` (talent lines rarely change identity across
 * a revision), else by label (custom lines have neither). This mirrors
 * `diffDraft`'s matching in `lib/messaging/diff-draft.ts` at a coarser grain
 * (that module diffs order lines by `id`, which does not survive a
 * version's line items being re-inserted by `updateOfferDraft`).
 */

import type { OfferDraftLine } from "./offer-draft";

export type OfferCompareLineStatus = "unchanged" | "added" | "removed" | "changed";

export type OfferCompareLine = {
  readonly key: string;
  readonly status: OfferCompareLineStatus;
  readonly before: OfferDraftLine | null;
  readonly after: OfferDraftLine | null;
};

export type OfferCompareResult = {
  readonly lines: readonly OfferCompareLine[];
  readonly totalBeforeCents: number;
  readonly totalAfterCents: number;
};

function matchKey(line: OfferDraftLine): string {
  if (line.sourceServiceId) return `svc:${line.sourceServiceId}`;
  if (line.talentProfileId) return `talent:${line.talentProfileId}`;
  if (line.ownerTenantId) return `house:${line.ownerTenantId}`;
  return `label:${line.label.trim().toLowerCase()}`;
}

function linesEqual(a: OfferDraftLine, b: OfferDraftLine): boolean {
  return (
    a.label === b.label &&
    a.units === b.units &&
    a.unitPriceCents === b.unitPriceCents &&
    a.discountCents === b.discountCents &&
    a.taxCents === b.taxCents &&
    a.note === b.note &&
    !a.removedBy === !b.removedBy
  );
}

function totalCentsOf(lines: readonly OfferDraftLine[]): number {
  return lines
    .filter((l) => !l.removedBy)
    .reduce((sum, l) => sum + Math.max(0, Math.round(l.units * l.unitPriceCents) - l.discountCents + l.taxCents), 0);
}

/** Pure: `before` = the earlier version's live lines, `after` = the later version's. */
export function compareOfferVersions(before: readonly OfferDraftLine[], after: readonly OfferDraftLine[]): OfferCompareResult {
  const beforeByKey = new Map(before.map((l) => [matchKey(l), l]));
  const afterByKey = new Map(after.map((l) => [matchKey(l), l]));
  const keys = [...new Set([...beforeByKey.keys(), ...afterByKey.keys()])];

  const lines: OfferCompareLine[] = keys.map((key) => {
    const b = beforeByKey.get(key) ?? null;
    const a = afterByKey.get(key) ?? null;
    if (b && !a) return { key, status: "removed", before: b, after: null };
    if (!b && a) return { key, status: "added", before: null, after: a };
    if (b && a) return { key, status: linesEqual(b, a) ? "unchanged" : "changed", before: b, after: a };
    // Unreachable: a key only exists if it came from one of the two maps.
    return { key, status: "unchanged", before: null, after: null };
  });

  return {
    lines,
    totalBeforeCents: totalCentsOf(before),
    totalAfterCents: totalCentsOf(after),
  };
}
