/**
 * ssrf-guard.ts — the one copy of "is it safe to fetch this URL".
 *
 * Extracted from `messages/unfurl.ts` when a second feature needed to fetch
 * user-supplied URLs. The alternative was a second copy of the range checks,
 * which is how SSRF bugs actually happen: someone patches one copy, the other
 * keeps the hole, and nothing fails to tell them.
 *
 * `unfurl.ts` is a `"use server"` module, so every export in it becomes a server
 * action. That is why this lives in a plain module instead — a guard is not an
 * action, and shipping `isPrivateIp` as a callable endpoint would be absurd.
 *
 * WHAT IT DEFENDS AGAINST
 * ──────────────────────
 * Someone pasting `http://169.254.169.254/latest/meta-data/` into an import box
 * and reading the reply, or pointing a hostname they control at 127.0.0.1 after
 * the check has passed. The scheme allowlist, the hostname blocklist and the DNS
 * range check together close the direct cases; `redirect: "manual"` at the call
 * site closes the redirect-into-internal case, which is why callers must set it.
 *
 * WHAT IT DOES NOT CLOSE
 * ──────────────────────
 * A true DNS-rebinding race, where the name resolves publicly for the check and
 * privately for the fetch. Closing that requires pinning the checked IP into the
 * connection, which Node's fetch does not expose. Accepted, and written down
 * here rather than left as an unstated assumption.
 *
 * H1 (2026-10-19): `@/lib/security/safe-fetch` closes it. It reuses the range
 * checks below, pins the vetted IP into the socket, and re-validates every
 * redirect hop. New code that fetches a user URL uses `safeFetch`, not this
 * pre-flight plus a bare `fetch`.
 */

import { lookup as dnsLookup } from "node:dns/promises";
import { isIP } from "node:net";

export type UrlSafetyResult =
  | { ok: true; url: URL }
  | { ok: false; reason: "malformed" | "scheme" | "blocked_host" | "private_address" };

/**
 * Validate a user-supplied URL and resolve its host, or explain the refusal.
 *
 * Reasons are returned rather than a bare boolean because callers word their
 * errors differently: an import box says "that link does not look public", while
 * a link preview says nothing at all and renders no card.
 */
export async function assertPublicHttpUrl(
  raw: string,
  options: { maxLength?: number } = {},
): Promise<UrlSafetyResult> {
  const maxLength = options.maxLength ?? 2048;
  if (typeof raw !== "string" || raw.length === 0 || raw.length > maxLength) {
    return { ok: false, reason: "malformed" };
  }

  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, reason: "scheme" };
  }

  const host = parsed.hostname;
  if (!host || isBlockedHostname(host)) {
    return { ok: false, reason: "blocked_host" };
  }

  if (!(await isHostPubliclyRoutable(host))) {
    return { ok: false, reason: "private_address" };
  }

  return { ok: true, url: parsed };
}

export function isBlockedHostname(host: string): boolean {
  const h = host.toLowerCase().replace(/\.$/, "");
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h === "metadata" || h.endsWith(".internal") || h.endsWith(".local")) return true;
  // Bare IP literals are validated by the range check below; block obvious ones early.
  if (isIP(h) && isPrivateIp(h)) return true;
  return false;
}

