/**
 * The integration resolver is the ONLY door to shared platform keys.
 *
 * Tulala's HQ "Integration defaults" panel promises a resolution order —
 * tenant-custom → HQ default → environment variable — and stores HQ values in
 * the database (secrets encrypted). That promise only holds if runtime code
 * asks the RESOLVER. Every consumer that reads `process.env.<INTEGRATION_VAR>`
 * directly silently ignores whatever the operator configured in HQ.
 *
 * This is not theoretical. Two live failures on 2026-08-16:
 *
 *   - `/api/cms/forms/submit` read `process.env.HCAPTCHA_SECRET` for tenants
 *     INHERITING the HQ captcha. The HQ secret lives in the DB, so the secret
 *     resolved to null and the fail-closed branch rejected EVERY submission.
 *   - `readGoogleMapsBrowserKey()` read only env, so the HQ-stored Maps key was
 *     ignored entirely. Maps kept working purely because env happened to be
 *     set, which made the HQ field decorative — an operator rotating the key
 *     there would have seen no effect and no error.
 *
 * So: this guard fails when an integration env var is read outside the
 * allow-list below. Adding a file to the list is deliberate and needs a reason,
 * which is the point — it turns "remember to use the resolver" into a build
 * failure rather than a bug a tenant discovers for us.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

// Test lanes run with cwd = `web/`. Resolving from cwd (rather than
// `import.meta.dirname`, which this runner leaves undefined) keeps the guard
// working under both `npm run test:*` and a direct `tsx --test`.
const SRC = resolve(process.cwd(), "src");

/** Env vars that have a resolver and must not be read directly elsewhere. */
const GUARDED_VARS = [
  "HCAPTCHA_SECRET",
  "TURNSTILE_SECRET",
  "GOOGLE_PLACES_API_KEY",
  "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY",
  "NEXT_PUBLIC_GA_MEASUREMENT_ID",
  "EMAIL_FROM",
] as const;

/**
 * Files permitted to read them, each with the reason. A new entry here is a
 * review decision — do not add one to silence the guard; route through
 * `lib/integrations/resolve.ts` instead.
 */
const ALLOW: Record<string, string> = {
  // The resolver itself: env IS its documented last-resort tier.
  "lib/integrations/resolve.ts": "the resolver — env is its final fallback tier",
  // The HQ panel reads env only to DISPLAY 'USING ENV FALLBACK' status.
  "app/(workspace)/platform/admin/integrations/platform-integration-actions.ts":
    "HQ panel status display (shows whether a value falls back to env)",
  "app/(workspace)/platform/admin/email/email-data.ts":
    "platform email admin — displays the env fallback value",
  // Env-reading primitives, called BY the resolver.
  "lib/env/google-maps-browser-key.ts":
    "env-reading primitive consumed by the resolver",
  "lib/google-places.ts":
    "server-only Places client; key never reaches the browser",
  // Resolver-first, env-fallback modules (already correct).
  "lib/email/resend-client.ts": "reads platformConfigField first, env as fallback",
  "lib/email/index.ts": "env fallback beneath the resolved from-address",
  "lib/captcha/verify.ts":
    "guest-abuse captcha path (own lifecycle, not the CMS forms endpoint)",
  "components/analytics/analytics-scripts.tsx":
    "props from the server resolver win; env const is the standalone fallback",
};

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

test("integration env vars are read only through the resolver", () => {
  const offenders: string[] = [];
  for (const file of walk(SRC)) {
    const rel = relative(SRC, file).split("\\").join("/");
    // The guard itself names every var; tests describe behaviour, not wire it.
    if (rel.endsWith(".test.ts") || rel.endsWith(".test.tsx")) continue;
    if (ALLOW[rel]) continue;
    const src = readFileSync(file, "utf8");
    for (const v of GUARDED_VARS) {
      if (src.includes(`process.env.${v}`)) offenders.push(`${rel} → ${v}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `These files read an integration env var directly, so the HQ Integrations ` +
      `panel's tenant → HQ → env order does NOT hold for them:\n  ` +
      offenders.join("\n  ") +
      `\n\nRoute through lib/integrations/resolve.ts. If a direct read is ` +
      `genuinely correct, add the file to ALLOW in this test WITH a reason.`,
  );
});

test("every allow-list entry still exists and still reads a guarded var", () => {
  // A stale allow-list quietly widens the guard. If a file was fixed or moved,
  // its exemption must go with it.
  const stale: string[] = [];
  for (const rel of Object.keys(ALLOW)) {
    let src: string;
    try {
      src = readFileSync(join(SRC, rel), "utf8");
    } catch {
      stale.push(`${rel} (file no longer exists)`);
      continue;
    }
    if (!GUARDED_VARS.some((v) => src.includes(`process.env.${v}`))) {
      stale.push(`${rel} (no longer reads a guarded var)`);
    }
  }
  assert.deepEqual(stale, [], `Remove these stale ALLOW entries:\n  ${stale.join("\n  ")}`);
});
