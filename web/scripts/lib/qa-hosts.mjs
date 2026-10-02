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
