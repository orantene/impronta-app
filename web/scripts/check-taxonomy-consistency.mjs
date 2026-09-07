#!/usr/bin/env node
/**
 * check:taxonomy — tenant taxonomy / directory data consistency.
 *
 * WHY THIS EXISTS
 * ───────────────
 * On 2026-08-09 an agency reported "I edit a service, I save, nothing changes".
 * It took nine fixes across four root causes. TWO of those causes were pure
 * DATA states that had existed for months, that every existing gate was green
 * on, and that surfaced only because a client sent a WhatsApp photo:
 *
 *   A. 42 of 57 talent on one roster held a talent type the SAME workspace had
 *      switched off. Editing those profiles hit a wall, and the offending entry
 *      was named only in an error banner.
 *   B. Two directory category chips advertised a number and clicked through to
 *      "No one matches yet" — the chip counted the roster, the listing applied a
 *      stricter public gate, and nothing compared the two.
 *
 * Neither is a code bug you can unit-test: they are assertions about live rows.
 * So this runs against the real database, read-only, and fails loudly.
 *
 * WHAT IT CHECKS
 * ──────────────
 *   A. NO active, publicly-visible roster talent holds a taxonomy term that
 *      their own tenant has disabled (`agency_taxonomy_settings.is_enabled`
 *      = false), directly or via a disabled ancestor.
 *   B. For every tenant × parent_category: the chip count (what the directory
 *      top bar promises) equals the result count (what clicking it returns).
 *      A chip that promises talent and returns ZERO is reported as its own,
 *      louder failure — that is the user-visible shape of the bug.
 *
 * Auth: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, same pair every
 * other check script uses. Missing credentials WARN and exit 0 (forks, CI
 * without secrets) — this is a data probe, not a build gate.
 *
 * Read-only: only GETs. It never writes, so it is safe to run against prod.
 *
 * Usage:
 *   npm run check:taxonomy                 # uses .env.local
 *   node scripts/check-taxonomy-consistency.mjs --json
 *   node scripts/check-taxonomy-consistency.mjs --selftest   # guard the guard
 */

const args = process.argv.slice(2);
const AS_JSON = args.includes("--json");
const SELFTEST = args.includes("--selftest");

// ─── Pure core (self-testable, no network) ───────────────────────────────────

/**
 * Terms hidden for a tenant: a term is hidden when it, or ANY ancestor, has
 * `is_enabled = false`. Mirrors `isTaxonomyTermVisibleForTenant` in
 * `src/lib/directory/taxonomy-tenant-safety.ts` — deliberately re-implemented
 * rather than imported, so a bug there cannot silence the probe here.
 */
export function hiddenTermIdsForTenant(termsById, settingsByTerm) {
  const hidden = new Set();
  for (const id of termsById.keys()) {
    let cur = termsById.get(id);
    let depth = 0;
    while (cur && depth < 8) {
      if (settingsByTerm.get(cur.id)?.is_enabled === false) {
        hidden.add(id);
        break;
      }
      cur = cur.parent_id ? termsById.get(cur.parent_id) : undefined;
      depth += 1;
    }
  }
  return hidden;
}

export const TAGGABLE_TERM_TYPES = new Set([
  "parent_category",
  "category_group",
  "talent_type",
]);

/**
 * The `?tax=<parent>` resolution, as the app performs it: expand DOWN (bounded
 * to the levels talent are tagged at), take the leaves, drop tenant-hidden
 * terms, then group BY `kind` and INTERSECT the groups.
 *
 * `boundToTaggable=false` reproduces the PRE-#1083 behaviour and exists so the
 * selftest can watch this go to zero on purpose. A guard nobody has seen fail is
 * not a guard.
 */
