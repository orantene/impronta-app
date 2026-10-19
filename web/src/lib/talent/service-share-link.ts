/**
 * TUL-1270 #13: a lasting share link for one service. PURE.
 *
 * Stability comes from the offering id, never from the title:
 *  - a published talent website: the service page `servicio-<title>-<id8>`
 *    (TUL-586). The page resolves by `<id8>`; the title part is cosmetic, so a
 *    link copied before a rename still opens the same service.
 *  - otherwise the Tulala profile: `/t/<code>#book-<id8>`, which the hub
 *    `#book` bridge opens on that service's booking sheet (any other hash, or
 *    an id8 that is no longer bookable, falls back to the plain `#book`).
 * No signed token (the signed `?service=` intent expires in 30 minutes).
 */
import { serviceSlug, isServicePageEligible } from "@/lib/talent-site/service-page";
import { hubServiceHash } from "./service-share-hash";

export { HUB_SERVICE_HASH_PREFIX, hubServiceHash, offeringId8, parseHubServiceHash } from "./service-share-hash";

export type ShareDestination = { id: string; href: string | null };

export type ServiceShareTarget = {
  url: string;
  via: "website" | "profile";
};

export function serviceShareUrl(input: {
  offering: { id: string; title: string; kind: "service" | "package" | "product"; visibility?: string | null };
  destinations: readonly ShareDestination[];
  /** Origin for relative destination hrefs (the dashboard origin). */
  origin: string;
}): ServiceShareTarget | null {
  const { offering, destinations } = input;
  const website = destinations.find((d) => d.id === "website" && d.href)?.href ?? null;
  const eligible = isServicePageEligible({
    kind: offering.kind,
    title: offering.title,
    visibility: offering.visibility ?? undefined,
  });
  if (website && eligible) {
    return { url: `${website.replace(/\/+$/, "")}/${serviceSlug(offering)}`, via: "website" };
  }
  const profile = destinations.find((d) => d.id === "directory" && d.href)?.href ?? null;
  if (!profile) return null;
  const base = /^https?:\/\//.test(profile) ? profile : `${input.origin.replace(/\/+$/, "")}${profile}`;
  return { url: `${base}${hubServiceHash(offering.id)}`, via: "profile" };
}
