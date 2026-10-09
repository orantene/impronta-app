/**
 * Refuse-first guard for the paid-QA spec. Runs before any test.
 *
 * Refuses (exit 2) unless ALL hold:
 *   - the Supabase target is the isolated project (scripts/isolated-target-guard.mjs);
 *   - every Stripe key present is a TEST key (sk_test_ / pk_test_), never live;
 *   - the app under test is a local host (localhost, 127.0.0.1, *.localhost);
 *   - the pay links under test point at that same local host.
 */
import { assertIsolatedJourneysTarget } from "../scripts/isolated-target-guard.mjs";

function fail(msg: string): never {
  console.error(`[paid-qa] refusing: ${msg}`);
  process.exit(2);
}

export function isLocalHost(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h.endsWith(".localhost");
  } catch {
    return false;
  }
}

export default async function globalSetup() {
  assertIsolatedJourneysTarget(process.env, { requireIsolatedFlag: true });

  const keys: Array<[string, string | undefined]> = [
    ["STRIPE_SECRET_KEY", process.env.STRIPE_SECRET_KEY],
    ["STRIPE_MX_SECRET_KEY", process.env.STRIPE_MX_SECRET_KEY],
    ["NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY],
  ];
  for (const [name, value] of keys) {
    if (!value) continue;
    if (/_live_/.test(value)) fail(`${name} is a LIVE key`);
    if (!/^(sk|pk|rk)_test_/.test(value)) fail(`${name} is not a Stripe test key`);
  }

  const base = process.env.PAID_QA_BASE_URL ?? "";
  if (!base || !isLocalHost(base)) fail("PAID_QA_BASE_URL must be set to a local host (localhost / *.localhost)");

  const cases = process.env.PAID_QA_PAY_URLS ? (JSON.parse(process.env.PAID_QA_PAY_URLS) as Record<string, string>) : {};
  for (const [name, url] of Object.entries(cases)) {
    if (!isLocalHost(url)) fail(`pay URL for "${name}" is not a local host`);
  }
}
