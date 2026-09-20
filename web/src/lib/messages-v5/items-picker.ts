/**
 * Pure helpers for the Messages v5 items picker (L5, boards D05, D17, D21,
 * M03) and the times sheet (D09). No I/O, no `server-only`: the catalog rows
 * come in already loaded (`lib/messages-v5/items-catalog.ts` reads them on the
 * server), and what leaves is a list of ENGINE CALLS the sheet then makes in
 * order. Principle 0: every call below names a writer the POS already has
 * (`messagingEnsureSharedDraft`, `posAddLine`, `posAddCustomLine`,
 * `rosterAddTalent`, `messagingSendOptions`); nothing here invents one. A
 * category with no engine (tables as a draft/offer line, D-MSG-122) comes
 * out as a `seam`, never as a silent drop. Tables as CHOICES are sendable
 * (D-MSG-156): `messagingSendOptions` takes the existing `service_card` kind
 * with `payload.variant = "table"` — no new kind, no CHECK change. The pick
 * still does not hold capacity (no reservation-hold writer wired to this
 * card yet); that half of the seam is unchanged and filed separately.
 */

import { resolveIndustryPreset } from "@/lib/words/presets";
import type { IdentityLevel } from "@/lib/messaging/types";

import { tableChoicePayload } from "./record-cards";

export type ItemCategory = "talent" | "package" | "service" | "class" | "ticket" | "table" | "menu";

export const ITEM_CATEGORIES: readonly ItemCategory[] = ["talent", "package", "service", "class", "ticket", "table", "menu"];

/** Free, busy for a stated reason, or not readable (drawn as free-looking but never asserted). */
export type ItemAvailability = { readonly kind: "free" } | { readonly kind: "busy"; readonly reason: ItemBusyReason } | { readonly kind: "unknown" };

export type ItemBusyReason = "booked" | "sold_out" | "full" | "ended";

export type TicketTier = {
  readonly variantId: string;
  readonly label: string;
  readonly amountCents: number;
  readonly seatsLeft: number | null;
};

/**
 * One row of the picker. `id` is unique across categories
 * (`<category>:<record id>`); the record ids the engine needs ride as
 * optional fields, one set per category:
 *  - talent: `talentProfileId`
 *  - package / service / menu: `offeringId`
 *  - class: `offeringId` + `sessionId`
 *  - ticket: `offeringId` + `sessionId` + `eventId` + `tiers` (the chosen
 *    tier is `variantId` on the selection, not on the row)
 *  - table: `startsAt` + `partySize` (seam: no writer, D-MSG-122)
 */
export type CatalogRow = {
  readonly id: string;
  readonly category: ItemCategory;
  readonly title: string;
  readonly sub: string | null;
  /** USD cents, or null when the row carries no price (a person, a table time). */
  readonly amountCents: number | null;
  readonly availability: ItemAvailability;
  readonly talentProfileId?: string;
  readonly offeringId?: string;
  readonly sessionId?: string;
  readonly eventId?: string;
  /** The event page slug (`/events/<slug>`), for a ticket row's Buy now. */
  readonly eventSlug?: string;
  readonly startsAt?: string;
  readonly endsAt?: string;
  readonly partySize?: number;
  readonly tiers?: readonly TicketTier[];
  readonly durationMinutes?: number | null;
};

export type CatalogGroup = { readonly category: ItemCategory; readonly rows: readonly CatalogRow[] };

/**
 * Chip order per business (README: "Category chips ordered per business").
 * Every category is always present so a workspace whose catalog has rows in
 * a category the preset does not "feature" still sees them; the ORDER is
 * what the preset changes: an agency sees Talent first, a restaurant Menu.
 */
export function categoryOrderForPreset(raw: unknown): ItemCategory[] {
  const preset = resolveIndustryPreset(raw);
  if (preset.representsPeople) return ["talent", "package", "service", "class", "ticket", "table", "menu"];
  if (preset.id === "restaurant" || preset.id === "bar_club" || preset.id === "beach_club") {
    return ["menu", "table", "ticket", "package", "service", "class", "talent"];
  }
  if (preset.features.appointments) return ["service", "package", "class", "ticket", "table", "menu", "talent"];
  if (preset.features.events) return ["ticket", "table", "package", "service", "class", "menu", "talent"];
  return ["package", "service", "class", "ticket", "table", "menu", "talent"];
}

