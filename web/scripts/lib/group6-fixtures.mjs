/**
 * Pure helpers for scripts/seed-group6-staging-fixtures.mjs (Group 6 staging
 * fixtures). No I/O and no process.exit, so the guards are unit-testable.
 *
 * Every row this seed creates has a deterministic id derived from
 * `stableId(key)`, so a re-run lands on the same rows (idempotent) and
 * `--cleanup` can find exactly what it created without a manifest table.
 */
import { createHash } from "node:crypto";

export const STAGING_PROJECT_REF = "fxlankepwnvelxjrahwk";
export const PRODUCTION_PROJECT_REF = "pluhdapdnuiulvxmyspd";
/** Prefix on every slug / profile code / email / title this seed owns. */
export const PREFIX = "qa-fixture-g6";
/** A staging-only agency that does not exist on production (second proof of target). */
export const STAGING_MARKER_AGENCY_ID = "33333333-3333-4333-8333-333333333333";
export const HUB_TENANT_ID = "00000000-0000-0000-0000-000000000002";

/** Deterministic UUIDv4-shaped id so a re-run lands on the same rows. */
export function stableId(key) {
  const h = createHash("sha256").update(`${PREFIX}:${key}`).digest("hex");
  const v = ((parseInt(h.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, "0");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${v}${h.slice(18, 20)}-${h.slice(20, 32)}`;
}

export const EMAILS = {
  limpieza: `${PREFIX}-limpieza@impronta.test`,
  quote: `${PREFIX}-quote@impronta.test`,
  client: `${PREFIX}-client@impronta.test`,
};

export function parseArgs(argv) {
  const out = { apply: false, cleanup: false, selftest: false, stripe: false, envFile: null, help: false, errors: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--apply") out.apply = true;
    else if (a === "--cleanup") out.cleanup = true;
    else if (a === "--selftest") out.selftest = true;
    else if (a === "--stripe") out.stripe = true;
    else if (a === "--env-file") {
      out.envFile = argv[i + 1] ?? null;
      i += 1;
      if (!out.envFile) out.errors.push("--env-file needs a path");
    } else if (a === "--help" || a === "-h") out.help = true;
    else out.errors.push(`unknown argument ${a}`);
  }
  if (out.selftest && (out.apply || out.cleanup)) out.errors.push("--selftest cannot be combined with --apply or --cleanup");
  return out;
}

/** Minimal KEY=value parser (no dotenv dependency, never logs values). */
export function parseEnvText(text) {
  const out = {};
  for (const line of String(text).split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

/**
 * Refuse unless the DATABASE_URL is exactly the staging project's pooler/direct
 * login. Returns { ok, reasons }; never includes a secret value.
 */
export function checkDbTarget(env) {
  const reasons = [];
  const dbUrl = String(env.DATABASE_URL ?? "").trim();
  if (!dbUrl) reasons.push("DATABASE_URL is missing");
  for (const [k, v] of Object.entries(env)) {
    if (typeof v === "string" && /DATABASE|POSTGRES|SUPABASE/.test(k) && v.toLowerCase().includes(PRODUCTION_PROJECT_REF)) {
      reasons.push(`${k} mentions the PRODUCTION project`);
    }
  }
  if (dbUrl) {
    let u = null;
    try {
      u = new URL(dbUrl);
    } catch {
      reasons.push("DATABASE_URL is not a URL");
    }
    if (u) {
      const user = decodeURIComponent(u.username);
      const host = u.hostname.toLowerCase();
      const pooler = user === `postgres.${STAGING_PROJECT_REF}` && host.endsWith(".pooler.supabase.com");
      const direct = user === "postgres" && host === `db.${STAGING_PROJECT_REF}.supabase.co`;
      if (!pooler && !direct) reasons.push(`DATABASE_URL login must be postgres.${STAGING_PROJECT_REF} (pooler) or db.${STAGING_PROJECT_REF}.supabase.co`);
    }
  }
  const sb = String(env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim();
  if (sb) {
    let host = "";
    try {
      host = new URL(sb).hostname.toLowerCase();
    } catch {
      reasons.push("NEXT_PUBLIC_SUPABASE_URL is not a URL");
    }
    if (host && host !== `${STAGING_PROJECT_REF}.supabase.co`) reasons.push(`NEXT_PUBLIC_SUPABASE_URL host must be ${STAGING_PROJECT_REF}.supabase.co`);
  }
  return { ok: reasons.length === 0, reasons };
}

/** The Stripe key may only be a TEST secret key. */
export function checkStripeKey(key) {
  if (!key) return { ok: false, reason: "STRIPE_SECRET_KEY is not set" };
  if (!String(key).startsWith("sk_test_")) return { ok: false, reason: "STRIPE_SECRET_KEY must start with sk_test_ (test mode only)" };
  return { ok: true };
}

/** A review/booking day offset in the talent's Cancun wall clock, as an ISO instant. */
export function cancunInstant(baseDate, dayOffset, hour, minute = 0) {
  // America/Cancun is UTC-5 all year (no DST).
  const d = new Date(baseDate.getTime() - 5 * 3600 * 1000);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate() + dayOffset;
  return new Date(Date.UTC(y, m, day, hour + 5, minute, 0)).toISOString();
}

/**
 * Tables whose descendants cleanup may purge, as roots. Cleanup only ever
 * follows foreign keys DOWN from rows with these deterministic ids.
 */
export function ownedRootIds() {
  const k = (s) => stableId(s);
  return {
    profiles: [k("user:limpieza"), k("user:quote"), k("user:client")],
    talent_profiles: [k("talent:limpieza"), k("talent:quote")],
    inquiries: [k("inquiry:offer")],
    agency_bookings: [k("booking:away"), k("booking:refundable"), k("booking:done"), k("booking:done2"), k("booking:done3")],
    customers: [k("customer:client")],
    media_assets: [k("media:1"), k("media:2"), k("media:3")],
    cms_posts: [k("post:es"), k("post:en"), k("post:expired"), k("post:takedown")],
    talent_reviews: [k("review:1"), k("review:2"), k("review:3")],
  };
}
