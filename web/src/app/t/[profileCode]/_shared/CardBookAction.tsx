/**
 * The Book action on a storefront card (TUL-1272).
 *
 * `ownerBookHref` undefined: the card's normal in-place CTA (unchanged on every
 * non-hub host). A string: the row is sold by another workspace, so the hub
 * card links to that workspace's own booking page instead of opening checkout
 * in the hub tenant. null: no safe booking address, so no action at all.
 *
 * Directive-free so the server body and the client filter island both render it.
 */

import type { TalentOffering } from "@/lib/talent/offerings-types";
import { pickLocale } from "@/lib/i18n/pick-locale";
import { OfferingCta } from "./OfferingCta";

export function CardBookAction({
  it,
  locale,
  compact = false,
  confirmsByHand = false,
  ownerBookHref,
}: {
  it: TalentOffering;
  locale: string;
  compact?: boolean;
  confirmsByHand?: boolean;
  ownerBookHref?: string | null;
}) {
  if (ownerBookHref === undefined) {
    return <OfferingCta offering={it} locale={locale} compact={compact} confirmsByHand={confirmsByHand} />;
  }
  if (ownerBookHref === null) return null;
  return (
    <a
      href={ownerBookHref}
      data-owner-book-link={it.id}
      className={`inline-flex min-w-11 max-w-full items-center justify-center whitespace-normal text-center rounded-[10px] font-medium transition-opacity hover:opacity-85 ${
        compact ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-[0.8125rem]"
      }`}
      style={{ background: "transparent", color: "var(--plt-ink)", border: "1px solid var(--plt-hairline-strong)" }}
    >
      {pickLocale(locale, { en: "Book", es: "Reservar" })}
    </a>
  );
}
