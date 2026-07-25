// read-source-public-sidebar.test.ts
//
// T2.2 — output-parity proof for the public-profile sidebar VISIBILITY repoint,
// plus the documented ORDER-sequence divergence (HAZARD #1).
//
// The visibility DECISION is already canonical (System B) pre-T2.2; T2.2 only
// changes WHERE the base-guard row shape comes from. So the proof is: given the
// real prod row shapes for both stores, the A-derived and B-derived
// `fieldVisibility` objects are IDENTICAL for every sidebar key — including the
// deliberately-hidden `skills` (deprecated canonical row), which must stay
// hidden under BOTH stores.
//
// This test re-derives the resolver decision with pure functions over the prod
// data captured read-only against ref pluhdapdnuiulvxmyspd (2026-06-11). It does
// NOT hit the DB (the reader modules import `server-only` + Supabase). The
// runtime A===B guarantee is additionally enforced by the safe-fallback seam +
// the read-source.test.ts dispatch tests. Run:
//   npx tsx --test src/lib/field-engine/read-source-public-sidebar.test.ts
// Wired into `npm run test:fields` (→ `ci`).

import test from "node:test";
import assert from "node:assert/strict";

import { PUBLIC_SIDEBAR_KEYS } from "@/lib/field-engine/read-source-public-sidebar";

// ── Prod store snapshots (read-only, ref pluhdapdnuiulvxmyspd, 2026-06-11) ────
//
// System A — field_definitions (the legacy base-guard row shape page.tsx fed
// the resolver before T2.2). All six rows are active + non-archived.
const A_ROWS: Record<
  string,
  { active: boolean; archived: boolean; sort_order: number }
> = {
  fit_labels: { active: true, archived: false, sort_order: 60 },
  skills: { active: true, archived: false, sort_order: 30 },
  languages: { active: true, archived: false, sort_order: 70 },
  industries: { active: true, archived: false, sort_order: 40 },
  event_types: { active: true, archived: false, sort_order: 50 },
  tags: { active: true, archived: false, sort_order: 20 },
};

// System B — profile_field_definitions (the canonical row shape + the canonical
// visibility decision). `deprecated_at` set ⇒ deprecated. `is_public` here is
// effectiveFieldVisibility(def)==="public" for these no-override defs.
const B_ROWS: Record<
  string,
  {
    deprecated: boolean;
    is_public: boolean;
    show_in_public_profile_sidebar: boolean;
    display_order: number;
  }
> = {
  fit_labels: { deprecated: false, is_public: true, show_in_public_profile_sidebar: true, display_order: 350 },
  // skills: DEPRECATED — the canonical batch loader skips it ⇒ no decision ⇒
  // the resolver returns false. The section is HIDDEN on the live site today.
  skills: { deprecated: true, is_public: true, show_in_public_profile_sidebar: true, display_order: 100 },
  languages: { deprecated: false, is_public: true, show_in_public_profile_sidebar: true, display_order: 100 },
  industries: { deprecated: false, is_public: true, show_in_public_profile_sidebar: true, display_order: 360 },
  event_types: { deprecated: false, is_public: true, show_in_public_profile_sidebar: true, display_order: 365 },
  tags: { deprecated: false, is_public: true, show_in_public_profile_sidebar: true, display_order: 370 },
};

// There are ZERO workspace_profile_field_settings overrides for any of the six
// sidebar keys across ALL tenants (verified read-only) — so the decision is
// tenant-invariant: the same `fieldVisibility` renders for every (profile, host)
// pair. This is what lets a single per-key proof stand in for all 12 sampled
// profiles.

// ── Pure re-derivation of the resolver decision per store ─────────────────────
//
// A-derived: page.tsx feeds the live field_definitions row (active + not
// archived) ⇒ base guard passes ⇒ canonical path ⇒ false ONLY when the
// canonical row is deprecated/missing (skills) ⇒ otherwise isPublic && sidebar.
function aDerivedVisible(key: string): boolean {
  const a = A_ROWS[key];
  if (!a || !a.active || a.archived) return false; // base guard (A row shape)
  // canonical decision (System B), with deprecated ⇒ no decision ⇒ false:
  const b = B_ROWS[key];
  if (!b || b.deprecated) return false;
  return b.is_public && b.show_in_public_profile_sidebar;
}

