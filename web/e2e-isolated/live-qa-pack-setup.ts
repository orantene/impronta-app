/**
 * Refuse-first guard for the live-QA pack. Runs before any test.
 *
 * Refuses (exit 2) unless ALL hold:
 *   - the Supabase target is the isolated project (scripts/isolated-target-guard.mjs);
 *   - JOURNEYS_ISOLATED=1 is set;
 *   - the app origin, the marketing origin and the talent-site port are local;
 *   - no Stripe key in the environment is a live key (the pack never pays).
 */
import { assertIsolatedJourneysTarget } from "../scripts/isolated-target-guard.mjs";

function fail(msg: string): never {
  console.error(`[live-qa-pack] refusing: ${msg}`);
  process.exit(2);
}

function isLocalOrigin(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h.endsWith(".localhost");
  } catch {
    return false;
  }
}

export default async function globalSetup() {
  assertIsolatedJourneysTarget(process.env, { requireIsolatedFlag: true });
  const app = process.env.QA_PACK_APP_ORIGIN ?? "http://localhost:3106";
  const marketing = process.env.QA_PACK_MARKETING_ORIGIN ?? "http://localhost:3105";
  if (!isLocalOrigin(app)) fail("QA_PACK_APP_ORIGIN must be a local origin");
  if (!isLocalOrigin(marketing)) fail("QA_PACK_MARKETING_ORIGIN must be a local origin");
  for (const name of ["STRIPE_SECRET_KEY", "STRIPE_MX_SECRET_KEY", "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"]) {
    const v = process.env[name];
    if (v && /_live_/.test(v)) fail(`${name} is a LIVE key`);
  }
  if (!process.env.QA_PACK_FIXTURES) fail("QA_PACK_FIXTURES must point at the fixtures JSON (see e2e-isolated/live-qa-pack.spec.ts)");
}
