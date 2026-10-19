/**
 * Pure guards and CLI parsing for scripts/seed-failed-cards-fixtures.mts (staging fixtures for the
 * 2026-10-19 Failed-card inventory). No I/O and no process.exit, so every refusal is unit-testable.
 *
 * Ids: every row has a deterministic id `fcId(key)` = Group-6 `stableId("fc:" + key)`, so a re-run
 * lands on the same rows (idempotent) and `--cleanup` deletes exactly this seed's rows.
 */
import { PREFIX, PRODUCTION_PROJECT_REF, STAGING_PROJECT_REF, checkDbTarget, stableId } from "./group6-fixtures.mjs";

/** Namespace inside the Group-6 id space; no Group-6 key starts with "fc:". */
export const FC_NS = "fc:";
export const fcId = (key) => stableId(`${FC_NS}${key}`);

/** Talents this seed must never write: TAL-93938 (real talent) and TAL-93940 (QAMAX, observe-only). */
export const FORBIDDEN_PROFILE_CODES = ["TAL-93938", "TAL-93940"];
/** Card/ticket ids that are out of bounds for this seed (never named in any written value). */
export const FORBIDDEN_TOKENS = ["TAL-93938", "TAL-93940", "TUL-52"];

export const DB_FIXTURES = ["F1", "F3", "F2", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12", "F14", "S5", "S6", "G1", "G2", "G3", "G4", "G5"];
export const STRIPE_STEPS = ["S2", "S3", "S4", "S6"];
/** Held for the PM: shared-row edits. Never planned, never executed. */
export const HELD = {
  F13: "WAITING ON PM: shared-row edits (is_publicly_hidden on 3 seed talents, remove the duplicate QAPO offering)",
  S1: "PM dashboard work: TEST STRIPE_SECRET_KEY + webhook secret + TEST webhook endpoint on the staging deployment",
};

const BOT_MAILBOX = /^tulalaqa\+qa-fixture-g6-[a-z0-9-]+@mail\.grokbot\.com$/;
const TEST_MAILBOX = /^qa-fixture-g6-[a-z0-9-]+@impronta\.test$/;

/** Only this seed's mailboxes: qa-fixture-g6-*@impronta.test or the bot mailbox tulalaqa+qa-fixture-g6-*. */
export function isAllowedEmail(raw) {
  const e = String(raw ?? "").trim().toLowerCase();
  return TEST_MAILBOX.test(e) || BOT_MAILBOX.test(e) || e === MALFORMED_EMAIL;
}
/** F7's deliberately malformed address (no @); the only non-mailbox value an email column may hold. */
export const MALFORMED_EMAIL = `${PREFIX}-malformed.impronta.test`;

export function parseFcArgs(argv) {
  const out = {
    apply: false, cleanup: false, selftest: false, help: false,
    envFile: null, backupFile: null, stripeKeyFile: null, stripeMxKeyFile: null,
    only: null, stripe: [], errors: [],
  };
  const val = (i, flag) => {
    const v = argv[i + 1];
    if (!v || v.startsWith("--")) out.errors.push(`${flag} needs a value`);
    return v && !v.startsWith("--") ? v : null;
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--apply") out.apply = true;
    else if (a === "--cleanup") out.cleanup = true;
    else if (a === "--selftest") out.selftest = true;
    else if (a === "--help" || a === "-h") out.help = true;
    else if (a === "--env-file") { out.envFile = val(i, a); i += 1; }
    else if (a === "--backup-file") { out.backupFile = val(i, a); i += 1; }
    else if (a === "--stripe-key-file") { out.stripeKeyFile = val(i, a); i += 1; }
    else if (a === "--stripe-mx-key-file") { out.stripeMxKeyFile = val(i, a); i += 1; }
    else if (a === "--only") {
      const v = val(i, a);
      i += 1;
      if (v) out.only = v.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
    } else if (a === "--stripe") {
      const v = val(i, a);
      i += 1;
      if (v) out.stripe = v.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean);
    } else out.errors.push(`unknown argument ${a}`);
  }
  for (const f of out.only ?? []) {
    if (HELD[f]) out.errors.push(`${f} is held: ${HELD[f]}`);
    else if (!DB_FIXTURES.includes(f)) out.errors.push(`unknown fixture ${f} (known: ${DB_FIXTURES.join(",")})`);
  }
  for (const s of out.stripe) {
    if (HELD[s]) out.errors.push(`${s} is held: ${HELD[s]}`);
    else if (!STRIPE_STEPS.includes(s)) out.errors.push(`unknown Stripe step ${s} (known: ${STRIPE_STEPS.join(",")})`);
  }
  if (out.selftest && (out.apply || out.cleanup)) out.errors.push("--selftest cannot be combined with --apply or --cleanup");
  if (out.selftest && out.stripe.length) out.errors.push("--selftest never calls Stripe: drop --stripe");
  if (out.apply && !out.backupFile) out.errors.push("--apply requires --backup-file <path> (it records every pre-existing row the run changes)");
  if ((out.stripeKeyFile || out.stripeMxKeyFile) && !out.stripe.length) out.errors.push("--stripe-key-file only applies with --stripe <steps>");
  return out;
}

