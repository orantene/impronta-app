/**
 * L6 (Messages v5, D-MSG-130): the pure draft model behind the offer editor
 * sheet (`OfferEditorSheet`). No `server-only`, no React — a reducer over one
 * `OfferDraftState`, so the sheet, its render tests and `offer-compare.ts` all
 * share one shape.
 *
 * WHY A NEW MODULE INSTEAD OF THE ADMIN OFFER TAB'S: the admin workspace's
 * offer editor (`app/(workspace)/[tenantSlug]/admin/_pipeline-actions.ts`
 * `loadOfferDraft` / `saveOfferDraft`) keeps its line-item state as React
 * component state, not an importable pure module — there is nothing to
 * import. This module mirrors its wire shape exactly (`OfferLineDraft` in
 * `lib/inquiry/inquiry-engine-offers.ts`: `talent_profile_id`, `owner_tenant_id`,
 * `label`, `pricing_unit`, `units`, `unit_price`, `total_price`, `talent_cost`,
 * `notes`, `sort_order`, `source_service_id`, `proposed_by`,
 * `price_snapshot_cents`, `catalog_price_cents_at_add`, `discount_cents`,
 * `discount_label`, `tax_cents`, `tax_label`) so `toOfferLineDrafts` below is a
 * lossless round trip into `updateOfferDraft`.
 *
 * Money: line unit price and totals are held in CENTS in this module (matching
 * the kit's `formatCentsUSD`); `total_price` / `unit_price` / `talent_cost` on
 * the wire are DOLLARS (see `loadOfferDraft` — `Math.round(total_client_price * 100)`),
 * so the two conversion points (`fromOfferRow`, `toOfferLineDrafts`) are the
 * only places cents and dollars meet.
 *
 * The two safety nets this module reuses rather than reimplements (per the
 * lane brief): `offer-local-snapshot.ts` (localStorage safety copy) and
 * `offer-save-state.ts` (`classifySaveError`, `canSendOffer`) from
 * `components/admin/shell/internal/messages/shared/` — both are plain
 * TypeScript with no admin-shell import, so `OfferEditorSheet` imports them
 * directly instead of copying their logic (attribution: W0-1/W0-2, the
 * 2026-07-11 prod audit where an expired session ate a $5,000 offer).
 */

export type OfferDraftLineKind = "talent" | "house" | "custom";

export type OfferDraftLine = {
  readonly id: string;
  readonly kind: OfferDraftLineKind;
  readonly talentProfileId: string | null;
  readonly ownerTenantId: string | null;
  readonly label: string;
  readonly pricingUnit:
    | "hour"
    | "day"
    | "week"
    | "event"
    | "half_day"
    | "per_person"
    | "per_contact"
    | "flat_package"
    | "custom";
  readonly units: number;
  readonly unitPriceCents: number;
  readonly talentCostCents: number;
  readonly note: string | null;
  readonly sortOrder: number;
  readonly sourceServiceId: string | null;
  readonly proposedBy: "client" | "staff" | "system" | null;
  readonly proposedByName: string | null;
  readonly confirmed: boolean;
  /** Catalog price the line was added at; null on a custom or pre-S5 line. */
  readonly priceSnapshotCents: number | null;
  readonly catalogPriceCentsAtAdd: number | null;
  /**
   * The catalog's CURRENT price for this line's `sourceServiceId`
   * (`talent_offerings.amount_cents`, read by `loadOfferForEditor`). Null
   * when the line has no catalog origin (custom line) or the offering was
   * deleted/archived since. Feeds `priceDrift` (`lib/pos/price-drift.ts`)
   * for the "catalog price now X" hint — a missing value is "no catalog
   * item", never treated as "no drift".
   */
  readonly catalogNowCents: number | null;
  readonly discountCents: number;
  readonly discountLabel: string | null;
  readonly taxCents: number;
  readonly taxLabel: string | null;
  /** Kept in history, restorable (`LineEditorRow`'s `removed` flag). */
  readonly removedBy: string | null;
};

