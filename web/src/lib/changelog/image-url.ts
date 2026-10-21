import { isIP } from "node:net";

import { isBlockedHostname, isPrivateIp } from "@/lib/ssrf-guard";

/**
 * TUL-1584: an image address typed into Notion (an external image or cover) is fetched by the
 * cron. Pre-check it before any request: https only, no credentials in the URL, and never a
 * loopback, private, link-local or metadata host. (Hostnames that RESOLVE to a private address,
 * and redirects, are refused by `safeFetch`, which does the actual fetch.)
 */
export type ChangelogImageUrlCheck =
  | { ok: true; url: string }
  | { ok: false; reason: "malformed" | "scheme" | "credentials" | "blocked_host" };

export function checkChangelogImageUrl(raw: string): ChangelogImageUrlCheck {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (url.protocol !== "https:") return { ok: false, reason: "scheme" };
  if (url.username || url.password) return { ok: false, reason: "credentials" };
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!host || isBlockedHostname(host) || (isIP(host) !== 0 && isPrivateIp(host))) {
    return { ok: false, reason: "blocked_host" };
  }
  return { ok: true, url: url.toString() };
}
