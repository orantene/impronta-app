/**
 * Hub profile primary CTA decision (TUL-170 / TUL-246). PURE.
 *
 * On the tulala.digital hub a talent WITH bookable services (the same
 * `resolveBookEntry` → sheet rule that `#book` uses) gets a primary "Book"
 * button that opens the on-page booking sheet via `#book`. A talent WITHOUT
 * bookable services keeps "Inquire about {name}". Agency hosts are untouched.
 *
 * The booking entry is the dedicated `#book` anchor (TUL-206,
 * `TALENT_BOOK_HREF`): cold load, paste, hashchange and click all open the
 * preferred bookable service's sheet. `#talent-ask` still opens the guest chat.
 */
import { TALENT_BOOK_HREF } from "@/lib/talent-site/contact-channels";

/** Where on the hub profile a Book CTA renders; every slot carries one, none carries an id. */
export type HubProfileCtaSlot = "header" | "sidebar" | "footer" | "freeform";

export type HubProfileCta =
  | { kind: "book"; href: string; external: boolean }
  | { kind: "inquire" };

/** Deep link to a talent site's booking entry, replacing any existing hash. */
export function talentSiteBookHref(siteUrl: string): string {
  const base = siteUrl.trim().split("#")[0] ?? "";
  return `${base}${TALENT_BOOK_HREF}`;
}

export function resolveHubProfileCta(input: {
  platformHost: boolean;
  /** True when the profile has ≥1 bookable service (`resolveBookEntry` → sheet). */
  hasBookableServices: boolean;
}): HubProfileCta {
  if (!input.platformHost || !input.hasBookableServices) return { kind: "inquire" };
  return {
    kind: "book",
    href: TALENT_BOOK_HREF,
    external: false,
  };
}
