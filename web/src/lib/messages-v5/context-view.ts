/**
 * Pure view-model helpers for the Messages v5 context panel / drawer /
 * details sheet (L3, boards D01, D11, D15, M04). No I/O, no `server-only`:
 * every function here takes already-loaded data and returns strings/labels a
 * kit component renders. Actual reads (offer lines, order lines, payment
 * state) stay in the existing readers named in each function's doc comment —
 * this module never queries a table.
 */

import { formatCentsUSD } from "@/lib/bookings/commission";
import type { DerivedTask, Essentials, IdentityLevel, RecordChip } from "@/lib/messaging/types";
import { resolveIndustryPreset } from "@/lib/words/presets";

import type { KitCopy } from "@/components/messages-v5/kit/copy";

/* ---------------------------------------------------------- items label ---------------------------------------------------------- */

/**
 * The owner-ruled label bucket for the Items section (README: "Items is
 * labelled per business: Talent & services / Services / Order items /
 * Menu"). Returns a copy KEY, not a literal string, so the label is
 * localized through `copy.panel.items.<key>` (EN/ES/FR) rather than baked in
 * English here.
 *
 * Mapping, read off `agencies.settings.industry_preset` via the existing
 * `resolveIndustryPreset` (`lib/words/presets.ts` — the finer signal layered
 * over `workspace_type`, per that module's own header):
 *  - `representsPeople` (only the "agency" preset) -> talent & services.
 *  - a preset that spreads `RESTAURANT_WORDS` (a real food menu: "Dish" /
 *    "Kitchen") -> menu. `features.menu` itself is true for most presets
 *    (it is really "has a priced-items table", not "has a food menu"), so it
 *    cannot be used alone to mean "Menu" — only these three actually run a
 *    kitchen board.
 *  - `features.appointments` (spa/salon/clinic/practice/studio_gym) and no
 *    food menu -> services.
 *  - everything else (reservations/events-only, or the generic items table)
 *    -> order items.
 *  - an unrecognised/null preset resolves to "custom" (`resolveIndustryPreset`
 *    itself fails toward it) -> the default "Items" key.
 */
export type ItemsLabelKey = "talentServices" | "services" | "orderItems" | "menu";

const FOOD_MENU_PRESET_IDS: ReadonlySet<string> = new Set(["restaurant", "bar_club", "beach_club"]);

export function itemsLabelKeyForPreset(raw: unknown): ItemsLabelKey {
  const preset = resolveIndustryPreset(raw);
  if (preset.representsPeople) return "talentServices";
  if (FOOD_MENU_PRESET_IDS.has(preset.id)) return "menu";
  if (preset.features.appointments) return "services";
  return "orderItems";
}

/** `copy.panel.items.<key>`, falling back to the generic "Items" default. */
export function itemsLabelForPreset(raw: unknown, copy: KitCopy): string {
  const key = itemsLabelKeyForPreset(raw);
  return copy.panel.items[key] ?? copy.panel.items.default;
}

/* ------------------------------------------------------------ money summary ------------------------------------------------------------ */

/**
 * Cents in, formatted labels out. USD only (house rule: never read
 * `default_currency`; `formatCentsUSD` is the same formatter the rest of the
 * dashboard uses, `lib/bookings/commission.ts`).
 *
 * `totalCents` is the offer's `total_client_price` (`loadInquiryOffers`,
 * `lib/messaging/sheets.ts`) or the draft order's line sum
 * (`lib/pos/draft.ts`); `paidCents` sums `payment_links`/`booking_transactions`
 * rows with `status = 'paid'` for this conversation (the same two tables
 * D-MSG-21 names for "paid deposit exists"). `depositCents` is the offer's
 * `deposit_amount_cents` / `deposit_pct` rule, or null when the record has
 * no deposit rule (owner decision 4).
 */
export type MoneySummaryInput = {
  readonly totalCents: number | null;
  readonly paidCents: number;
  readonly depositCents?: number | null;
};

export type MoneySummary = {
  readonly totalLabel: string;
  readonly depositLabel: string | null;
  readonly paidLabel: string;
  readonly balanceLabel: string;
  readonly balanceDueCents: number;
  readonly hasTotal: boolean;
};

export function moneySummary(input: MoneySummaryInput): MoneySummary {
  const total = Math.max(0, Math.trunc(input.totalCents ?? 0));
  const paid = Math.max(0, Math.trunc(input.paidCents));
  const balance = Math.max(0, total - paid);
  return {
    totalLabel: formatCentsUSD(total),
    depositLabel: typeof input.depositCents === "number" ? formatCentsUSD(Math.max(0, Math.trunc(input.depositCents))) : null,
    paidLabel: formatCentsUSD(paid),
    balanceLabel: formatCentsUSD(balance),
    balanceDueCents: balance,
    hasTotal: input.totalCents != null,
  };
}