// B-derived: the reader maps deprecated_at → synthetic active=false, so the base
// guard itself returns false for skills; the live (non-deprecated) keys pass the
// guard then take the identical canonical decision.
function bDerivedVisible(key: string): boolean {
  const b = B_ROWS[key];
  if (!b) return true; // missing key ⇒ page.tsx "render all sections" fallback
  if (b.deprecated) return false; // synthetic !active base guard
  return b.is_public && b.show_in_public_profile_sidebar;
}

// ── Proof 1: per-key visibility A === B (the gate) ────────────────────────────

test("visibility: A-derived === B-derived for every sidebar key (incl. deprecated skills)", () => {
  const table = PUBLIC_SIDEBAR_KEYS.map((key) => ({
    key,
    a: aDerivedVisible(key),
    b: bDerivedVisible(key),
  }));
  for (const row of table) {
    assert.equal(
      row.a,
      row.b,
      `sidebar key "${row.key}": A=${row.a} but B=${row.b} — sidebar would change`,
    );
  }
  // Pin the absolute decision so a future data drift that flips a section is
  // caught: skills hidden, the rest visible.
  const byKey = Object.fromEntries(table.map((r) => [r.key, r.a]));
  assert.deepEqual(byKey, {
    fit_labels: true,
    skills: false, // deprecated canonical row ⇒ hidden under BOTH stores
    languages: true,
    industries: true,
    event_types: true,
    tags: true,
  });
});

// ── Proof 2: the projected fieldVisibility object is identical ────────────────

test("visibility: the assembled fieldVisibility object matches the live render", () => {
  const project = (fn: (k: string) => boolean) => ({
    showFitLabels: fn("fit_labels"),
    showSkills: fn("skills"),
    showLanguages: fn("languages"),
    showIndustries: fn("industries"),
    showEventTypes: fn("event_types"),
    showTags: fn("tags"),
  });
  assert.deepEqual(project(aDerivedVisible), project(bDerivedVisible));
  assert.deepEqual(project(bDerivedVisible), {
    showFitLabels: true,
    showSkills: false,
    showLanguages: true,
    showIndustries: true,
    showEventTypes: true,
    showTags: true,
  });
});

// ── Proof 3 (HAZARD #1): the ORDER sequences DIVERGE — documented, non-rendering ─
//
// This test does NOT assert equality — it PINS the known divergence so it is
// visible + reviewed, and documents WHY it is safe (the live sidebar render is
// hard-coded JSX; neither order column reaches the render). If a future change
// ever wires DB-driven order onto the live sidebar, this test forces a conscious
// decision (reconcile B's display_order, or sign off the new order).

function rankedSequence(
  ranks: Record<string, number>,
  includeDeprecated: boolean,
): string[] {
  return PUBLIC_SIDEBAR_KEYS.filter(
    (k) => includeDeprecated || !B_ROWS[k]?.deprecated,
  )
    .filter((k) => k in ranks)
    .slice()
    .sort((a, b) => (ranks[a] - ranks[b]) || PUBLIC_SIDEBAR_KEYS.indexOf(a) - PUBLIC_SIDEBAR_KEYS.indexOf(b));
}

test("order (HAZARD #1): A sort_order and B display_order sequences DIVERGE (non-rendering)", () => {
  const aSeq = rankedSequence(
    Object.fromEntries(Object.entries(A_ROWS).map(([k, v]) => [k, v.sort_order])),
    true, // A keeps skills (it has no deprecation concept)
  );
  const bSeq = rankedSequence(
    Object.fromEntries(Object.entries(B_ROWS).map(([k, v]) => [k, v.display_order])),
    false, // B's order reader filters deprecated ⇒ skills dropped
  );
  // A: tags(20) skills(30) industries(40) event_types(50) fit_labels(60) languages(70)
  assert.deepEqual(aSeq, [
    "tags",
    "skills",
    "industries",
    "event_types",
    "fit_labels",
    "languages",
  ]);
  // B: languages(100) fit_labels(350) industries(360) event_types(365) tags(370)
  assert.deepEqual(bSeq, [
    "languages",
    "fit_labels",
    "industries",
    "event_types",
    "tags",
  ]);
  // The sequences are NOT equal — and that is fine: neither drives the live
  // render. The visibility flip (Proofs 1 & 2) does NOT touch order.
  assert.notDeepEqual(aSeq, bSeq);
});

