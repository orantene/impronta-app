/**
 * Refuse-first guard for the paid-QA spec. Runs before any test.
 *
 * Refuses (exit 2) unless ALL hold:
 *   - the Supabase target is the isolated project (scripts/isolated-target-guard.mjs);
 *   - every Stripe key present is a TEST key (sk_test_ / pk_test_), never live;
 *   - the app under test is a local host (localhost, 127.0.0.1, *.localhost);
 *   - the pay links under test point at that same local host.
 *
 * Then, when PAID_QA_PAY_URLS is unset (and PAID_QA_MINT is not "0"), mints the links itself.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

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

  if (!process.env.PAID_QA_PAY_URLS && process.env.PAID_QA_MINT !== "0") mintPayLinks(base);

  const cases = process.env.PAID_QA_PAY_URLS ? (JSON.parse(process.env.PAID_QA_PAY_URLS) as Record<string, unknown>) : {};
  for (const [name, value] of Object.entries(cases)) {
    const urls = typeof value === "string" ? { [name]: value } : (value as Record<string, string>);
    for (const [n, url] of Object.entries(urls)) {
      if (!isLocalHost(url)) fail(`pay URL for "${n}" is not a local host`);
    }
  }
}

/**
 * No links passed in: mint one fresh set per currency through the real book -> offer -> accept writers
 * (scripts/qa/paid-qa-mint-links.mts, which refuses non-isolated targets itself). One process per
 * currency because sendOffer's in-memory limiter allows 5 sends an hour per actor. Workers inherit
 * the env set here; global-teardown.ts cancels whatever is left open.
 */
function mintPayLinks(base: string) {
  const currencies = (process.env.PAID_QA_CURRENCIES ?? "MXN,USD").split(",").map((c) => c.trim().toUpperCase()).filter(Boolean);
  const sets: Record<string, Record<string, string>> = {};
  const files: string[] = [];
  for (const currency of currencies) {
    const run = spawnSync("npx", ["tsx", "--tsconfig", "tsconfig.json", "scripts/qa/paid-qa-mint-links.mts", "--currency", currency, "--base", base], {
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --require ./scripts/register-server-only-test.cjs`.trim() },
      maxBuffer: 32 * 1024 * 1024,
    });
    const day = new Date().toISOString().slice(0, 10);
    const file = join(process.cwd(), "docs/plans/qa-evidence", `paid-qa-${day}`, `minted-${currency}.json`);
    if (existsSync(file)) files.push(file);
    if (run.status !== 0) {
      const why = (run.stderr ?? "").split("\n").filter(Boolean).pop() ?? `exit ${run.status}`;
      fail(`minting ${currency} pay links failed: ${why}. Cancel what was minted: npx tsx scripts/qa/paid-qa-mint-links.mts --teardown <file> for ${files.join(", ") || "(none)"}`);
    }
    sets[currency] = (JSON.parse(readFileSync(file, "utf8")) as { links: Record<string, string> }).links;
  }
  process.env.PAID_QA_PAY_URLS = JSON.stringify(sets);
  process.env.PAID_QA_MINTED_FILES = files.join(",");
}
