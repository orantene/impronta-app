// Public talent hosts must stay public.
//
// 2026-10-09 ~4:25 pm Cancún: explicit Vercel aliases were created for
// jorg-beauty-qa, alex-trevino-demo and mateo-ferrer-demo .tulala.digital,
// pinning them to one deployment URL instead of letting the *.tulala.digital
// wildcard (a project production domain) serve them. For ~15 min strangers got a
// 302 to vercel.com/sso-api (the Vercel login wall), and afterwards the three
// hosts stayed frozen on that build, missing every later release. Nothing in the
// deploy smoke looked at these hosts or at explicit aliases.
//
// Two checks, both read-only:
//   1. each public talent host answers 200 to an anonymous GET (a 30x to the
//      Vercel SSO wall is a failure);
//   2. with VERCEL_TOKEN, no talent host under tulala.digital carries an explicit
//      alias (only the QA pool, staging and the platform hosts may).
//
// Pure decisions are exported for tests; the check takes its I/O as arguments.

export const TALENT_ROOT_DOMAIN = "tulala.digital";

/** Public demo + QA talent hosts that must answer 200 with no auth. */
export const PUBLIC_TALENT_HOSTS = [
  "book-jorgelina.tulala.digital",
  "jorg-beauty-qa.tulala.digital",
  "sofia-rinaldi-demo.tulala.digital",
  "alex-trevino-demo.tulala.digital",
  "mateo-ferrer-demo.tulala.digital",
];

/**
 * Subdomains of tulala.digital that MAY have an explicit alias: the platform
 * hosts the alias Action manages, the QA lease pool, and the staging hosts.
 */
const ALLOWED_EXPLICIT = [
  /^tulala\.digital$/,
  /^(www|app|impronta)\.tulala\.digital$/,
  /^qa-[1-6]\.tulala\.digital$/,
  /^qa-stripe-r2\.tulala\.digital$/,
  /^staging-[a-z0-9-]+\.tulala\.digital$/,
];

/**
 * Judge one anonymous GET. Returns { ok: true } or { ok: false, reason }.
 * `location` is the Location header (30x only).
 */
export function judgePublicHostResponse({ host, status, location }) {
  if (status === 200) return { ok: true };
  if (status >= 300 && status < 400 && /vercel\.com\/sso-api|_vercel_sso|vercel\.com\/login/i.test(location || "")) {
    return {
      ok: false,
      reason: `${host} redirects anonymous visitors to the Vercel login wall (${status}): an alias points it at a protected deployment`,
    };
  }
  return { ok: false, reason: `${host} answered ${status}${location ? ` -> ${location}` : ""}` };
}

/**
 * From a Vercel alias list, the talent hosts pinned by an explicit alias.
 * Returns [{ alias, deploymentUrl }].
 */
export function findPinnedTalentHosts(aliases) {
  const out = [];
  for (const a of aliases || []) {
    const name = String(a?.alias || "").toLowerCase();
    if (!name.endsWith(`.${TALENT_ROOT_DOMAIN}`)) continue;
    if (a?.deletedAt) continue;
    if (ALLOWED_EXPLICIT.some((re) => re.test(name))) continue;
    out.push({ alias: name, deploymentUrl: a?.deployment?.url || a?.deploymentId || "?" });
  }
  return out;
}

/**
 * The smoke check. deps: get(url) -> {status, headers}, pass(label), fail(label, reason),
 * warn(label, reason), env, fetchJson(url, token) -> parsed JSON.
 */
export async function checkPublicTalentHosts({ get, pass, fail, warn, env, fetchJson }) {
  console.log("\nPublic talent hosts (no login wall, no explicit alias pins)");
  for (const host of PUBLIC_TALENT_HOSTS) {
    try {
      const r = await get(`https://${host}/`);
      const v = judgePublicHostResponse({ host, status: r.status, location: r.headers?.location });
      if (v.ok) pass(`${host} answers 200 to an anonymous visitor`);
      else fail("public talent host", v.reason);
    } catch (e) {
      fail("public talent host", `${host}: ${e.message}`);
    }
  }
  const token = env?.VERCEL_TOKEN;
  if (!token) {
    warn("explicit alias pins", "VERCEL_TOKEN not set; alias pin check skipped");
    return;
  }
  try {
    const team = "team_otRX11wclvw89c5ls7A7UsZd";
    const project = "prj_oM9OZ4CLewpMPxpKfkacWs9nRcA2";
    const res = await fetchJson(
      `https://api.vercel.com/v4/aliases?teamId=${team}&projectId=${project}&domain=${TALENT_ROOT_DOMAIN}&limit=100`,
      token,
    );
    const pinned = findPinnedTalentHosts(res?.aliases);
    if (!pinned.length) pass("no talent host is pinned off the *.tulala.digital wildcard");
    else
      fail(
        "explicit alias pins",
        `${pinned.map((p) => `${p.alias} -> ${p.deploymentUrl}`).join(", ")}: these hosts no longer follow production; delete the alias`,
      );
  } catch (e) {
    warn("explicit alias pins", `check skipped: ${e.message}`);
  }
}
