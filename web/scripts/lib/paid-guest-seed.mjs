/**
 * Pure helpers for scripts/seed-paid-guest-t690.mjs (TUL-690 staging seed).
 * No I/O, no process.exit: the guard returns a verdict so it is unit-testable.
 */
import { createHash } from "node:crypto";

export const STAGING_PROJECT_REF = "fxlankepwnvelxjrahwk";
export const PRODUCTION_PROJECT_REF = "pluhdapdnuiulvxmyspd";
export const GUEST_EMAIL = "tulalaqa+paidguest690@mail.grokbot.com";
export const DEFAULT_TENANT_ID = "33333333-3333-4333-8333-333333333333"; // qa-journeys fixture tenant
export const TEST_PAYMENT_METHOD = "pm_card_visa";
export const SEED_TAG = "t690-paid-guest-seed";

/** Deterministic UUIDv4-shaped id so a re-run lands on the same rows. */
export function stableId(label) {
  const h = createHash("sha256").update(`${SEED_TAG}:${label}`).digest("hex");
  const v = ((parseInt(h.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, "0");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${v}${h.slice(18, 20)}-${h.slice(20, 32)}`;
}

export function seedIds() {
  return {
    customerId: stableId("customer"),
    bookingId: stableId("booking"),
    transactionId: stableId("transaction"),
  };
}

export function parseArgs(argv) {
  const out = { rollback: false, dryRun: false, tenantId: DEFAULT_TENANT_ID, amountCents: 15000, currency: "usd", help: false, errors: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const value = () => {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith("--")) {
        out.errors.push(`${a} needs a value`);
        return undefined;
      }
      i += 1;
      return v;
    };
    if (a === "--rollback") out.rollback = true;
    else if (a === "--dry-run") out.dryRun = true;
    else if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--tenant-id") {
      const v = value();
      if (v !== undefined) {
        if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) out.tenantId = v.toLowerCase();
        else out.errors.push("--tenant-id must be a UUID");
      }
    } else if (a === "--amount-cents") {
      const v = value();
      if (v !== undefined) {
        const n = Number(v);
        if (Number.isInteger(n) && n >= 100 && n <= 500000) out.amountCents = n;
        else out.errors.push("--amount-cents must be an integer between 100 and 500000");
      }
    } else if (a === "--currency") {
      const v = value();
      if (v !== undefined) {
        if (/^[a-zA-Z]{3}$/.test(v)) out.currency = v.toLowerCase();
        else out.errors.push("--currency must be a 3-letter code");
      }
    } else out.errors.push(`unknown argument ${a}`);
  }
  if (out.rollback && out.dryRun) out.errors.push("--rollback and --dry-run cannot be combined");
  return out;
}

/** Stripe key env name: the _TEST sibling when STRIPE_FORCE_TEST_MODE=1 (TUL-703). */
export function stripeKeyEnvName(env) {
  return env.STRIPE_FORCE_TEST_MODE === "1" ? "STRIPE_SECRET_KEY_TEST" : "STRIPE_SECRET_KEY";
}

/**
 * Refuse unless Supabase is exactly the staging project AND the Stripe key is a
 * TEST secret key. Returns { ok, reasons } and never includes a secret value.
 */
export function checkTarget(env) {
  const reasons = [];
  const url = String(env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  let host = "";
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    /* handled below */
  }
  if (!host) reasons.push("NEXT_PUBLIC_SUPABASE_URL is missing or not a URL");
  else if (host.includes(PRODUCTION_PROJECT_REF)) reasons.push("Supabase URL is the PRODUCTION project");
  else if (host !== `${STAGING_PROJECT_REF}.supabase.co`) reasons.push(`Supabase host must be ${STAGING_PROJECT_REF}.supabase.co`);
  for (const k of ["DATABASE_URL", "SUPABASE_PROJECT_REF"]) {
    const v = String(env[k] ?? "").toLowerCase();
    if (v.includes(PRODUCTION_PROJECT_REF)) reasons.push(`${k} points at the PRODUCTION project`);
  }
  if (!env.SUPABASE_SERVICE_ROLE_KEY) reasons.push("SUPABASE_SERVICE_ROLE_KEY is missing");
  const keyName = stripeKeyEnvName(env);
  const key = String(env[keyName] ?? "");
  if (!key) reasons.push(`${keyName} is missing`);
  else if (!key.startsWith("sk_test_")) reasons.push(`${keyName} must start with sk_test_ (test mode only)`);
  return { ok: reasons.length === 0, reasons, keyName };
}

/** Money split mirroring createBookingTransaction's fee-netted row (6% platform fee). */
export function splitAmounts(grossCents, feeBps = 600) {
  const feeCents = Math.round((grossCents * feeBps) / 10000);
  return { grossCents, feeBps, feeCents, netCents: grossCents - feeCents };
}