// ── Proof 4 (2026-07-25): the section gate is keyed on the ROSTER tenant ──────
//
// `readPublicSidebarVisibility(pub, tenantId)` funnels each key through
// `isResolvedFieldVisibleInPublicProfileSidebar`, whose only tenant input is
// that `tenantId` — it selects the `workspace_profile_field_settings` rows
// (`show_in_public_profile_sidebar_override`) that decide the six sections.
//
// page.tsx used to pass `hostCtx.tenantId`. That is the AGENCY tenant on an
// agency host, but on the hub host `getPublicHostContext` returns `kind:"hub"`
// carrying the HUB AGENCY's OWN tenant id — a tenant with no authority over a
// roster talent — while the field VALUES rendered inside those sections were
// already resolved against the talent's roster tenant. So the two hosts could
// disagree about which sections exist, and a section an agency deliberately hid
// stayed visible on the hub.
//
// The fix resolves ONE tenant (`resolveProfileOverrideTenantId`) and passes it
// to the field-value reads, the category reads and this reader. These tests
// model the resolver's tenant-keying and pin the host-agreement property.

/** The per-key decision the canonical resolver makes, as a function of the
 *  tenant whose override row applies. Mirrors the AND in
 *  `isResolvedFieldVisibleInPublicProfileSidebar`: base guard ∧ isPublic ∧
 *  (tenant override ?? canonical show_in_public_profile_sidebar). */
function decisionForTenant(
  key: string,
  tenantId: string | null,
  overridesByTenant: Record<string, Partial<Record<string, boolean>>>,
): boolean {
  const b = B_ROWS[key];
  if (!b) return true; // missing key ⇒ "render all sections" fallback
  if (b.deprecated) return false; // synthetic !active base guard
  const override = tenantId ? overridesByTenant[tenantId]?.[key] : undefined;
  return b.is_public && (override ?? b.show_in_public_profile_sidebar);
}

const ROSTER_TENANT = "roster-agency";
const HUB_TENANT = "hub-agency";

// The roster agency hid "Tags" in Settings → Roster & profile fields. The hub
// agency has no override for it.
const OVERRIDES: Record<string, Partial<Record<string, boolean>>> = {
  [ROSTER_TENANT]: { tags: false },
  [HUB_TENANT]: {},
};

test("tenant scoping: hub host and tenant host agree once both key on the roster tenant", () => {
  const project = (tenantId: string | null) =>
    Object.fromEntries(
      PUBLIC_SIDEBAR_KEYS.map((k) => [k, decisionForTenant(k, tenantId, OVERRIDES)]),
    );

  // BEFORE: the hub passed its own tenant id ⇒ the agency's hide did not apply.
  const buggyHub = project(HUB_TENANT);
  const tenantHost = project(ROSTER_TENANT);
  assert.notDeepEqual(
    buggyHub,
    tenantHost,
    "the old hostCtx.tenantId keying must be observably wrong, or this test proves nothing",
  );
  assert.equal(buggyHub.tags, true, "hub leaked a section the agency hid");

  // AFTER: both hosts resolve the roster tenant ⇒ identical section set.
  assert.deepEqual(project(ROSTER_TENANT), tenantHost);
  assert.equal(tenantHost.tags, false, "the agency's hide applies on both hosts");
});

test("tenant scoping: a talent on no active roster gets canonical defaults, not a stray tenant's hides", () => {
  // No active roster row ⇒ resolver returns null ⇒ no override row is selected.
  // Null means "canonical defaults", NOT "show everything": the deprecated
  // `skills` section stays hidden by the canonical safety floor.
  const noRoster = Object.fromEntries(
    PUBLIC_SIDEBAR_KEYS.map((k) => [k, decisionForTenant(k, null, OVERRIDES)]),
  );
  assert.deepEqual(noRoster, {
    fit_labels: true,
    skills: false, // canonical floor still applies
    languages: true,
    industries: true,
    event_types: true,
    tags: true, // nobody has authority to hide an unaffiliated talent's section
  });
});