export function resolveChipMatch({
  parentId,
  termsById,
  childrenOf,
  hidden,
  holdersOfTerm,
  boundToTaggable = true,
}) {
  const collected = new Set([parentId]);
  let frontier = [parentId];
  for (let d = 0; d < 8 && frontier.length; d += 1) {
    const next = [];
    for (const id of frontier) {
      for (const childId of childrenOf.get(id) ?? []) {
        if (collected.has(childId)) continue;
        const c = termsById.get(childId);
        if (boundToTaggable && c?.term_type && !TAGGABLE_TERM_TYPES.has(c.term_type)) continue;
        collected.add(childId);
        next.push(childId);
      }
    }
    frontier = next;
  }
  const parents = new Set();
  for (const id of collected) {
    const t = termsById.get(id);
    if (t?.parent_id && collected.has(t.parent_id)) parents.add(t.parent_id);
  }
  const matchIds = [...collected].filter((id) => !parents.has(id) && !hidden.has(id));

  const byKind = new Map();
  for (const id of matchIds) {
    const kind = termsById.get(id)?.kind ?? "unknown";
    if (!byKind.has(kind)) byKind.set(kind, new Set());
    for (const pid of holdersOfTerm(id) ?? []) byKind.get(kind).add(pid);
  }
  let out = null;
  for (const set of byKind.values()) {
    out = out === null ? set : new Set([...out].filter((x) => set.has(x)));
  }
  return out ? out.size : 0;
}

/** Walk up to the enclosing parent_category, or null. */
export function parentCategoryOf(termId, termsById) {
  let cur = termsById.get(termId);
  let depth = 0;
  while (cur && depth < 8) {
    if (cur.term_type === "parent_category") return cur.id;
    cur = cur.parent_id ? termsById.get(cur.parent_id) : undefined;
    depth += 1;
  }
  return null;
}

async function selftest() {
  const { default: assert } = await import("node:assert");
  const terms = new Map([
    ["parent", { id: "parent", parent_id: null, term_type: "parent_category" }],
    ["group", { id: "group", parent_id: "parent", term_type: "category_group" }],
    ["leaf", { id: "leaf", parent_id: "group", term_type: "talent_type" }],
  ]);
  // a disabled ANCESTOR must hide the leaf, not just the leaf's own row
  assert.deepEqual(
    [...hiddenTermIdsForTenant(terms, new Map([["group", { is_enabled: false }]]))].sort(),
    ["group", "leaf"],
  );
  // nothing disabled → nothing hidden
  assert.equal(hiddenTermIdsForTenant(terms, new Map()).size, 0);
  // a leaf's own row still hides it
  assert.ok(hiddenTermIdsForTenant(terms, new Map([["leaf", { is_enabled: false }]])).has("leaf"));
  assert.equal(parentCategoryOf("leaf", terms), "parent");
  assert.equal(parentCategoryOf("missing", terms), null);

  // ── Check B must go RED on the real bug shape, not just green on health ────
  // The Performers shape: a talent_type leaf that OWNS a `specialty` child.
  // Specialties carry kind='tag'; talent types carry kind='talent_type'. Nobody
  // is tagged with a specialty.
  const perfTerms = new Map([
    ["performers", { id: "performers", parent_id: null, term_type: "parent_category", kind: "tag" }],
    ["dancers", { id: "dancers", parent_id: "performers", term_type: "category_group", kind: "tag" }],
    ["latin-dancer", { id: "latin-dancer", parent_id: "dancers", term_type: "talent_type", kind: "talent_type" }],
    ["salsa", { id: "salsa", parent_id: "latin-dancer", term_type: "specialty", kind: "tag" }],
  ]);
  const perfChildren = new Map([
    ["performers", ["dancers"]],
    ["dancers", ["latin-dancer"]],
    ["latin-dancer", ["salsa"]],
  ]);
  // one talent tagged latin-dancer; nobody tagged salsa
  const holders = (id) => (id === "latin-dancer" ? new Set(["talent-1"]) : new Set());
  const argsFor = (boundToTaggable) => ({
    parentId: "performers",
    termsById: perfTerms,
    childrenOf: perfChildren,
    hidden: new Set(),
    holdersOfTerm: holders,
    boundToTaggable,
  });
  // BOUNDED (current code): the chip's talent is found.
  assert.equal(resolveChipMatch(argsFor(true)), 1, "bounded expansion must find the talent");
  // UNBOUNDED (pre-#1083): expansion reaches `salsa`, which becomes a second
  // required kind-group that nobody satisfies → the intersection empties out.
  assert.equal(
    resolveChipMatch(argsFor(false)),
    0,
    "unbounded expansion must reproduce the zero-results bug — if this stops being 0, check B has stopped measuring it",
  );
  console.log("✓ check:taxonomy selftest passed (incl. the zero-results bug shape, both directions)");
}