/**
 * Staging only: the Group-6 target check (pooler login postgres.fxlank... or the direct staging host,
 * no variable naming production) plus an explicit "login contains postgres.fxlank" rule for this seed.
 */
export function checkFcTarget(env) {
  const base = checkDbTarget(env);
  const reasons = [...base.reasons];
  const url = String(env.DATABASE_URL ?? "");
  let user = "";
  try {
    user = decodeURIComponent(new URL(url).username);
  } catch {
    /* reported by checkDbTarget */
  }
  if (url && !user.includes(`postgres.${STAGING_PROJECT_REF}`)) reasons.push(`DATABASE_URL user must contain postgres.${STAGING_PROJECT_REF}`);
  if (url.toLowerCase().includes(PRODUCTION_PROJECT_REF)) reasons.push("DATABASE_URL names the PRODUCTION project");
  return { ok: reasons.length === 0, reasons: [...new Set(reasons)] };
}

function* walk(v) {
  if (v == null) return;
  if (typeof v === "string") yield v;
  else if (Array.isArray(v)) for (const x of v) yield* walk(x);
  else if (typeof v === "object") for (const x of Object.values(v)) yield* walk(x);
}

const EMAIL_COLS = new Set(["email", "contact_email", "payer_email", "notification_email", "handoff_email", "recipient_email", "to_email"]);
const SLUG_COLS = new Set(["slug", "site_slug", "tenant_slug", "link_slug", "hostname", "design", "design_slug", "theme_design_slug"]);
const NO_ID_TABLES_KEYED_BY_PREFIX = new Set(["public.talent_theme_versions"]);

/**
 * Refuse a plan that could touch anything outside this seed:
 *  - every op id must be a fixture id (fcId) or an id this seed is allowed to reference read-only;
 *  - no value may name a forbidden talent id or token (TAL-93938, TAL-93940, TUL-52);
 *  - every email column must be one of this seed's mailboxes;
 *  - every slug column must start with the qa-fixture-g6 prefix;
 *  - updates and deletes may target only fixture ids (never a shared row).
 * `forbiddenIds` are the staging ids of TAL-93938 / TAL-93940 (and their users), resolved read-only.
 */