/** Rows bucketed by category in the given order; empty categories are dropped. */
export function groupCatalog(rows: readonly CatalogRow[], order: readonly ItemCategory[] = ITEM_CATEGORIES): CatalogGroup[] {
  const buckets = new Map<ItemCategory, CatalogRow[]>();
  for (const row of rows) {
    const list = buckets.get(row.category) ?? [];
    list.push(row);
    buckets.set(row.category, list);
  }
  const out: CatalogGroup[] = [];
  for (const category of order) {
    const list = buckets.get(category);
    if (list && list.length > 0) out.push({ category, rows: list });
  }
  return out;
}

/** Case-insensitive substring over title and sub; a category narrows first. */
export function filterCatalog(rows: readonly CatalogRow[], query: string, category: ItemCategory | "all"): CatalogRow[] {
  const q = query.trim().toLowerCase();
  return rows.filter((row) => {
    if (category !== "all" && row.category !== category) return false;
    if (!q) return true;
    return row.title.toLowerCase().includes(q) || (row.sub ?? "").toLowerCase().includes(q);
  });
}

export function isSelectable(row: CatalogRow): boolean {
  return row.availability.kind !== "busy";
}

/** A picked row plus what the picker chose on it (tier, units). */
export type Selection = {
  readonly row: CatalogRow;
  readonly units: number;
  /** Tickets: the chosen tier. */
  readonly variantId?: string | null;
};

/** The "Custom line" row's fields (D05: "anything not in the catalog"). */
export type CustomLine = { readonly label: string; readonly amountCents: number };

export type SelectionTotal = {
  readonly count: number;
  readonly totalCents: number;
  /** True when a selected row carries no price, so the total is a floor, not the sum. */
  readonly partial: boolean;
};

export function lineAmountCents(sel: Selection): number | null {
  if (sel.row.category === "ticket") {
    const tier = sel.row.tiers?.find((t) => t.variantId === sel.variantId) ?? null;
    return tier ? tier.amountCents * sel.units : null;
  }
  return sel.row.amountCents == null ? null : sel.row.amountCents * sel.units;
}

export function selectionTotal(selected: readonly Selection[], custom: CustomLine | null = null): SelectionTotal {
  let total = 0;
  let partial = false;
  for (const sel of selected) {
    const cents = lineAmountCents(sel);
    if (cents == null) partial = true;
    else total += cents;
  }
  if (custom) total += custom.amountCents;
  return { count: selected.length + (custom ? 1 : 0), totalCents: total, partial };
}

/* ------------------------------------------------------------ send modes ------------------------------------------------------------ */

/** The three ways to send (D05 "How to send"). */
export type SendMode = "offer" | "choices" | "draft";

export const SEND_MODES: readonly SendMode[] = ["offer", "choices", "draft"];

export type OptionCardKind = "service_card" | "professional_times" | "class_card" | "tickets_card" | "menu_options";

/**
 * One engine call the sheet makes, in order. Every `action` names an
 * existing writer; `seam` names the category no writer serves yet.
 */
export type EngineCall =
  | { readonly action: "ensure_shared_draft" }
  | { readonly action: "add_line"; readonly offeringId: string; readonly units: number; readonly sessionId?: string | null; readonly variantId?: string | null; readonly label: string }
  | { readonly action: "add_custom_line"; readonly label: string; readonly amountCents: number }
  | { readonly action: "add_talent"; readonly talentProfileId: string; readonly label: string }
  | { readonly action: "send_options"; readonly kind: OptionCardKind; readonly payload: Record<string, unknown> }
  | { readonly action: "dispatch"; readonly id: "create_offer" }
  | { readonly action: "seam"; readonly category: ItemCategory; readonly reason: "no_card_kind" | "no_writer" | "custom_not_a_choice" };

