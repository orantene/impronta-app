/**
 * Pure guards for the Business Suite Stage 2 fixture seed (scripts/seed-stage2-fixtures.mts, TUL-1519 / TUL-1427
 * "Unified Stage 2 fixture set"). No I/O, no process.exit: every refusal is unit-testable.
 *
 * Rules (QA Conductor + PM, Oran-approved staging-only identities):
 *   - fxlankepwnvelxjrahwk ONLY (checkFcTarget from #4048); pluhda* anywhere is refused.
 *   - never a qa-1..qa-6 host or row, never TAL-93938, never a talent other than TAL-93900.
 *   - every row hangs off a fixture tenant created by this seed (or an explicitly allowed external tenant).
 *   - @example.test mailboxes only; every slug / host / link code / event slug starts with `s2-`.
 *   - ids are s2Id(key) = stableId("s2:" + key): a re-run lands on the same rows, --cleanup deletes only these.
 */
import { stableId } from "./group6-fixtures.mjs";
import { checkFcTarget } from "./failed-cards-guards.mjs";

export const S2_NS = "s2:";
export const S2_SLUG_PREFIX = "s2-";
export const s2Id = (key) => stableId(`${S2_NS}${key}`);

/** The only PRE-EXISTING talent the seed may touch, and only additively (new rows, never an update). */
export const ALLOWED_TALENT_CODES = ["TAL-93900"];
/** The seed's own fixture talents (like #4048's TAL-960xx): TAL-962xx. */
export const FIXTURE_TALENT_CODE = /^TAL-962\d\d$/i;
export const FORBIDDEN_TOKENS = ["pluhda", "TAL-93938", "TUL-52\""];
/** qa-1 .. qa-6 as a whole label (hosts, slugs, rows): qa-1.tulala.digital, "qa-3". */
export const QA_POOL_HOST = /(^|[^a-z0-9])qa-[1-6](?![0-9])/i;
export const TALENT_CODE = /TAL-\d{3,7}/gi;

export const EMAIL_DOMAIN = "@example.test";
export const isExampleTestEmail = (raw) => /^[a-z0-9][a-z0-9._+-]*@example\.test$/i.test(String(raw ?? "").trim());

/** Public-facing copy never says QA / test / E2E (public loaders hide those on test accounts). */
export const TEST_WORD = /qa|test|e2e/i;
/** Words that make an item alcoholic: none may appear in a deal / 2x1 / happy-hour item (PM rule O6). */
export const ALCOHOL_WORD = /margarita|cerveza|beer|mezcal|tequila|vino|wine|whisk|vodka|cocktail|michelada|\bron\b|\bgin\b|licor|sangr/i;

const EMAIL_COLS = new Set(["email", "contact_email", "payer_email", "holder_email", "notification_email", "recipient_email", "to_email", "email_normalized"]);
const SLUG_COLS = new Set(["slug", "site_slug", "tenant_slug", "hostname"]);

/** Tables whose title / name / label / description / category are shown to the public. */
export const PUBLIC_COPY_TABLES = new Set([
  "public.talent_offerings", "public.talent_offering_variants", "public.talent_offering_addons", "public.events", "public.venues",
  "public.spaces", "public.space_groups", "public.agencies", "public.agency_business_identity", "public.links", "public.prep_stations",
  "public.profiles", "public.talent_profiles",
]);
const COPY_COLS = ["title", "description", "category", "label", "name", "display_name", "public_name", "tagline"];

function* walk(v) {
  if (v == null) return;
  if (typeof v === "string") yield v;
  else if (Array.isArray(v)) for (const x of v) yield* walk(x);
  else if (typeof v === "object") for (const x of Object.values(v)) yield* walk(x);
}

/** Staging target, via the #4048 guard (pooler login postgres.fxlank..., no variable naming production). */
export const checkS2Target = (env) => checkFcTarget(env);

/**
 * Refuse a plan that could touch anything outside this seed. `ctx.tenantIds` are the workspaces this plan creates;
 * `ctx.externalTenantIds` are the only other tenants rows may name (none in push 1).
 */