export async function isHostPubliclyRoutable(host: string): Promise<boolean> {
  // If the host is already an IP literal, just range-check it.
  if (isIP(host)) return !isPrivateIp(host);
  try {
    const records = await dnsLookup(host, { all: true });
    if (!records || records.length === 0) return false;
    for (const r of records) {
      if (isPrivateIp(r.address)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function isPrivateIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return isPrivateIpv4(ip);
  if (v === 6) return isPrivateIpv6(ip);
  return true; // unknown shape → treat as unsafe
}

function isPrivateIpv4(ip: string): boolean {
  const parts = ip.split(".").map((p) => Number.parseInt(p, 10));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
    return true;
  }
  const [a, b] = parts;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10/8
  if (a === 127) return true; // loopback
  if (a === 169 && b === 254) return true; // link-local + metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16/12
  if (a === 192 && b === 168) return true; // 192.168/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  const c = parts[2]!;
  if (a === 192 && b === 0 && (c === 0 || c === 2)) return true; // IETF 192.0.0/24, TEST-NET-1
  if (a === 192 && b === 88 && c === 99) return true; // 6to4 relay anycast
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking 198.18/15
  if (a === 198 && b === 51 && c === 100) return true; // TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return true; // TEST-NET-3
  if (a >= 224) return true; // multicast + reserved
  return false;
}

/**
 * Parse any textual IPv6 (compressed, zone id, embedded dotted v4) into 8
 * hextets, or null. A string match on "::ffff:" missed the hex form
 * `::ffff:7f00:1`, which is 127.0.0.1 all the same.
 */
function parseIpv6(ip: string): number[] | null {
  let h = ip.toLowerCase();
  const zone = h.indexOf("%");
  if (zone >= 0) h = h.slice(0, zone);
  const dotted = /(\d+\.\d+\.\d+\.\d+)$/.exec(h);
  if (dotted) {
    const v4 = dotted[1]!.split(".").map((p) => Number.parseInt(p, 10));
    if (v4.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return null;
    h =
      h.slice(0, h.length - dotted[1]!.length) +
      ((v4[0]! << 8) | v4[1]!).toString(16) + ":" + ((v4[2]! << 8) | v4[3]!).toString(16);
  }
  const halves = h.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...tail];
  const out: number[] = [];
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    out.push(Number.parseInt(g, 16));
  }
  return out.length === 8 ? out : null;
}

function v4FromHextets(hi: number, lo: number): string {
  return `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
}

function isPrivateIpv6(ip: string): boolean {
  const g = parseIpv6(ip);
  if (!g) return true; // unparseable → unsafe
  const [g0, g1, g2, g3, g4, g5, g6, g7] = g as [number, number, number, number, number, number, number, number];
  const firstFiveZero = g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0;
  // ::/96 covers :: (unspecified), ::1 (loopback) and the deprecated
  // IPv4-compatible form; ::ffff:0:0/96 is IPv4-mapped. Both embed a v4.
  if (firstFiveZero && (g5 === 0 || g5 === 0xffff)) {
    if (g5 === 0 && g6 === 0) return true; // ::, ::1 and the rest of ::/112
    return isPrivateIpv4(v4FromHextets(g6, g7));
  }
  if (g0 === 0x64 && g1 === 0xff9b) {
    if (g2 === 1) return true; // 64:ff9b:1::/48 local-use NAT64
    return isPrivateIpv4(v4FromHextets(g6, g7)); // 64:ff9b::/96 NAT64
  }
  if (g0 === 0x2002) return isPrivateIpv4(v4FromHextets(g1, g2)); // 6to4 embeds a v4
  if (g0 === 0x100 && g1 === 0 && g2 === 0 && g3 === 0) return true; // discard 100::/64
  if (g0 === 0x2001 && g1 === 0) return true; // Teredo 2001::/32 tunnels to anywhere
  if (g0 === 0x2001 && g1 === 0xdb8) return true; // documentation
  if ((g0 & 0xfe00) === 0xfc00) return true; // unique-local fc00::/7
  if ((g0 & 0xffc0) === 0xfe80) return true; // link-local fe80::/10
  if ((g0 & 0xffc0) === 0xfec0) return true; // site-local fec0::/10 (deprecated)
  if ((g0 & 0xff00) === 0xff00) return true; // multicast ff00::/8
  return false;
}

/**
 * Read a response body up to `maxBytes` and decode it as UTF-8.
 *
 * Capped because the caller is fetching a page it has never seen, and a
 * multi-gigabyte response would be a denial of service with no attacker
 * ingenuity required at all. Reads stop at the cap and the partial text is
 * returned: a truncated page still yields a title.
 */
export async function readCappedText(
  res: Response,
  maxBytes: number,
): Promise<string | null> {
  const body = res.body;
  if (!body) {
    // No stream — fall back to text() but still bound it.
    const txt = await res.text();
    return txt.slice(0, maxBytes * 2);
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        total += value.byteLength;
        if (total >= maxBytes) break;
      }
    }
  } finally {
    try {
      await reader.cancel();
    } catch {
      /* ignore */
    }
  }
  if (total === 0) return null;
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: false }).decode(merged);
}