/**
 * The card kind `messagingSendOptions` takes for one category. Tables were
 * `null` under D-MSG-122 ("no card kind"); D-MSG-156 closes that half of the
 * seam by reusing `service_card` with `payload.variant = "table"` (no CHECK
 * change, L11) — the writer half (a table pick still does not hold capacity,
 * `no_writer` below) is unchanged.
 */
export function cardKindForCategory(category: ItemCategory): OptionCardKind | null {
  switch (category) {
    case "talent":
    case "package":
    case "service":
    case "table":
      return "service_card";
    case "class":
      return "class_card";
    case "ticket":
      return "tickets_card";
    case "menu":
      return "menu_options";
  }
}

/** Kinds whose client pick HOLDS capacity (owner decision 3): a hold needs at least a linked identity (D21). */
export const HOLDING_CARD_KINDS: readonly OptionCardKind[] = ["professional_times", "class_card", "tickets_card"];

/**
 * Local refusal before any engine call: a choice card whose pick would hold
 * capacity cannot go to a thread with no identity at all (`identity_unconfirmed`,
 * the same code the engine's hold path answers). Null = nothing to refuse.
 */
export function holdRefusal(identityLevel: IdentityLevel | null, kinds: readonly OptionCardKind[]): "identity_unconfirmed" | null {
  if (identityLevel && identityLevel !== "none") return null;
  return kinds.some((k) => HOLDING_CARD_KINDS.includes(k)) ? "identity_unconfirmed" : null;
}

function lineCalls(selected: readonly Selection[]): EngineCall[] {
  const out: EngineCall[] = [];
  for (const sel of selected) {
    const row = sel.row;
    switch (row.category) {
      case "talent":
        if (row.talentProfileId) out.push({ action: "add_talent", talentProfileId: row.talentProfileId, label: row.title });
        break;
      case "package":
      case "service":
      case "menu":
        if (row.offeringId) out.push({ action: "add_line", offeringId: row.offeringId, units: sel.units, label: row.title });
        break;
      case "class":
        if (row.offeringId && row.sessionId) out.push({ action: "add_line", offeringId: row.offeringId, units: sel.units, sessionId: row.sessionId, label: row.title });
        break;
      case "ticket":
        if (row.offeringId && row.sessionId && sel.variantId) {
          out.push({ action: "add_line", offeringId: row.offeringId, units: sel.units, sessionId: row.sessionId, variantId: sel.variantId, label: row.title });
        }
        break;
      case "table":
        out.push({ action: "seam", category: "table", reason: "no_writer" });
        break;
    }
  }
  return out;
}

function optionCalls(selected: readonly Selection[], timezone: string): EngineCall[] {
  const out: EngineCall[] = [];
  const byCategory = new Map<ItemCategory, Selection[]>();
  for (const sel of selected) {
    const list = byCategory.get(sel.row.category) ?? [];
    list.push(sel);
    byCategory.set(sel.row.category, list);
  }
  // Talent, packages and services share one service_card (D05: "one list").
  const serviceLike = [...(byCategory.get("talent") ?? []), ...(byCategory.get("package") ?? []), ...(byCategory.get("service") ?? [])];
  if (serviceLike.length > 0) {
    out.push({
      action: "send_options",
      kind: "service_card",
      payload: {
        offeringIds: serviceLike.map((s) => s.row.offeringId ?? "").filter(Boolean),
        talentProfileIds: serviceLike.map((s) => s.row.talentProfileId ?? "").filter(Boolean),
        labels: serviceLike.map((s) => s.row.title),
        pricesCents: serviceLike.map((s) => s.row.amountCents),
        currency: "USD",
      },
    });
  }
  const menu = byCategory.get("menu") ?? [];
  if (menu.length > 0) {
    out.push({
      action: "send_options",
      kind: "menu_options",
      payload: {
        offeringIds: menu.map((s) => s.row.offeringId ?? "").filter(Boolean),
        labels: menu.map((s) => s.row.title),
        pricesCents: menu.map((s) => s.row.amountCents ?? 0),
        currency: "USD",
      },
    });
  }
  for (const sel of byCategory.get("class") ?? []) {
    const row = sel.row;
    out.push({
      action: "send_options",
      kind: "class_card",
      payload: {
        sessionId: row.sessionId,
        offeringId: row.offeringId,
        title: row.title,
        startsAt: row.startsAt,
        seatsLeft: row.availability.kind === "busy" ? 0 : null,
        waitlist: false,
        timezone,
      },
    });
  }
  for (const sel of byCategory.get("ticket") ?? []) {
    const row = sel.row;
    out.push({
      action: "send_options",
      kind: "tickets_card",
      payload: {
        eventId: row.eventId,
        sessionId: row.sessionId,
        offeringId: row.offeringId,
        title: row.title,
        startsAt: row.startsAt,
        tiers: (row.tiers ?? []).map((t) => ({ id: t.variantId, label: t.label, priceCents: t.amountCents })),
        currency: "USD",
      },
    });
  }
  const tables = byCategory.get("table") ?? [];
  if (tables.length > 0) {
    out.push({
      action: "send_options",
      kind: "service_card",
      payload: tableChoicePayload(
        tables.map((s) => ({
          label: s.row.title,
          partySize: s.row.partySize ?? 0,
          startsAt: s.row.startsAt ?? "",
        })),
      ),
    });
  }
  return out;
}

