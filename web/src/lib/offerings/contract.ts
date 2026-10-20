/**
 * F2: the offering contract. ONE structured record per service that every
 * outward surface is projected from: the page facts, the Service JSON-LD, the
 * markdown view, llms.txt and the public API. A figure or a sentence that is
 * decided here cannot be decided differently on another surface.
 *
 * PURE. The price comes from the one public resolver (`resolvePublicPrice`);
 * who may buy comes from the one D-10 rule (`isGuestSellableOffering`). Nothing
 * here computes money: it only carries the stored amount and the label the
 * storefront already paints.
 *
 * D-10a is part of the contract, not a per-surface habit: an `on_request` or
 * quote service carries NO amount in any projection (`price.amountCents` is
 * null and `price.text` is the words), so it cannot leak as a figure through
 * JSON-LD, markdown, llms.txt or the API.
 */
import { isGuestSellableOffering } from "@/lib/offerings/guest-sellable";
import { resolvePublicPrice, type PublicPriceInput, type PublicPriceMode } from "@/lib/talent/public-price";

export type OfferingContractSource = PublicPriceInput & {
  id: string;
  title: string;
  description?: string | null;
  durationMinutes?: number | null;
  kind?: string | null;
  status?: string | null;
  moderationState?: string | null;
  publicCtaHidden?: boolean;
  imageUrls?: string[];
  category?: string | null;
  categoryLabel?: string;
  cancellationHours?: number | null;
};

/**
 * Contract version. Bump it when a field is removed or changes meaning; adding a
 * field does not bump it. Consumers (API clients, assistants) can branch on it.
 */
export const OFFERING_CONTRACT_VERSION = 1;

export type OfferingContract = {
  version: typeof OFFERING_CONTRACT_VERSION;
  id: string;
  title: string;
  /** Full text, whitespace collapsed. */
  description: string | null;
  /** First 280 characters, ending in an ellipsis when cut. */
  summary: string | null;
  durationMinutes: number | null;
  category: string | null;
  price: {
    mode: PublicPriceMode;
    /** The stored figure to state; null for quote and on request (D-10a). */
    amountCents: number | null;
    currency: string;
    /** The exact words every surface shows. */
    text: string;
  };
  /** A guest can buy it now: published, approved and public (D-10). */
  guestSellable: boolean;
  /** A person can reach the booking or inquiry button (the talent's switches leave a route). */
  bookable: boolean;
  /** Absolute page URL, when the caller knows it. */
  url: string | null;
  imageUrl: string | null;
  providerName: string | null;
  locale: string;
};

export const CONTRACT_SUMMARY_MAX = 280;

function collapse(raw: string | null | undefined): string | null {
  const t = (raw ?? "").replace(/\s+/g, " ").trim();
  return t || null;
}

export function buildOfferingContract(
  o: OfferingContractSource,
  ctx: { locale: string; url?: string | null; providerName?: string | null },
): OfferingContract {
  const price = resolvePublicPrice(o, ctx.locale);
  const description = collapse(o.description);
  const summary = description
    ? description.length > CONTRACT_SUMMARY_MAX
      ? `${description.slice(0, CONTRACT_SUMMARY_MAX - 1).trimEnd()}…`
      : description
    : null;
  return {
    version: OFFERING_CONTRACT_VERSION,
    id: o.id,
    title: o.title.trim(),
    description,
    summary,
    durationMinutes: typeof o.durationMinutes === "number" && o.durationMinutes > 0 ? o.durationMinutes : null,
    category: collapse(o.categoryLabel ?? o.category),
    price: {
      mode: price.mode,
      // D-10a: no figure for on request or quote, whatever the stored amount is.
      amountCents: price.mode === "exact" || price.mode === "from" ? price.cents : null,
      currency: price.currency,
      text: price.text,
    },
    // Fails CLOSED: a source that does not say it is published, approved and public is not sellable.
    guestSellable: isGuestSellableOffering({
      status: o.status,
      moderation_state: o.moderationState,
      visibility: o.visibility,
    }),
    bookable: o.publicCtaHidden !== true,
    url: ctx.url ?? null,
    imageUrl: o.imageUrls?.[0] ?? null,
    providerName: collapse(ctx.providerName),
    locale: ctx.locale,
  };
}