export function checkPlan(ops, { forbiddenIds = [], fixtureIds = new Set() } = {}) {
  const problems = [];
  const banned = [...FORBIDDEN_TOKENS, ...forbiddenIds].map((s) => String(s).toLowerCase());
  for (const op of ops) {
    const where = `${op.fx} ${op.table} ${op.key ?? op.id}`;
    if (op.kind === "update" || op.kind === "delete") {
      if (!fixtureIds.has(op.id)) problems.push(`${where}: ${op.kind} on a non-fixture row`);
    } else if (op.id && !fixtureIds.has(op.id)) problems.push(`${where}: insert id is not a deterministic fixture id`);
    else if (!op.id && op.kind !== "call") {
      // A row without its own id must hang off a fixture row (or, for theme versions, a prefixed design slug).
      const refs = Object.values(op.row ?? {}).some((v) => typeof v === "string" && fixtureIds.has(v));
      const keyed = NO_ID_TABLES_KEYED_BY_PREFIX.has(op.table) && String(op.row?.design ?? "").startsWith(PREFIX);
      if (!refs && !keyed) problems.push(`${where}: row without an id does not reference a fixture row`);
    }
    const values = { ...(op.row ?? {}), ...(op.set ?? {}) };
    for (const s of walk(values)) {
      const low = s.toLowerCase();
      for (const b of banned) if (b && low.includes(b)) problems.push(`${where}: names forbidden ${b.toUpperCase()}`);
    }
    for (const [col, v] of Object.entries(values)) {
      if (EMAIL_COLS.has(col) && v != null && !isAllowedEmail(v)) problems.push(`${where}: ${col} is not a seed mailbox`);
      const homePage = op.table === "public.talent_pages" && col === "slug" && v === "home";
      if (SLUG_COLS.has(col) && v != null && !homePage && !String(v).startsWith(PREFIX)) problems.push(`${where}: ${col} must start with ${PREFIX}`);
    }
  }
  return { ok: problems.length === 0, problems };
}

/**
 * Workspace slugs, subdomain labels and talent site slugs share ONE DNS label space on staging
 * (agencies_slug_subdomain_guard / platform_subdomain_label_taken). A workspace may share a label only
 * with its own subdomain row. Pure; returns the clashing labels.
 */
export function labelCollisions(ops) {
  const owners = new Map();
  const clashes = [];
  const claim = (label, owner) => {
    const prev = owners.get(label);
    if (prev && prev !== owner) clashes.push(label);
    else owners.set(label, owner);
  };
  for (const op of ops) {
    const r = op.row ?? {};
    if (op.table === "public.agencies" && r.slug) claim(r.slug, `ws:${op.id}`);
    if (op.table === "public.agency_domains" && r.kind === "subdomain") claim(String(r.hostname).split(".")[0], `ws:${r.tenant_id}`);
    if (op.table === "public.talent_sites" && r.site_slug) claim(r.site_slug, `site:${op.id}`);
  }
  return clashes;
}

/** Public loaders hide QA-named services of fixture talents (hideTestServiceOnPublicSite), so fixture SERVICE copy never says QA/test/E2E. */
export const TEST_WORD_IN_COPY = /qa|test|e2e/i;
export function serviceCopyProblems(ops) {
  const out = [];
  for (const op of ops) {
    if (op.table !== "public.talent_offerings") continue;
    const r = op.row ?? {};
    let i18n = {};
    try {
      i18n = typeof r.title_i18n === "string" ? JSON.parse(r.title_i18n) : (r.title_i18n ?? {});
    } catch {
      i18n = {};
    }
    for (const v of [r.title, r.description, r.category, ...Object.values(i18n)]) {
      if (typeof v === "string" && TEST_WORD_IN_COPY.test(v)) out.push(`${op.fx} ${op.key}: service copy "${v}" contains QA/test/E2E`);
    }
  }
  return out;
}

/** Summarise a plan as table -> { rows, keys } for the write list. Pure. */
export function summarisePlan(ops) {
  const out = {};
  for (const op of ops) {
    const t = (out[op.table] ??= { insert: 0, update: 0, keys: [] });
    if (op.kind === "update") t.update += 1;
    else t.insert += 1;
    t.keys.push(`${op.fx}:${op.key}`);
  }
  return out;
}