/** The SummaryBlock "Amount" line: "$3,800 · $0 paid" (board D01). */
export function summaryAmountLabel(money: MoneySummary | null): string {
  if (!money || !money.hasTotal) return "";
  return `${money.totalLabel} · ${money.paidLabel} paid`;
}

/* ---------------------------------------------------------- summary block ---------------------------------------------------------- */

/** The record chip the SummaryBlock "Main" line reads: the first live chip, or null. */
export function mainRecordChip(chips: readonly RecordChip[]): RecordChip | null {
  return chips[0] ?? null;
}

export type SummaryViewModel = {
  readonly name: string;
  readonly isVisitor: boolean;
  readonly identityLabel: string;
  readonly phone: string | null;
  readonly next: string;
  readonly main: string;
  readonly amount: string;
};

/**
 * `essentials` + `tasks` + `chips` -> the four `SummaryBlock` strings (board
 * D01). `next` is the primary `DerivedTask`'s title (deriveTasks,
 * `lib/messaging/tasks.ts`); `main` is the main record chip's label and
 * state; `amount` is `moneySummary`'s total/paid line, or blank when no
 * record carries an amount yet.
 */
export function summaryFor(input: {
  readonly essentials: Essentials;
  readonly tasks: readonly DerivedTask[];
  readonly chips: readonly RecordChip[];
  readonly copy: KitCopy;
  readonly money?: MoneySummary | null;
}): SummaryViewModel {
  const { essentials, tasks, chips, copy, money } = input;
  const isVisitor = !essentials.customer.name && essentials.customer.identityLevel === "none";
  const primary = tasks.find((t) => t.primary) ?? tasks[0] ?? null;
  const main = mainRecordChip(chips);
  return {
    name: essentials.name || copy.state.noIdentity,
    isVisitor,
    identityLabel: (copy.identity as Record<IdentityLevel, string>)[essentials.customer.identityLevel] ?? copy.identity.none,
    phone: essentials.customer.phone,
    next: primary ? primary.title : copy.next.nothing,
    main: main ? main.label : "",
    amount: money ? summaryAmountLabel(money) : "",
  };
}

/* -------------------------------------------------------- client history line -------------------------------------------------------- */

/**
 * "N past bookings · $X" (README: "history ... if readable through
 * Essentials; else omit the line"). `Essentials` (`lib/messaging/essentials.ts`)
 * carries no customer rollup today — no visit count, no lifetime spend — so
 * this always resolves to `null` against the real reader; it takes an
 * explicit optional rollup so a later lane that adds one to `Essentials`
 * only has to pass it in, not rewrite the panel.
 */
export function clientHistoryLabel(
  rollup: { readonly pastBookings: number; readonly totalSpendCents: number } | null | undefined,
  template: string,
): string | null {
  if (!rollup || rollup.pastBookings <= 0) return null;
  return template
    .replace("{count}", String(rollup.pastBookings))
    .replace("{amount}", formatCentsUSD(rollup.totalSpendCents));
}

/* ------------------------------------------------------------- line flags ------------------------------------------------------------- */

/**
 * S5 line flags (`proposed_by`, `confirmed_at`, `priceDrift`) as the
 * `LineEditorRow` / panel item row draws them. `priceDrift` itself is the
 * pure function in `lib/pos/price-drift.ts`; this only turns its result into
 * the "catalog price now X" string the row shows, using the SAME formatter
 * (`formatCentsUSD`) as the rest of Money.
 */
export type ItemFlagsInput = {
  readonly proposedBy: "client" | "staff" | "system" | null;
  readonly proposedByName?: string | null;
  readonly confirmedAt: string | null;
  readonly drift: { readonly drifted: boolean; readonly catalogNowCents?: number | null } | null;
};

export type ItemFlags = {
  readonly proposedBy: "client" | "staff" | null;
  readonly proposedByName: string | null;
  readonly confirmed: boolean;
  readonly priceSnapshot: string | null;
};

export function itemFlagsFor(input: ItemFlagsInput): ItemFlags {
  return {
    proposedBy: input.proposedBy === "client" || input.proposedBy === "staff" ? input.proposedBy : null,
    proposedByName: input.proposedByName ?? null,
    confirmed: Boolean(input.confirmedAt),
    priceSnapshot: input.drift && input.drift.drifted && typeof input.drift.catalogNowCents === "number" ? formatCentsUSD(input.drift.catalogNowCents) : null,
  };
}