export type SendPlanInput = {
  readonly mode: SendMode;
  readonly selected: readonly Selection[];
  readonly custom: CustomLine | null;
  /** The venue's zone, written on class cards so the client link prints the venue's clock. */
  readonly timezone: string;
};

/**
 * Which engine calls one send mode makes, in order.
 *  - offer: shared draft, every line, then the shell opens the offer builder (`create_offer`).
 *  - choices: one `messagingSendOptions` per card kind; nothing on the draft
 *    (the client's pick writes the "client chose" line, owner decision 3).
 *  - draft: shared draft and the lines, nothing posted.
 */
export function sendModeToEngineCall(input: SendPlanInput): EngineCall[] {
  const { mode, selected, custom } = input;
  if (mode === "choices") {
    const calls = optionCalls(selected, input.timezone);
    if (custom) calls.push({ action: "seam", category: "menu", reason: "custom_not_a_choice" });
    return calls;
  }
  const lines = lineCalls(selected);
  if (custom) lines.push({ action: "add_custom_line", label: custom.label, amountCents: custom.amountCents });
  const needsDraft = lines.some((c) => c.action === "add_line" || c.action === "add_custom_line");
  const calls: EngineCall[] = needsDraft ? [{ action: "ensure_shared_draft" }, ...lines] : lines;
  if (mode === "offer") calls.push({ action: "dispatch", id: "create_offer" });
  return calls;
}

/** The option card kinds a plan would send (for `holdRefusal`). */
export function plannedCardKinds(calls: readonly EngineCall[]): OptionCardKind[] {
  const kinds: OptionCardKind[] = [];
  for (const c of calls) if (c.action === "send_options" && !kinds.includes(c.kind)) kinds.push(c.kind);
  return kinds;
}

/* ----------------------------------------------------------- times sheet ----------------------------------------------------------- */

export const TIMES_MIN = 3;
export const TIMES_MAX = 6;

/** D09: three to six slots per card; fewer says "pick more", more says "too many". */
export function timesSelectionState(count: number, available: number): "few" | "ok" | "many" | "none" {
  if (available === 0) return "none";
  if (count > TIMES_MAX) return "many";
  if (count < Math.min(TIMES_MIN, available)) return "few";
  return "ok";
}

/** The `professional_times` payload `messagingSendOptions` inserts (ThreadCards reads `slots[].startsAt` / `professionalName`). */
export function timesPayload(input: { readonly starts: readonly string[]; readonly professionalName: string | null; readonly talentProfileId: string | null; readonly offeringId: string | null; readonly timezone: string }): Record<string, unknown> {
  return {
    slots: input.starts.map((startsAt) => ({ startsAt, professionalName: input.professionalName })),
    talentProfileId: input.talentProfileId,
    offeringId: input.offeringId,
    timezone: input.timezone,
  };
}
