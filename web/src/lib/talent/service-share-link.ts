/**
 * TUL-1270 #13: a lasting share link for one service. PURE.
 *
 * Stability comes from the offering id, never from the title:
 *  - a published talent website: the service page `servicio-<title>-<id8>`
 *    (TUL-586). The page resolves by `<id8>`; the title part is cosmetic, so a
 *    link copied before a rename still opens the same service.
 *  - otherwise the Tulala profile on its canonical platform host (the apex,
 *    `talentCanonicalOrigin`): `/t/<code>#book-<id8>`, which the hub
 *    `#book` bridge opens on that service's booking sheet (any other hash, or
 *    an id8 that is no longer bookable, falls back to the plain `#book`).
 * No signed token (the signed `?service=` intent expires in 30 minutes).
 */
import { isServicePageEligible, isServicePubliclyServed, servicePageUrl } from "@/lib/talent-site/service-page";
import { hubServiceHash } from "./service-share-hash";

export { HUB_SERVICE_HASH_PREFIX, hubServiceHash, offeringId8, parseHubServiceHash } from "./service-share-hash";

/** `shareUrl`: the absolute public URL the server resolved (canonical `/t` host). */
export type ShareDestination = { id: string; href: string | null; shareUrl?: string | null };

export type ServiceShareTarget = {
  url: string;
  via: "website" | "profile";
};

/**
 * TUL-1270: false while the service is a draft, archived, unapproved or agency-only. Its public
 * page (and the hub booking sheet) does not exist yet, so the share sheet says so instead of
 * copying a link that 404s.
 */
export function isServiceShareable(o: ShareOffering): boolean {
  return isServicePubliclyServed({
    kind: o.kind,
    title: o.title,
    visibility: (o.visibility ?? undefined) as never,
    status: o.status,
    moderationState: o.moderationState,
  });
}

type ShareOffering = {
  id: string;
  title: string;
  kind: "service" | "package" | "product";
  visibility?: string | null;
  status?: string | null;
  moderationState?: string | null;
};

export function serviceShareUrl(input: {
  offering: ShareOffering;
  destinations: readonly ShareDestination[];
  /** Origin for relative destination hrefs (the dashboard origin). */
  origin: string;
}): ServiceShareTarget | null {
  const { offering, destinations } = input;
  // Products have no page but share the profile (below); everything else must be live.
  if (offering.kind !== "product" && !isServiceShareable(offering)) return null;
  if (offering.kind === "product" && (offering.status ?? "published") !== "published") return null;
  const website = destinations.find((d) => d.id === "website" && d.href)?.href ?? null;
  const eligible = isServicePageEligible({
    kind: offering.kind,
    title: offering.title,
    visibility: offering.visibility ?? undefined,
  });
  if (website && eligible) {
    return { url: servicePageUrl(website, offering), via: "website" };
  }
  const dir = destinations.find((d) => d.id === "directory" && (d.shareUrl || d.href));
  if (!dir) return null;
  // The server-resolved canonical URL wins: the dashboard origin may be an agency
  // host, where `/t/<code>` renders the agency roster view without the #book bridge.
  const profile = (dir.shareUrl || dir.href)!;
  const base = /^https?:\/\//.test(profile) ? profile : `${input.origin.replace(/\/+$/, "")}${profile}`;
  return { url: `${base}${hubServiceHash(offering.id)}`, via: "profile" };
}