if (SELFTEST) {
  await selftest();
  process.exit(0);
}

// ─── Data probe ──────────────────────────────────────────────────────────────

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

// ─── REFUSE, NEVER SKIP ──────────────────────────────────────────────────────
//
// This branch used to `process.exit(0)` with a "skipping" line, which means
// "I could not look" and "I looked and found nothing" shared an exit code. A
// caller downstream cannot tell them apart, so a missing secret silently
// becomes a pass — the exact defect this repo has recorded more than once, and
// the one `check-anon-function-grants.mjs` was hardened against in #1707.
//
// THE TRAP, worth stating because it is easy to half-fix: a URL *is* present in
// CI (`ci.yml` sets NEXT_PUBLIC_SUPABASE_URL to https://placeholder.supabase.co)
// and a service key never is. Testing `!URL_` alone would therefore pass in CI
// and prove nothing. Both are required, and the message names which one is
// missing so the failure is actionable rather than mysterious.
if (!URL_ || !KEY) {
  const missing = [
    !URL_ ? "NEXT_PUBLIC_SUPABASE_URL" : null,
    !KEY ? "SUPABASE_SERVICE_ROLE_KEY" : null,
  ].filter(Boolean);
  console.error(
    `[check:taxonomy] REFUSING TO RUN: ${missing.join(" and ")} missing, so ` +
      "nothing can be measured.\n" +
      "  A data guard that cannot read must not report clean.\n" +
      "  Run it as an operator check: npm run manual:taxonomy-guard\n" +
      "  (service-role credentials never enter CI, which is why this lane is\n" +
      "   deliberately outside the `ci` chain.)",
  );
  process.exit(1);
}

/** Paged PostgREST select. Keeps every table read under the 1000-row default. */
async function selectAll(table, columns, filter = "") {
  const out = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const url = `${URL_}/rest/v1/${table}?select=${columns}${filter}`;
    const res = await fetch(url, {
      headers: {
        apikey: KEY,
        Authorization: `Bearer ${KEY}`,
        Range: `${from}-${from + PAGE - 1}`,
      },
    });
    if (!res.ok) {
      throw new Error(`${table}: ${res.status} ${(await res.text()).slice(0, 160)}`);
    }
    const rows = await res.json();
    out.push(...rows);
    if (rows.length < PAGE) return out;
  }
}

let failed = 0;
let warned = 0;
const findings = { disabledTermsInUse: [], chipMismatches: [] };

function fail(label, detail) {
  failed += 1;
  if (!AS_JSON) console.log(`  ✗ ${label}  — ${detail}`);
}
/**
 * Non-fatal. Reserved for states the APP now degrades gracefully on, so a
 * deploy should surface them without being blocked.
 *
 * Check A is a warning on purpose. Before #1082/#1086 a switched-off service in
 * use bricked the whole profile save silently; now the save completes and names
 * what it skipped. That makes this a config inconsistency worth someone's
 * attention, not a broken deploy — and the remedy (enabling a parent category)
 * is PLAN-GATED via assertCanEnableTenantParentCategory, so it is a decision for
 * the workspace owner, never something a script should auto-apply.
 *
 * Check B stays fatal: a chip that advertises talent over an empty page is
 * visible breakage on the public directory with no graceful degradation.
 */
