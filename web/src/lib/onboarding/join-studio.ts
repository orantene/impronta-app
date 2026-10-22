/**
 * TUL-75 · agency-talent path: a talent asks to join a studio from their own
 * Settings. Pure: turns whatever the talent pasted (the studio's address, its
 * Tulala link, or its own domain) into something the server can look up.
 */

export type StudioReference = { kind: "slug"; slug: string } | { kind: "host"; host: string };

export type JoinStudioErrorCode =
  | "read_only"
  | "signed_out"
  | "bad_address"
  | "too_many"
  | "no_profile"
  | "already_pending"
  | "already_member"
  | "exclusive"
  | "not_found"
  | "failed";

/**
 * TUL-1882: what a talent already has with a studio, from its roster rows (every status) and the
 * count of approved applications. Active = a member, pending = a request already waiting. An approved
 * application with no roster row at all counts as a member (the row is the thing that lags). A removed or
 * inactive row means the talent may ask again. Pure.
 */
export function existingStudioState(rosterStatuses: readonly string[], approvedApplications: number): "already_member" | "already_pending" | null {
  if (rosterStatuses.includes("active")) return "already_member";
  if (rosterStatuses.includes("pending")) return "already_pending";
  if (rosterStatuses.length === 0 && approvedApplications > 0) return "already_member";
  return null;
}

const PLATFORM_APEX = "tulala.digital";
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;
const LOCALE_SEGMENTS = new Set(["es", "en"]);

/**
 * `platformHosts`: the hostnames of the CURRENT environment's app and marketing origins
 * (env-derived by the caller), so a staging `/w/<slug>` link resolves like the production one.
 */
export function parseStudioReference(raw: string, platformHosts: ReadonlyArray<string> = []): StudioReference | null {
  const input = raw.trim().toLowerCase();
  if (!input || input.length > 300) return null;
  if (SLUG_RE.test(input)) return { kind: "slug", slug: input };

  let url: URL;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:\/\//.test(input) ? input : `https://${input}`);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  const host = url.hostname.replace(/\.$/, "");
  if (!host.includes(".")) return null;
  const bareHost = host.startsWith("www.") ? host.slice(4) : host;

  if (bareHost === PLATFORM_APEX || bareHost === `app.${PLATFORM_APEX}` || platformHosts.includes(bareHost)) {
    const segs = url.pathname.split("/").filter(Boolean);
    if (segs[0] && LOCALE_SEGMENTS.has(segs[0])) segs.shift();
    if (segs[0] === "w" && segs[1] && SLUG_RE.test(segs[1])) return { kind: "slug", slug: segs[1] };
    return null;
  }
  return { kind: "host", host: bareHost };
}
