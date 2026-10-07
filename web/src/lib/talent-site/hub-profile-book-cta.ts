/**
 * Hub profile primary CTA decision (TUL-170). PURE.
 *
 * On the tulala.digital hub a talent WITH a published site (the same
 * `loadTalentMaxSiteLink` URL that drives "Visit my site") gets a primary
 * "Book" button that lands on her site's booking entry; a talent WITHOUT one
 * keeps the existing "Inquire about {name}" button. Agency hosts are untouched.
 *
 * The booking entry reuses `TALENT_ASK_HREF` (`#talent-ask`): the anchor every
 * talent site already honours on load and on click to open the guest dock
 * (service pick and booking sheet). Nothing here hand-builds a site URL; the
 * site URL comes from the caller.
 */
import { TALENT_ASK_HREF } from "@/lib/talent-site/contact-channels";

export type HubProfileCta =
  | { kind: "book"; href: string; external: boolean }
  | { kind: "inquire" };

/** Append the booking anchor to a site URL, replacing any existing hash. */
export function talentSiteBookHref(siteUrl: string): string {
  const base = siteUrl.trim().split("#")[0] ?? "";
  return `${base}${TALENT_ASK_HREF}`;
}

export function resolveHubProfileCta(input: {
  platformHost: boolean;
  maxSiteUrl: string | null | undefined;
}): HubProfileCta {
  const site = input.maxSiteUrl?.trim() ?? "";
  if (!input.platformHost || !site) return { kind: "inquire" };
  return {
    kind: "book",
    href: talentSiteBookHref(site),
    external: /^https?:\/\//i.test(site),
  };
}