export function lineTotalCents(line: OfferDraftLine): number {
  return Math.max(0, Math.round(line.units * line.unitPriceCents) - line.discountCents + line.taxCents);
}

export type OfferDraftTerms = {
  readonly depositMode: "pct" | "amount" | "none";
  readonly depositPct: number | null;
  readonly depositAmountCents: number | null;
  readonly validUntil: string | null; // ISO date, staff-entered
  readonly noteToClient: string;
};

export type OfferDraftState = {
  readonly offerId: string | null;
  readonly inquiryId: string;
  readonly version: number;
  readonly inquiryExpectedVersion: number;
  readonly status: "draft" | "sent" | "viewed" | "accepted" | "declined" | "expired";
  readonly currencyCode: string;
  readonly lines: readonly OfferDraftLine[];
  readonly terms: OfferDraftTerms;
  readonly coordinatorFeeCents: number;
};

export function emptyTerms(): OfferDraftTerms {
  return { depositMode: "none", depositPct: null, depositAmountCents: null, validUntil: null, noteToClient: "" };
}

export function draftTotalCents(state: OfferDraftState): number {
  return state.lines.filter((l) => !l.removedBy).reduce((sum, l) => sum + lineTotalCents(l), 0);
}

export function draftDepositCents(state: OfferDraftState): number | null {
  const total = draftTotalCents(state);
  if (state.terms.depositMode === "amount") return state.terms.depositAmountCents ?? null;
  if (state.terms.depositMode === "pct" && state.terms.depositPct != null) {
    return Math.round((total * state.terms.depositPct) / 100);
  }
  return null;
}

export function draftTalentNetCents(state: OfferDraftState): number {
  return state.lines.filter((l) => !l.removedBy).reduce((sum, l) => sum + l.talentCostCents, 0);
}

/**
 * Platform fee is whatever is left of the total once the talent's net and the
 * agency's coordinator fee are both accounted for. This is a DISPLAY estimate
 * for the internal-only block, not the booking-time commission resolver
 * (`lib/billing/commission.ts` `resolveBookingCommissions`) — that function
 * needs a booking record and a resolved commission plan this draft does not
 * have yet (D-MSG-131). Never negative: a misconfigured draft shows 0, not a
 * confusing negative fee.
 */
export function draftPlatformFeeCents(state: OfferDraftState): number {
  const total = draftTotalCents(state);
  const talentNet = draftTalentNetCents(state);
  return Math.max(0, total - talentNet - state.coordinatorFeeCents);
}

let seq = 0;
export function newCustomLineId(): string {
  seq += 1;
  return `custom-${Date.now()}-${seq}`;
}

export function addCustomLine(state: OfferDraftState, args: { label: string; units: number; unitPriceCents: number }): OfferDraftState {
  const line: OfferDraftLine = {
    id: newCustomLineId(),
    kind: "custom",
    talentProfileId: null,
    ownerTenantId: null,
    label: args.label,
    pricingUnit: "custom",
    units: Math.max(0, args.units),
    unitPriceCents: Math.max(0, Math.round(args.unitPriceCents)),
    talentCostCents: 0,
    note: null,
    sortOrder: state.lines.length,
    sourceServiceId: null,
    proposedBy: "staff",
    proposedByName: null,
    confirmed: false,
    priceSnapshotCents: null,
    catalogPriceCentsAtAdd: null,
    catalogNowCents: null,
    discountCents: 0,
    discountLabel: null,
    taxCents: 0,
    taxLabel: null,
    removedBy: null,
  };
  return { ...state, lines: [...state.lines, line] };
}

function mapLine(state: OfferDraftState, lineId: string, fn: (l: OfferDraftLine) => OfferDraftLine): OfferDraftState {
  return { ...state, lines: state.lines.map((l) => (l.id === lineId ? fn(l) : l)) };
}

export function setLineUnits(state: OfferDraftState, lineId: string, units: number): OfferDraftState {
  return mapLine(state, lineId, (l) => ({ ...l, units: Math.max(0, units) }));
}

