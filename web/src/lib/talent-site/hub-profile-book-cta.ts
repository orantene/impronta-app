/**
 * Hub profile primary CTA decision (TUL-170). PURE.
 *
 * On the tulala.digital hub a talent WITH a published site (the same
 * `loadTalentMaxSiteLink` URL that drives "Visit my site") gets a primary
 * "Book" button that lands on her site's booking entry; a talent WITHOUT one
 * keeps the existing "Inquire about {name}" button. Agency hosts are untouched.
 *
 * The booking entry is the dedicated `#book` anchor (TUL-206,
 * `TALENT_BOOK_HREF`): every talent site opens its guest entry (service pick,
 * then the booking sheet) on it, on a cold load as well as on click. The old
 * `#talent-ask` anchor still works. Nothing here hand-builds a site URL; the
 * site URL comes from the caller.
 *
 * The CTA honours the talent's intake switches: when the ask entry has no
 * working entry point (`unavailable`, `hidden`, `closed_notice`,
 * `existing_client`) the site has nothing for Book to open, so the existing
 * Inquire controls (which already carry their own guard) stay.
 */
import { TALENT_BOOK_HREF } from "@/lib/talent-site/contact-channels";
import { askEntryPointsVisible, type TalentAskEntry } from "@/lib/talent/chat-entry";

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
  maxSiteUrl: string | null | undefined;
  /** Resolved intake state; omitted means unknown, treated as open. */
  askEntry?: TalentAskEntry;
}): HubProfileCta {
  const site = input.maxSiteUrl?.trim() ?? "";
  if (!input.platformHost || !site) return { kind: "inquire" };
  if (input.askEntry !== undefined && !askEntryPointsVisible(input.askEntry)) {
    return { kind: "inquire" };
  }
  return {
    kind: "book",
    href: talentSiteBookHref(site),
    external: /^https?:\/\//i.test(site),
  };
}