function warn(label, detail) {
  warned += 1;
  if (!AS_JSON) console.log(`  ⚠ ${label}  — ${detail}`);
}
function pass(label, detail = "") {
  if (!AS_JSON) console.log(`  ✓ ${label}${detail ? "  — " + detail : ""}`);
}

const [terms, settings, roster, assigns, profiles, agencies] = await Promise.all([
  selectAll("taxonomy_terms", "id,parent_id,term_type,kind,slug,is_active"),
  selectAll("agency_taxonomy_settings", "tenant_id,taxonomy_term_id,is_enabled,show_in_directory"),
  selectAll(
    "agency_talent_roster",
    "tenant_id,talent_profile_id,status,agency_visibility,talent_site_hidden",
  ),
  selectAll("talent_profile_taxonomy", "talent_profile_id,taxonomy_term_id"),
  selectAll("talent_profiles", "id,profile_code,deleted_at,is_publicly_hidden,is_publicly_listed"),
  selectAll("agencies", "id,slug,plan_tier"),
]);

// ─── ZERO ROWS IS A FAILED MEASUREMENT, NOT A CLEAN ONE ──────────────────────
//
// Every check below is of the form "for each row, assert X". On an empty table
// each one passes vacuously and the script prints "all checks passed" — a
// perfect green produced by reading nothing. The credentials being wrong, the
// project being the wrong one, or RLS refusing the anon key all land here, and
// all of them look identical to a healthy database.
//
// These three tables can never legitimately be empty on a live project: there
// are always taxonomy terms, always roster rows and always profiles. So an empty
// read is a broken probe and must say so.
for (const [label, rows] of [
  ["taxonomy_terms", terms],
  ["agency_talent_roster", roster],
  ["talent_profiles", profiles],
]) {
  if (rows.length === 0) {
    console.error(
      `[check:taxonomy] REFUSING TO REPORT: read 0 rows from ${label}.\n` +
        "  Every check here passes vacuously on an empty table, so this would\n" +
        "  have printed a clean bill of health having measured nothing.\n" +
        "  Check the project ref and that the key is a SERVICE-ROLE key.",
    );
    process.exit(1);
  }
}

const termsById = new Map(terms.map((t) => [t.id, t]));
const termBySlug = new Map(terms.map((t) => [t.id, t.slug]));
const agencySlug = new Map(agencies.map((a) => [a.id, a.slug]));
const profileById = new Map(profiles.map((p) => [p.id, p]));

const settingsByTenant = new Map();
for (const s of settings) {
  if (!settingsByTenant.has(s.tenant_id)) settingsByTenant.set(s.tenant_id, new Map());
  settingsByTenant.get(s.tenant_id).set(s.taxonomy_term_id, s);
}

const assignsByProfile = new Map();
for (const a of assigns) {
  if (!assignsByProfile.has(a.talent_profile_id)) assignsByProfile.set(a.talent_profile_id, []);
  assignsByProfile.get(a.talent_profile_id).push(a.taxonomy_term_id);
}

// `listTalentIdsOnTenantRoster` — the storefront roster predicate.
const PUBLIC_VIS = new Set(["site_visible", "featured"]);
const publicRoster = roster.filter(
  (r) => r.status === "active" && PUBLIC_VIS.has(r.agency_visibility) && r.talent_site_hidden === false,
);

// Mirrors TENANT_TAXONOMY_PARENT_LIMITS in
// src/lib/taxonomy/tenant-taxonomy-plan-limits.ts. Duplicated on purpose: this
// probe must keep reporting the truth even if that table is edited.
const PARENT_LIMITS = { free: 3, studio: 8, agency: 999, network: 999 };
const planByTenant = new Map(
  agencies.map((a) => [
    a.id,
    a.plan_tier === "studio" || a.plan_tier === "agency" || a.plan_tier === "network"
      ? a.plan_tier
      : "free",
  ]),
);
const planOf = (tenantId) => planByTenant.get(tenantId) ?? "free";

