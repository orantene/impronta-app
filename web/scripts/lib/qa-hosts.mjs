// Pure helpers for the QA host pool (qa-1..qa-6.tulala.digital). No I/O.
export const QA_POOL_SIZE = 6;
export const QA_DOMAIN = "tulala.digital";
export const QA_HOSTS = Array.from({ length: QA_POOL_SIZE }, (_, i) => `qa-${i + 1}.${QA_DOMAIN}`);
export const LEASE_TTL_MS = 24 * 60 * 60 * 1000;

/** True only for exactly the pooled hostnames (no ports, no subdomains). */
export function isQaPoolHost(host) {
  return typeof host === "string" && QA_HOSTS.includes(host.trim().toLowerCase());
}

/** True when `url` is https://qa-N.tulala.digital with no credentials or port. */
export function isQaPoolUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.port === "" && !u.username && !u.password && isQaPoolHost(u.hostname);
  } catch {
    return false;
  }
}

/**
 * Pick a host for `branch`.
 * leases: [{ host, branch, createdAt (ms) }] for hosts that currently have an alias.
 * liveBranches: Set of branches that still exist unmerged. now: ms.
 * Order: host already leased to this branch (reuse) > unassigned > stale
 * (branch gone or alias older than 24h, oldest first). Returns host or null.
 */
export function pickHost({ branch, leases, liveBranches, now }) {
  const byHost = new Map(leases.map((l) => [l.host, l]));
  const own = leases.find((l) => l.branch === branch && QA_HOSTS.includes(l.host));
  if (own) return own.host;
  const free = QA_HOSTS.find((h) => !byHost.has(h));
  if (free) return free;
  const stale = leases
    .filter((l) => QA_HOSTS.includes(l.host))
    .filter((l) => !liveBranches.has(l.branch) || now - l.createdAt > LEASE_TTL_MS)
    .sort((a, b) => a.createdAt - b.createdAt);
  return stale[0]?.host ?? null;
}

/** Resolve a `release` argument (host or branch) to hosts to free. */
export function hostsToRelease(arg, leases) {
  if (isQaPoolHost(arg)) return [arg.toLowerCase()];
  return leases.filter((l) => l.branch === arg).map((l) => l.host);
}

export function formatAge(ms) {
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return h < 48 ? `${h}h` : `${Math.floor(h / 24)}d`;
}

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "[::1]"];

/** Parity-tool --base-url guard: local servers, or exactly the QA pool. */
export function isAllowedParityBaseUrl(url) {
  try {
    return LOCAL_HOSTS.includes(new URL(url).hostname) || isQaPoolUrl(url);
  } catch {
    return false;
  }
}

/** Header for Vercel deployment protection; only for pool hosts, never logged. */
export function bypassHeaders(url, env = process.env) {
  const s = env.VERCEL_AUTOMATION_BYPASS_SECRET;
  return s && isQaPoolUrl(url) ? { "x-vercel-protection-bypass": s } : {};
}

// ---- Vercel share link (TUL-171). Pure; the script does the I/O. ----
export const SHARE_TTL_SECONDS = 23 * 60 * 60;
/** A link with less than this left is not worth handing to a tester. */
export const SHARE_MIN_REMAINING_MS = 60 * 60 * 1000;

/** Epoch ms from a Vercel `expires` value (accepts seconds or ms); null = never. */
function expiryMs(expires) {
  if (typeof expires !== "number" || !Number.isFinite(expires) || expires <= 0) return null;
  return expires < 1e12 ? expires * 1000 : expires;
}

/**
 * Normalise the `protectionBypass` map of an alias/deployment into share links.
 * ONLY scope "shareable-link" entries qualify: automation-bypass secrets live in
 * the same map and must never be surfaced. Returns [{ token, expiresAt|null }].
 */
export function shareLinksFrom(protectionBypass) {
  if (!protectionBypass || typeof protectionBypass !== "object") return [];
  return Object.entries(protectionBypass)
    .filter(([, v]) => v && typeof v === "object" && v.scope === "shareable-link")
    .map(([token, v]) => ({ token, expiresAt: expiryMs(v.expires) }));
}

/** Reuse decision: the unexpired link with the latest expiry (never-expiring wins), or null. */
export function pickShareLink(links, now) {
  const ok = links.filter((l) => l.expiresAt === null || l.expiresAt - now >= SHARE_MIN_REMAINING_MS);
  if (!ok.length) return null;
  return ok.reduce((a, b) => ((b.expiresAt ?? Infinity) > (a.expiresAt ?? Infinity) ? b : a));
}

/** https://qa-N.tulala.digital/?_vercel_share=<token>, or null for a non-pool host/empty token. */
export function buildShareUrl(host, token) {
  if (!isQaPoolHost(host) || typeof token !== "string" || !token) return null;
  return `https://${host.trim().toLowerCase()}/?_vercel_share=${encodeURIComponent(token)}`;
}

/** "expires in 22h" / "expired" / "no expiry" for `list`. */
export function formatExpiry(expiresAt, now) {
  if (expiresAt === null) return "no expiry";
  return expiresAt <= now ? "expired" : `expires in ${formatAge(expiresAt - now)}`;
}
