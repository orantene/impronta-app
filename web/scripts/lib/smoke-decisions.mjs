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