export function setLinePriceCents(state: OfferDraftState, lineId: string, unitPriceCents: number): OfferDraftState {
  return mapLine(state, lineId, (l) => ({ ...l, unitPriceCents: Math.max(0, Math.round(unitPriceCents)) }));
}

export function setLineLabel(state: OfferDraftState, lineId: string, label: string): OfferDraftState {
  return mapLine(state, lineId, (l) => ({ ...l, label }));
}

export function setLineNote(state: OfferDraftState, lineId: string, note: string): OfferDraftState {
  return mapLine(state, lineId, (l) => ({ ...l, note: note || null }));
}

export function setLineDiscount(state: OfferDraftState, lineId: string, discountCents: number, label: string | null): OfferDraftState {
  return mapLine(state, lineId, (l) => ({ ...l, discountCents: Math.max(0, Math.round(discountCents)), discountLabel: label }));
}

export function setLineTax(state: OfferDraftState, lineId: string, taxCents: number, label: string | null): OfferDraftState {
  return mapLine(state, lineId, (l) => ({ ...l, taxCents: Math.max(0, Math.round(taxCents)), taxLabel: label }));
}

export function removeLine(state: OfferDraftState, lineId: string, byName: string): OfferDraftState {
  return mapLine(state, lineId, (l) => ({ ...l, removedBy: byName }));
}

export function restoreLine(state: OfferDraftState, lineId: string): OfferDraftState {
  return mapLine(state, lineId, (l) => ({ ...l, removedBy: null }));
}

export function setDepositPct(state: OfferDraftState, pct: number | null): OfferDraftState {
  return { ...state, terms: { ...state.terms, depositMode: pct == null ? "none" : "pct", depositPct: pct } };
}

export function setDepositAmountCents(state: OfferDraftState, amountCents: number | null): OfferDraftState {
  return { ...state, terms: { ...state.terms, depositMode: amountCents == null ? "none" : "amount", depositAmountCents: amountCents } };
}

export function setValidUntil(state: OfferDraftState, iso: string | null): OfferDraftState {
  return { ...state, terms: { ...state.terms, validUntil: iso } };
}

export function setNoteToClient(state: OfferDraftState, text: string): OfferDraftState {
  return { ...state, terms: { ...state.terms, noteToClient: text } };
}

/** Serializes the live (non-removed) lines into the engine's `OfferLineDraft[]` (dollars, cents-columns kept as cents). */
export function toOfferLineDrafts(state: OfferDraftState): Array<{
  talent_profile_id: string | null;
  owner_tenant_id: string | null;
  label: string | null;
  pricing_unit: OfferDraftLine["pricingUnit"];
  units: number;
  unit_price: number;
  total_price: number;
  talent_cost: number;
  notes: string | null;
  sort_order: number;
  source_service_id: string | null;
  proposed_by?: "client" | "staff" | "system";
  price_snapshot_cents?: number | null;
  catalog_price_cents_at_add?: number | null;
  discount_cents?: number;
  discount_label?: string | null;
  tax_cents?: number;
  tax_label?: string | null;
}> {
  return state.lines
    .filter((l) => !l.removedBy)
    .map((l, i) => ({
      talent_profile_id: l.talentProfileId,
      owner_tenant_id: l.ownerTenantId,
      label: l.label,
      pricing_unit: l.pricingUnit,
      units: l.units,
      unit_price: l.unitPriceCents / 100,
      total_price: lineTotalCents(l) / 100,
      talent_cost: l.talentCostCents / 100,
      notes: l.note,
      sort_order: i,
      source_service_id: l.sourceServiceId,
      proposed_by: l.proposedBy ?? undefined,
      price_snapshot_cents: l.priceSnapshotCents,
      catalog_price_cents_at_add: l.catalogPriceCentsAtAdd,
      discount_cents: l.discountCents,
      discount_label: l.discountLabel,
      tax_cents: l.taxCents,
      tax_label: l.taxLabel,
    }));
}

export function draftLineCount(state: OfferDraftState): number {
  return state.lines.filter((l) => !l.removedBy).length;
}
