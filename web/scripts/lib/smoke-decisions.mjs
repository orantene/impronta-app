// Pure decision logic for scripts/post-deploy-smoke-test.mjs. No I/O, so it is
// unit-testable with plain values (see smoke-decisions.test.mjs).

/**
 * /get-started on the marketing host deliberately 307s to /start (batch 1,
 * #2589/#2591). Only that exact shape passes: status 307 AND a Location whose
 * path ends in /start (absolute or relative; query string ignored).
 * Anything else, including 200, 301/302/308, or a different target, fails.
 */
export function judgeGetStartedRedirect(status, location) {
  if (status !== 307) {
    return { ok: false, reason: `expected 307 to /start, got ${status}${location ? " " + location : ""}` };
  }
  let path;
  try {
    path = new URL(String(location ?? ""), "https://placeholder.invalid").pathname;
  } catch {
    return { ok: false, reason: `307 with unparseable Location "${location ?? ""}"` };
  }
  if (!location || !path.endsWith("/start")) {
    return { ok: false, reason: `expected 307 Location ending in /start, got "${location ?? ""}"` };
  }
  return { ok: true, detail: `307 to ${location}` };
}

const PRIVATE_CC = /(^|[\s,])(private|no-store)([\s,=]|$)/i;
const SHARED_CACHE_HIT = new Set(["HIT", "STALE", "REVALIDATED", "PRERENDER"]);

/**
 * TUL-1131 (guards TUL-445 / TUL-755): the CDN must never hand the anonymous talent-site page
 * to a cookie-bearing visitor. Two requests to the same URL:
 *  - anonymous: 200 and cacheable (Cache-Control is not private / no-store);
 *  - with an `sb-*` auth or `impronta_guest` cookie: x-vercel-cache MISS or BYPASS, or a
 *    private / no-store Cache-Control. HIT, STALE, REVALIDATED or PRERENDER on the cookie
 *    request means a shared copy was served to a signed-in/guest visitor: fail.
 * Pure: takes `{status, headers}` (lower-case header names) for each request.
 */
export function judgeTalentSiteCacheHeaders(anon, withCookie) {
  const h = (r, k) => String(r?.headers?.[k] ?? "");
  if (anon?.status !== 200) {
    return { ok: false, reason: `anonymous GET expected 200, got ${anon?.status}` };
  }
  if (PRIVATE_CC.test(h(anon, "cache-control"))) {
    return { ok: false, reason: `anonymous page is not cacheable (cache-control: ${h(anon, "cache-control")})` };
  }
  if (withCookie?.status !== 200) {
    return { ok: false, reason: `cookie GET expected 200, got ${withCookie?.status}` };
  }
  const cc = h(withCookie, "cache-control");
  const vc = h(withCookie, "x-vercel-cache").toUpperCase();
  if (PRIVATE_CC.test(cc)) {
    return { ok: true, detail: `anonymous cacheable (x-vercel-cache ${h(anon, "x-vercel-cache") || "n/a"}); cookie request private (${cc})` };
  }
  if (vc === "MISS" || vc === "BYPASS") {
    return { ok: true, detail: `anonymous cacheable (x-vercel-cache ${h(anon, "x-vercel-cache") || "n/a"}); cookie request x-vercel-cache ${vc}` };
  }
  return {
    ok: false,
    reason: SHARED_CACHE_HIT.has(vc)
      ? `cookie-bearing request was served from the shared cache (x-vercel-cache ${vc}, cache-control "${cc}")`
      : `cookie-bearing request is neither MISS/BYPASS nor private (x-vercel-cache "${vc}", cache-control "${cc}")`,
  };
}

/**
 * Decide what the CRON_SECRET-authenticated gating-flags check should do.
 * - secret absent (undefined, null, empty, whitespace) -> skip with a one-line message
 * - secret present -> run (a rejection by the endpoint is still a failure, decided by the caller)
 * The secret value is never part of any returned message.
 */
export function cronSecretPlan(secret) {
  if (typeof secret !== "string" || secret.trim() === "") {
    return { action: "skip", message: "skipped: CRON_SECRET not set" };
  }
  return { action: "run" };
}