export function checkS2Plan(ops, { fixtureIds = new Set(), tenantIds = new Set(), externalTenantIds = new Set(), existingTalentIds = new Set() } = {}) {
  const problems = [];
  for (const op of ops) {
    const where = `${op.fx} ${op.table} ${op.key ?? op.id}`;
    if (op.kind === "update" || op.kind === "delete" || op.kind === "pin") {
      if (!fixtureIds.has(op.id)) problems.push(`${where}: ${op.kind} on a non-fixture row`);
    } else if (op.id && !fixtureIds.has(op.id)) problems.push(`${where}: insert id is not a deterministic fixture id`);
    else if (!op.id) {
      const refs = Object.values(op.row ?? {}).some((v) => typeof v === "string" && fixtureIds.has(v));
      const natural = op.natural && isExampleTestEmail(op.row?.[op.natural]);
      if (!refs && !natural) problems.push(`${where}: row without an id does not reference a fixture row (or name an @example.test natural key)`);
    }
    if (op.id && op.kind !== "update" && op.kind !== "pin" && op.kind !== "authUser" && op.id !== s2Id(op.key)) problems.push(`${where}: id is not s2Id(key)`);
    const values = { ...(op.row ?? {}), ...(op.set ?? {}), ...(op.merge ?? {}) };
    const t = values.tenant_id;
    if (op.touchesExisting) {
      // Additive writes next to a pre-existing talent: new rows only, tenant exactly the resolved hub tenant.
      if (op.touchesExisting !== "TAL-93900") problems.push(`${where}: touches pre-existing ${op.touchesExisting}; only TAL-93900 is allowed`);
      if (op.kind !== "insert") problems.push(`${where}: a write to pre-existing ${op.touchesExisting} must be a new row (no updates)`);
      if (typeof t === "string" && !externalTenantIds.has(t)) problems.push(`${where}: tenant_id ${t} is not the resolved hub tenant`);
    } else {
      if (typeof t === "string" && !tenantIds.has(t)) problems.push(`${where}: tenant_id ${t} is not a fixture tenant`);
      for (const v of walk(values)) if (existingTalentIds.has(v)) problems.push(`${where}: references a pre-existing talent without the touchesExisting flag`);
    }
    for (const s of walk(values)) {
      const low = s.toLowerCase();
      for (const b of FORBIDDEN_TOKENS) if (low.includes(b.toLowerCase())) problems.push(`${where}: names forbidden ${b}`);
      if (QA_POOL_HOST.test(s)) problems.push(`${where}: names a qa-1..qa-6 pool host/row (${s.slice(0, 40)})`);
      for (const m of s.match(TALENT_CODE) ?? []) if (!ALLOWED_TALENT_CODES.includes(m.toUpperCase()) && !FIXTURE_TALENT_CODE.test(m)) problems.push(`${where}: names talent ${m}; only ${ALLOWED_TALENT_CODES.join(",")} and the seed's own TAL-962xx are allowed`);
    }
    for (const [col, v] of Object.entries(values)) {
      if (EMAIL_COLS.has(col) && v != null && !isExampleTestEmail(v)) problems.push(`${where}: ${col} is not an ${EMAIL_DOMAIN} mailbox`);
      if (SLUG_COLS.has(col) && v != null && !String(v).startsWith(S2_SLUG_PREFIX)) problems.push(`${where}: ${col} must start with ${S2_SLUG_PREFIX}`);
    }
    if (op.table === "public.links" && !String(op.row?.code ?? "").startsWith(S2_SLUG_PREFIX)) problems.push(`${where}: link code must start with ${S2_SLUG_PREFIX}`);
    if (op.table === "public.talent_profiles" && !FIXTURE_TALENT_CODE.test(String(op.row?.profile_code ?? ""))) problems.push(`${where}: a talent profile that is not one of the seed's own TAL-962xx`);
  }
  return { ok: problems.length === 0, problems };
}

