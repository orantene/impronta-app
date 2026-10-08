/**
 * ONE answer to "is the talent's personal website published?" for the top-bar
 * pill (WebsiteRewardControl) and the Services "item is live" banner
 * (PublishedBanner). They used to read different truths: the pill took the
 * live website flow OR the dashboard site row, the banner took a destination
 * list loaded once that also required a site slug, so the same screen could say
 * "Website live" and "that website is not published yet".
 */
import type { OfferingDestination } from "@/lib/talent/services-settings-actions";

export function isWebsitePublished(
  flowState: string | null | undefined,
  siteStatus: string | null | undefined,
): boolean {
  return flowState === "published" || siteStatus === "published";
}

/**
 * Destinations the banner names. When the website is published (per the same
 * flag as the pill) it is always listed, even if the one-off destinations read
 * predates the publish or the site has no slug yet.
 */
export function bannerDestinations(
  destinations: readonly OfferingDestination[],
  websitePublished: boolean,
): OfferingDestination[] {
  const hasWebsite = destinations.some((d) => d.id === "website");
  if (!websitePublished || hasWebsite) {
    // A destination row for an unpublished site cannot exist (loader filters
    // on status), but drop it defensively so the two sides cannot disagree.
    return websitePublished ? [...destinations] : destinations.filter((d) => d.id !== "website");
  }
  return [...destinations, { id: "website", label: "Your website", href: null, enquiryTo: "You" }];
}
