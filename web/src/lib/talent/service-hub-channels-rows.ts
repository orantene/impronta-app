/**
 * service-hub-channels-rows.ts — database rows (workspace_service_listings and
 * workspace_talent_terms, TUL-1367 / TUL-1368) to the pure channel model
 * (TUL-1371). No I/O. Anything malformed is dropped and anything whose "you get"
 * cannot be known is left unknown (null), never guessed.
 */

import type { Channel, ChannelTerms, SoldListing } from "./service-hub-channels";

type Raw = Record<string, unknown>;

const int = (v: unknown): number | null => (typeof v === "number" && Number.isInteger(v) ? v : typeof v === "string" && /^\d+$/.test(v) ? Number.parseInt(v, 10) : null);
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

export type TermsRowLite = {
  tenantId: string;
  version: number;
  status: string;
  workModel: string;
  shareKind: string;
  shareBps: number | null;
  shareAmountCents: number | null;
  shareCurrency: string | null;
};

export function parseTermsRowLite(raw: Raw): TermsRowLite | null {
  const tenantId = str(raw.tenant_id);
  const version = int(raw.version);
  const status = str(raw.status);
  const shareKind = str(raw.share_kind);
  if (!tenantId || version == null || !status || !shareKind) return null;
  return {
    tenantId,
    version,
    status,
    workModel: str(raw.work_model) ?? "",
    shareKind,
    shareBps: int(raw.share_bps),
    shareAmountCents: int(raw.share_amount_cents),
    shareCurrency: str(raw.share_currency),
  };
}

/** The accepted terms in force per workspace: the highest accepted version. */
function inForce(terms: readonly Raw[]): Map<string, TermsRowLite> {
  const out = new Map<string, TermsRowLite>();
  for (const raw of terms) {
    const t = parseTermsRowLite(raw);
    if (!t || t.status !== "accepted") continue;
    const cur = out.get(t.tenantId);
    if (!cur || t.version > cur.version) out.set(t.tenantId, t);
  }
  return out;
}

export function soldListingsFromRows(input: {
  talentPriceCents: number;
  currency: string;
  listings: readonly Raw[];
  terms: readonly Raw[];
  tenantNames: ReadonlyMap<string, string>;
}): SoldListing[] {
  const { talentPriceCents: price, currency } = input;
  const out: SoldListing[] = [
    { channel: { kind: "my_site" }, listPriceCents: price, terms: { model: "none" }, minAcceptCents: null },
    { channel: { kind: "hub" }, listPriceCents: price, terms: { model: "none" }, minAcceptCents: null },
  ];
  const force = inForce(input.terms);
  for (const raw of input.listings) {
    const tenantId = str(raw.tenant_id);
    const status = str(raw.status);
    const mode = str(raw.price_mode);
    if (!tenantId || !mode || (status !== "accepted" && status !== "offered")) continue;
    const listCurrency = str(raw.currency) ?? currency;
    let listPrice: number | null = null;
    if (mode === "talent_price") listPrice = price;
    else if (mode === "margin") {
      const bps = int(raw.margin_bps);
      listPrice = bps == null ? null : price + Math.round((price * bps) / 10000);
    } else if (mode === "fixed" || mode === "from") listPrice = int(raw.price_cents);
    if (listPrice == null) continue;

    const t = force.get(tenantId);
    let terms: ChannelTerms = { model: "custom" };
    if (t && listCurrency === currency) {
      if (t.shareKind === "percent" && t.shareBps != null) terms = { model: "percent", percentBps: t.shareBps };
      else if (t.shareKind === "fixed" && t.shareAmountCents != null && t.shareCurrency === currency) {
        terms = { model: "fixed", fixedCents: t.shareAmountCents };
      } else if (t.shareKind === "margin" && listPrice >= price) {
        // The workspace's margin sits on top of her price: she keeps her own price.
        terms = { model: "fixed", fixedCents: listPrice - price };
      }
    }
    const channel: Channel = { kind: "workspace", tenantId, name: input.tenantNames.get(tenantId) ?? tenantId };
    out.push({
      channel,
      listPriceCents: listPrice,
      terms,
      minAcceptCents: int(raw.talent_lowest_cents),
      status: status === "offered" ? "offered" : "accepted",
      ...(str(raw.id) ? { listingId: str(raw.id)! } : {}),
    });
  }
  return out;
}