/** Public copy (titles, names, labels, descriptions, categories) never says QA / test / E2E. */
export function publicCopyProblems(ops) {
  const out = [];
  for (const op of ops) {
    if (!PUBLIC_COPY_TABLES.has(op.table)) continue;
    const r = { ...(op.row ?? {}), ...(op.set ?? {}) };
    const vals = [];
    for (const c of COPY_COLS) if (typeof r[c] === "string") vals.push([c, r[c]]);
    for (const c of ["title_i18n", "description_i18n", "label_i18n"]) {
      let o = r[c];
      try { if (typeof o === "string") o = JSON.parse(o); } catch { o = {}; }
      if (o && typeof o === "object") for (const v of Object.values(o)) if (typeof v === "string") vals.push([c, v]);
    }
    for (const [c, v] of vals) if (TEST_WORD.test(v)) out.push(`${op.fx} ${op.key}: ${c} "${v}" contains QA/test/E2E`);
  }
  return out;
}

/** PM rule O6: no alcohol in any deal / 2x1 / happy-hour item. Items flag themselves with attributes.deal = true. */
export function alcoholDealProblems(ops) {
  const out = [];
  for (const op of ops) {
    if (op.table !== "public.talent_offerings") continue;
    let a = op.row?.attributes;
    try { if (typeof a === "string") a = JSON.parse(a); } catch { a = {}; }
    if (a?.deal !== true) continue;
    const text = [op.row.title, op.row.description, op.row.category, op.row.title_i18n].filter(Boolean).join(" ");
    if (a.alcohol === true || ALCOHOL_WORD.test(text)) out.push(`${op.fx} ${op.key}: a deal item is alcoholic (${op.row.title})`);
  }
  return out;
}

/** Workspace slugs, subdomain labels share one DNS label space. */
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
  }
  return clashes;
}

export function verifyS2Plan(ops, { externalTenantIds = new Set(), existingTalentIds = new Set() } = {}) {
  const fixtureIds = new Set(ops.filter((o) => o.id).map((o) => o.id));
  const tenantIds = new Set(ops.filter((o) => o.table === "public.agencies" && o.kind !== "update").map((o) => o.id));
  const res = checkS2Plan(ops, { fixtureIds, tenantIds, externalTenantIds, existingTalentIds });
  const problems = [...res.problems, ...publicCopyProblems(ops), ...alcoholDealProblems(ops), ...labelCollisions(ops).map((l) => `DNS label ${l} is claimed twice`)];
  return { ok: problems.length === 0, problems, fixtureIds, tenantIds };
}

/** Plan summary: table -> inserts / updates (for the write list). */
export function summarise(ops) {
  const out = {};
  for (const op of ops) {
    const t = (out[op.table] ??= { insert: 0, update: 0 });
    if (op.kind === "update" || op.kind === "pin") t.update += 1;
    else t.insert += 1;
  }
  return out;
}

/**
 * Rows the DATABASE writes by itself when this plan runs (triggers), counted from the plan so PM's shared-row note and the cleanup accounting
 * cover them. The roster figure is inferred from the Conductor's selftest delta (+6 roster rows for 3 new talents = 3 explicit + 3 trigger).
 * Cleanup removes them: roster rows hang off the talent (FK descent) and profiles go with their login.
 */
export function triggerSideEffects(ops) {
  const users = ops.filter((o) => o.kind === "authUser").length;
  const talents = ops.filter((o) => o.table === "public.talent_profiles" && o.kind === "insert").length;
  const reservationTenants = new Set(ops.filter((o) => o.table === "public.venue_service_rules" && o.row?.is_active).map((o) => o.row.tenant_id)).size;
  return [
    { table: "auth.identities", rows: users, note: "written explicitly by the seed with each login" },
    { table: "public.profiles", rows: users, note: "made by the signup trigger; the seed then UPDATES these rows (its own)" },
    { table: "public.agency_talent_roster", rows: talents, note: "hub roster auto-enroll, one per new talent (the selftest delta of +6 for 3 talents = 3 explicit roster rows + 3 trigger rows); cleanup removes them through the talent" },
    { table: "public.agencies (takes_reservations flag)", rows: reservationTenants, note: "trigger on venue_service_rules flips the flag on the seed's own workspace" },
  ];
}