const allParentIds = terms
  .filter((t) => t.term_type === "parent_category" && t.is_active !== false)
  .map((t) => t.id);
/** Parent categories NOT explicitly disabled — the same count the plan gate uses. */
function enabledParentCount(tenantId) {
  const s = settingsByTenant.get(tenantId) ?? new Map();
  return allParentIds.filter((id) => s.get(id)?.is_enabled !== false).length;
}

const hiddenCache = new Map();
function hiddenFor(tenantId) {
  if (!hiddenCache.has(tenantId)) {
    hiddenCache.set(
      tenantId,
      hiddenTermIdsForTenant(termsById, settingsByTenant.get(tenantId) ?? new Map()),
    );
  }
  return hiddenCache.get(tenantId);
}

// ── A. talent holding a term their own tenant switched off ───────────────────
console.log("\nA. Roster holds no switched-off service");
{
  const perTenant = new Map();
  for (const r of publicRoster) {
    const hidden = hiddenFor(r.tenant_id);
    for (const termId of assignsByProfile.get(r.talent_profile_id) ?? []) {
      if (!hidden.has(termId)) continue;
      const key = r.tenant_id;
      if (!perTenant.has(key)) perTenant.set(key, { talents: new Set(), terms: new Set() });
      perTenant.get(key).talents.add(r.talent_profile_id);
      perTenant.get(key).terms.add(termId);
    }
  }
  if (perTenant.size === 0) {
    pass("no tenant has active talent holding a service it disabled");
  } else {
    for (const [tenantId, v] of perTenant) {
      const slugs = [...v.terms].map((t) => termBySlug.get(t) ?? t).sort();
      // Is this DRIFT, or the plan boundary working as designed?
      //
      // A free workspace may enable 3 parent categories. When it is already at
      // its limit, holding a service outside those 3 is EXPECTED — enabling the
      // blocking category is a paid capability, gated by
      // `assertCanEnableTenantParentCategory`. Reporting that as an action item
      // invites someone to "fix" it in SQL and hand a free tenant paid
      // categories. Classify it instead.
      const plan = planOf(tenantId);
      const limit = PARENT_LIMITS[plan] ?? PARENT_LIMITS.free;
      const enabled = enabledParentCount(tenantId);
      const atPlanLimit = enabled >= limit;
      findings.disabledTermsInUse.push({
        tenant: agencySlug.get(tenantId) ?? tenantId,
        talents: v.talents.size,
        terms: slugs,
        plan,
        enabledParents: enabled,
        parentLimit: limit,
        classification: atPlanLimit ? "expected-plan-limit" : "actionable",
      });
      warn(
        `${agencySlug.get(tenantId) ?? tenantId}`,
        `${v.talents.size} talent hold ${v.terms.size} switched-off service(s): ${slugs.slice(0, 8).join(", ")}${slugs.length > 8 ? "…" : ""}. ` +
          (atPlanLimit
            ? `EXPECTED — plan limit reached (${plan}: ${enabled}/${limit} category groups). Enabling the ` +
              `blocking category is a paid capability; do NOT force it in SQL. The save reports these ` +
              `services rather than dropping them, so nothing is broken.`
            : `ACTIONABLE — ${plan} plan has room (${enabled}/${limit}). The workspace either wants the ` +
              `category on (Settings → Roster → Talent types) or the service off those profiles.`),
      );
    }
  }
}