export type Appearance = {
  tenantId: string;
  name: string;
  workModel: string;
  state: "accepted" | "pending";
  shareKind: string;
  shareBps: number | null;
  shareAmountCents: number | null;
  shareCurrency: string | null;
};

/** One line per workspace: accepted terms in force, else the waiting proposal. Declined and old ones are not shown. */
export function appearingIn(input: { terms: readonly Raw[]; tenantNames: ReadonlyMap<string, string> }): Appearance[] {
  const accepted = inForce(input.terms);
  const pending = new Map<string, TermsRowLite>();
  for (const raw of input.terms) {
    const t = parseTermsRowLite(raw);
    if (t && t.status === "pending" && !accepted.has(t.tenantId)) pending.set(t.tenantId, t);
  }
  const rows: Appearance[] = [];
  for (const [state, map] of [["accepted", accepted], ["pending", pending]] as const) {
    for (const t of map.values()) {
      rows.push({
        tenantId: t.tenantId,
        name: input.tenantNames.get(t.tenantId) ?? t.tenantId,
        workModel: t.workModel,
        state,
        shareKind: t.shareKind,
        shareBps: t.shareBps,
        shareAmountCents: t.shareAmountCents,
        shareCurrency: t.shareCurrency,
      });
    }
  }
  return rows;
}

function money(cents: number, currency: string | null): string {
  return `${currency ?? ""} ${(cents / 100).toFixed(2)}`.trim();
}

const pct = (bps: number) => `${Number((bps / 100).toFixed(2))}%`;

export function shareLine(
  s: { shareKind: string; shareBps: number | null; shareAmountCents: number | null; shareCurrency: string | null },
  locale: string,
): string {
  const es = locale.toLowerCase().startsWith("es");
  switch (s.shareKind) {
    case "percent":
      return s.shareBps == null ? "" : es ? `${pct(s.shareBps)} para el espacio de trabajo` : `${pct(s.shareBps)} to the workspace`;
    case "margin":
      return s.shareBps == null ? "" : es ? `Suma ${pct(s.shareBps)} encima` : `Adds ${pct(s.shareBps)} on top`;
    case "fixed":
      return s.shareAmountCents == null ? "" : es ? `${money(s.shareAmountCents, s.shareCurrency)} por venta` : `${money(s.shareAmountCents, s.shareCurrency)} per sale`;
    case "per_hour":
      return s.shareAmountCents == null ? "" : es ? `${money(s.shareAmountCents, s.shareCurrency)} por hora` : `${money(s.shareAmountCents, s.shareCurrency)} per hour`;
    case "rent":
      return s.shareAmountCents == null ? "" : es ? `Renta ${money(s.shareAmountCents, s.shareCurrency)}` : `Rent ${money(s.shareAmountCents, s.shareCurrency)}`;
    default:
      return "";
  }
}

/**
 * A table that does not exist yet (the held TUL-1367 / TUL-1368 migrations are
 * not applied): the page shows nothing rather than an error. Any OTHER error is
 * a failed read and must not look like "no listings".
 */
export function isMissingRelation(error: { code?: string | null } | null | undefined): boolean {
  return !!error && (error.code === "42P01" || error.code === "PGRST205");
}

const MODEL_LABELS: Record<string, { en: string; es: string }> = {
  coordinator_agency: { en: "Coordinator agency", es: "Agencia coordinadora" },
  open_network: { en: "Open network", es: "Red abierta" },
  team_studio: { en: "Team studio", es: "Estudio de equipo" },
  rental_studio: { en: "Rental studio", es: "Estudio de renta" },
  friends_collective: { en: "Collective", es: "Colectivo" },
};

/** The working model in the reader's language. An unknown model reads as-is, never hidden. */
export function workModelLabel(model: string, locale: string): string {
  const l = MODEL_LABELS[model];
  if (!l) return model;
  return locale.toLowerCase().startsWith("es") ? l.es : l.en;
}