// ─── Projections ──────────────────────────────────────────────────────────────

/** The public API row (shape of the existing agent catalog `AgentService`). */
export function contractToApiService(c: OfferingContract): {
  id: string;
  title: string;
  description: string | null;
  duration_minutes: number | null;
  price: string;
  amount_cents: number | null;
  currency: string;
  /** exact | from | quote | on_request: a "from" figure is the lowest price, not the price. */
  price_mode: PublicPriceMode;
  bookable: boolean;
} {
  return {
    id: c.id,
    title: c.title,
    description: c.summary,
    duration_minutes: c.durationMinutes,
    price: c.price.text,
    amount_cents: c.price.amountCents,
    currency: c.price.currency,
    price_mode: c.price.mode,
    bookable: c.bookable,
  };
}

/** One llms.txt bullet: "- Title: price (duration)". */
export function contractToLlmsLine(c: OfferingContract): string {
  const duration = c.durationMinutes ? ` (${c.durationMinutes} min)` : "";
  return `- ${c.title}: ${c.price.text}${duration}`;
}

/** The markdown view of one service, for assistants and "copy as markdown". */
export function contractToMarkdown(c: OfferingContract): string {
  const lines = [`# ${c.title}`, ""];
  if (c.providerName) lines.push(`Provider: ${c.providerName}`);
  lines.push(`Price: ${c.price.text}`);
  if (c.durationMinutes) lines.push(`Duration: ${c.durationMinutes} min`);
  if (c.category) lines.push(`Category: ${c.category}`);
  if (c.url) lines.push(`Page: ${c.url}`);
  if (c.description) lines.push("", c.description);
  return `${lines.join("\n")}\n`;
}

/**
 * schema.org Service for the contract. An `Offer` is stated only when the
 * contract carries a figure; quote and on-request services state none.
 */
export function contractToJsonLd(c: OfferingContract): Record<string, unknown> {
  const hasPrice = c.price.amountCents != null && c.price.amountCents > 0;
  const money = hasPrice ? ((c.price.amountCents as number) / 100).toFixed(2) : "";
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    ...(c.url ? { "@id": c.url, url: c.url } : {}),
    name: c.title,
    ...(c.summary ? { description: c.summary } : {}),
    inLanguage: c.locale,
    ...(c.providerName ? { provider: { "@type": "Person", name: c.providerName } } : {}),
    ...(c.imageUrl ? { image: c.imageUrl } : {}),
    ...(hasPrice
      ? {
          // A "from" price is a LOWEST price: AggregateOffer.lowPrice, never an exact `price`.
          offers:
            c.price.mode === "from"
              ? { "@type": "AggregateOffer", lowPrice: money, priceCurrency: c.price.currency }
              : { "@type": "Offer", price: money, priceCurrency: c.price.currency },
        }
      : {}),
  };
}

/** The facts line a page paints under the title: price, duration, category. */
export function contractToFactsLine(c: OfferingContract): string {
  return [c.price.text, c.durationMinutes ? `${c.durationMinutes} min` : null, c.category].filter(Boolean).join(" · ");
}

/** A whole catalog as one markdown document (heading, then one section per service). */
export function contractsToMarkdown(title: string, contracts: readonly OfferingContract[]): string {
  const out = [`# ${title}`, ""];
  for (const c of contracts) {
    out.push(`## ${c.title}`, "", `Price: ${c.price.text}`);
    if (c.durationMinutes) out.push(`Duration: ${c.durationMinutes} min`);
    if (c.summary) out.push("", c.summary);
    out.push("");
  }
  return `${out.join("\n").trimEnd()}\n`;
}