// ── B. chip count == what clicking the chip actually resolves to ─────────────
//
// Both sides are computed the way the CODE computes them, not the way it would
// be convenient to compute them:
//
//   chip     — `loadDirectoryCategoryTree`: public roster ∩ public-listing gate,
//              visible talent_type leaves rolled up to their parent_category.
//   resolved — `resolveTenantSafeDirectoryTaxonomyTermIds` + the kind-grouping in
//              `fetch-directory-page`: expand the parent DOWN to the levels talent
//              are tagged at, drop tenant-hidden terms, then group the survivors
//              BY `kind` and INTERSECT the groups ("OR within kind, AND across
//              kinds"). That intersection is what made every Performers chip
//              resolve to zero: expansion reached `specialty` terms, which carry
//              kind='tag' while talent types carry kind='talent_type', so it
//              silently became a second REQUIRED dimension nothing satisfies.
//
// Replicating the intersection is the whole point — a guard that only compared
// two roster counts would have been green through that entire bug.
console.log("\nB. Directory chips promise what clicking them returns");
{

  const childrenOf = new Map();
  for (const t of terms) {
    if (!t.parent_id) continue;
    if (!childrenOf.has(t.parent_id)) childrenOf.set(t.parent_id, []);
    childrenOf.get(t.parent_id).push(t.id);
  }

  /** Talent (public-listed) tagged with `termId`, scoped to this tenant's roster. */
  const holdersOf = new Map(); // `${tenant}|${term}` → Set<profileId>
  for (const r of publicRoster) {
    const p = profileById.get(r.talent_profile_id);
    if (!p || p.deleted_at != null || p.is_publicly_hidden !== false || p.is_publicly_listed !== true)
      continue;
    for (const termId of assignsByProfile.get(r.talent_profile_id) ?? []) {
      const k = `${r.tenant_id}|${termId}`;
      if (!holdersOf.has(k)) holdersOf.set(k, new Set());
      holdersOf.get(k).add(r.talent_profile_id);
    }
  }

  // chip counts, exactly as loadDirectoryCategoryTree builds them
  const chip = new Map(); // `${tenant}|${parent}` → Set<profileId>
  for (const [k, holders] of holdersOf) {
    const [tenantId, termId] = k.split("|");
    const leaf = termsById.get(termId);
    if (!leaf || leaf.term_type !== "talent_type" || leaf.is_active === false) continue;
    const hidden = hiddenFor(tenantId);
    if (hidden.has(termId)) continue;
    const parent = parentCategoryOf(termId, termsById);
    if (!parent || hidden.has(parent) || termsById.get(parent)?.is_active === false) continue;
    const ck = `${tenantId}|${parent}`;
    if (!chip.has(ck)) chip.set(ck, new Set());
    for (const id of holders) chip.get(ck).add(id);
  }

  let mismatches = 0;
  for (const [ck, chipSet] of chip) {
    const [tenantId, parentId] = ck.split("|");
    const hidden = hiddenFor(tenantId);

    const resolvedCount = resolveChipMatch({
      parentId,
      termsById,
      childrenOf,
      hidden,
      holdersOfTerm: (id) => holdersOf.get(`${tenantId}|${id}`),
    });

    if (chipSet.size === resolvedCount) continue;
    mismatches += 1;
    const row = {
      tenant: agencySlug.get(tenantId) ?? tenantId,
      category: termBySlug.get(parentId) ?? parentId,
      chip: chipSet.size,
      resolved: resolvedCount,
    };
    findings.chipMismatches.push(row);
    fail(
      `${row.tenant} / ${row.category}`,
      resolvedCount === 0
        ? `chip shows ${row.chip} but clicking it resolves to ZERO — an empty page behind a number`
        : `chip shows ${row.chip}, the ?tax= filter resolves to ${resolvedCount}`,
    );
  }
  if (mismatches === 0) pass(`all ${chip.size} tenant/category chips agree with their filter`);
}

if (AS_JSON) {
  console.log(JSON.stringify({ ok: failed === 0, warned, findings }, null, 2));
} else {
  const suffix = warned > 0 ? `  (${warned} warning${warned === 1 ? "" : "s"})` : "";
  console.log(
    `\n${failed === 0 ? "✓ taxonomy consistency: all checks passed" : `✗ taxonomy consistency: ${failed} check(s) failed`}${suffix}`,
  );
}
process.exit(failed === 0 ? 0 : 1);
