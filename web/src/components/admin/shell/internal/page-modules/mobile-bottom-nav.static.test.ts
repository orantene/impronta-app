/**
 * mobile-bottom-nav.static.test.ts — T2-mobile.
 *
 * MobileBottomNav.tsx is a `"use client"` module (React + next/navigation),
 * so — same reason as `rail-visible-pages.static.test.ts` gives for
 * WorkspaceShell.tsx — it cannot be imported into a plain node:test. Two
 * kinds of check below: SOURCE-SCAN assertions about how the component is
 * built, and RUNTIME assertions against the pure functions it calls at render
 * time.
 *
 * WHAT THIS FILE DOES NOT CLAIM
 * ─────────────────────────────
 * An earlier version of this file carried a test named "nothing shows on the
 * phone that the sidebar hides". It compared `mobileTabs()` with
 * `sidebarGroups()` — two functions in destinations.ts that both filter the
 * same `visibleDestinations()` list — so it was a tautology that could not
 * fail, and it never touched the REAL sidebar (WorkspaceShell.tsx), which is
 * still hand-written and is being rewired onto this registry by a separate
 * task. Measured against that real sidebar the two surfaces do NOT agree
 * today. The claim is withdrawn: what is asserted below is only that each
 * phone surface is a faithful projection of the registry, which is the half
 * this task actually established. Parity with the desktop rail becomes
 * provable — and this file should grow that test — once WorkspaceShell.tsx
 * reads `sidebarGroups()` too.
 *
 * A NOTE ON THE "DIFFERENT FOURTH TAB" CASE
 * ──────────────────────────────────────────
 * The task brief named a check: "an assistant sees a different fourth tab
 * than an owner", with an acceptance set of "Today, Calendar, Clients,
 * Sales". Neither is true of the registry as shipped, and this file asserts
 * what IS true rather than the brief's text — see
 * `the fixed top-4 bar is role-invariant, and here is the structural reason`
 * below, which pins the CAUSE (no destination with a `mobilePriority` of 1-4
 * carries a `requires.roles` clause) and not just the symptom, so it goes red
 * the moment someone adds one and the test has to be rewritten to assert the
 * difference. Reordering the registry or inventing a role gate on
 * Messages/Calendar/Appointments to match the brief would be a product
 * decision this task was not asked to make, and destinations.ts's own module
 * header says the registry is what the mobile nav is rewired AGAINST, not
 * something this task edits.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DESTINATIONS,
  DESTINATION_LIST,
  mobileTabs,
  sidebarGroups,
  isPosSegment,
  visibleDestinations,
  type WorkspaceNavContext,
} from "@/lib/workspace/destinations";
import { canManageBilling, derivePreset, deriveWorkRole } from "@/lib/workspace/nav-context";
import { blankComments } from "@/lib/quality/supabase-unchecked-read";

const readRaw = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
/**
 * Source scans read the file with every comment blanked out. Without this a
 * guard looking for `workspacePosEnabled` would be satisfied by a comment
 * MENTIONING it, and would stay green with the code it guards deleted —
 * `guard-reads-source.static.test.ts` fails the whole lane over exactly that.
 */
const read = (p: string) => blankComments(readRaw(p));
const SRC = "src/components/admin/shell/internal/page-modules/MobileBottomNav.tsx";

const BASE: WorkspaceNavContext = {
  workspaceType: "talent",
  plan: "agency",
  preset: "hybrid",
  role: "owner",
  professional: false,
  takesReservations: true,
  runsEvents: true,
  posEnabled: false,
  canManageBilling: true,
};

function ctx(overrides: Partial<WorkspaceNavContext> = {}): WorkspaceNavContext {
  return { ...BASE, ...overrides };
}

// Real preset ids (from lib/words/presets.ts), not invented ones.
const CAFE_PRESET_ID = "restaurant";
const SOLO_PRESET_ID = "salon_barber";

// ── Source-scan: the component is a projection, not a second list ────────

test("MobileBottomNav is built from the destinations registry, not a hand-written list", () => {
  const src = read(SRC);
  assert.ok(src.includes('from "@/lib/workspace/destinations"'), "must import the registry");
  assert.ok(src.includes("mobileTabs("), "bar tabs must come from mobileTabs()");
  assert.ok(src.includes("sidebarGroups("), "the More sheet must come from sidebarGroups()");
  // The old bug this task fixed: a second, hand-rolled icon map missing
  // entries for several pages. Both old maps are gone.
  assert.ok(!src.includes("WORKSPACE_TAB_ICON"), "the old hand-written workspace icon map must be deleted");
  assert.ok(src.includes("d.icon"), "icons must be read off the destination, not a local map");
});

test("MobileBottomNav hides on the point of sale route", () => {
  const src = read(SRC);
  assert.ok(src.includes("isPosSegment("), "must check isPosSegment before rendering");
  assert.ok(/if\s*\(onPosRoute\)\s*return null;/.test(src), "must bail out (render nothing) on the POS route");
});

// ── The inline-style ratchet, COUNTED (not sampled) ──────────────────────
//
// The previous version of this test asserted that three class-name substrings
// appeared in the file. That is adjacent to the rule and not the rule: the
// component could carry any number of `style={{…}}` attributes and still
// contain those three strings, which is exactly what happened — the file went
// to 17 inline styles against a recorded baseline of 13 while this test stayed
// green. It now counts the same thing `ratchet/no-new-inline-style` counts
// (one report per `style={{…}}` JSX attribute) and compares against the
// suppression file's own number, read at runtime so the two cannot drift.

const SUPPRESSIONS = "eslint-suppressions.json";
const INLINE_STYLE_ATTR = /\bstyle=\{\s*\{/g;

function countInlineStyleAttributes(src: string): number {
  return src.match(INLINE_STYLE_ATTR)?.length ?? 0;
}

function recordedInlineStyleBaseline(path: string): number {
  const raw = JSON.parse(readRaw(SUPPRESSIONS)) as Record<
    string,
    Record<string, { count: number }> | undefined
  >;
  return raw[path]?.["ratchet/no-new-inline-style"]?.count ?? 0;
}

test("MobileBottomNav adds no inline style attribute beyond its recorded baseline", () => {
  const baseline = recordedInlineStyleBaseline(SRC);
  assert.ok(baseline > 0, "the suppression file must still record a baseline for this file");
  const found = countInlineStyleAttributes(read(SRC));
  assert.ok(
    found <= baseline,
    `${found} inline style={{…}} attributes in ${SRC}, but only ${baseline} are grandfathered. ` +
      "Move the new ones to a class in the component's own <style> block; never raise the baseline.",
  );
});

test("the counter this ratchet uses actually counts inline style attributes", () => {
  // Guards the guard: if the regex above stopped matching, the test before it
  // would pass on any file at all. Both spellings ESLint would report, and a
  // near miss it would not.
  assert.equal(countInlineStyleAttributes('<div style={{ a: 1 }} />'), 1);
  assert.equal(countInlineStyleAttributes('<div style={ { a: 1 } } />'), 1);
  assert.equal(countInlineStyleAttributes('<div style={{}} /><div style={{ b: 2 }} />'), 2);
  assert.equal(countInlineStyleAttributes('<div className="style={{" />'), 1);
  assert.equal(countInlineStyleAttributes('<div style={styles.row} />'), 0);
});

test("the workspace More sheet is class-driven", () => {
  const src = read(SRC);
  for (const cls of [
    "tulala-mnav-bar",
    "tulala-mnav-bar-row",
    "tulala-mnav-row",
    "tulala-mnav-role-chip",
    "tulala-mnav-switcher",
    "tulala-mnav-feedback",
  ]) {
    assert.ok(src.includes(cls), `${cls} must exist — the workspace branch is class-driven`);
    assert.ok(src.includes(`.${cls} {`), `${cls} must be defined in the component's <style> block`);
  }
});

// ── The Open POS row: reachable, and driven by real bridge data ──────────
//
// The behaviour itself is exercised in lib/workspace/mobile-more-actions.test.ts
// (an owner with the platform switch on sees the row; it is absent with the
// switch off). What can only be checked here is that the component feeds that
// function REAL values instead of the constants that made the row dead.

test("the Open POS row's inputs come from the shell bridge, not from literals", () => {
  const src = read(SRC);
  assert.ok(src.includes("mobileMoreActions("), "the sheet's auxiliary rows must come from the shared builder");
  assert.ok(
    src.includes("workspacePosEnabled") && src.includes("workspacePosModes"),
    "both POS inputs must be read off useAdminShell()",
  );
  assert.ok(
    /posEnabled:\s*workspacePosEnabled/.test(src),
    "the nav context's posEnabled must be the bridge value",
  );
  assert.ok(
    /workspaceEnabledModes:\s*workspacePosModes/.test(src),
    "the enabled modes must be the workspace's own, never a literal list",
  );
  // The two constants that made the row unreachable, named so a re-introduction
  // is a failure and not a silent regression.
  assert.ok(!/posEnabled:\s*(false|true)\b/.test(src), "posEnabled must never be a literal here");
  assert.ok(
    !/workspaceEnabledModes:\s*\[/.test(src),
    "workspaceEnabledModes must never be an inline array literal here",
  );
});

test("the shell bridge actually carries both POS inputs end to end", () => {
  // Without this the test above proves only that the component reads two names
  // off a context — not that anything ever puts a real value in them.
  const bridge = read("src/components/admin/shell/internal/data-bridge.ts");
  assert.ok(/posEnabled\?:\s*boolean/.test(bridge), "the bridge's workspaceUi must carry posEnabled");
  assert.ok(/posModes\?:/.test(bridge), "the bridge's tenantIdentity must carry posModes");

  const context = read("src/components/admin/shell/internal/state/context.tsx");
  assert.ok(
    /readWorkspacePosBridge\(\s*initialBridgeData\?\.workspaceUi,\s*initialBridgeData\?\.tenantIdentity,?\s*\)/.test(
      context,
    ),
    "the shell context must fill both POS fields from the bridge reader",
  );

  // The reader's own fallbacks are exercised in lib/workspace/pos-bridge.test.ts;
  // what matters here is that neither one is `[]` or a literal.
  const reader = read("src/lib/workspace/pos-bridge.ts");
  assert.ok(
    /posEnabled:\s*workspaceUi\?\.posEnabled\s*\?\?\s*false/.test(reader),
    "an absent platform switch must read as off",
  );
  assert.ok(
    /posModes:\s*tenantIdentity\?\.posModes\s*\?\?\s*DEFAULT_POS_MODES/.test(reader),
    "an absent posModes must fall back to the parser's documented default, not to []",
  );
  assert.ok(
    !/\?\?\s*\[\s*\]/.test(reader),
    "no fallback in the POS bridge reader may be an empty list",
  );

  const identity = read("src/app/(workspace)/[tenantSlug]/_layout-identity.ts");
  assert.ok(
    /posModes:\s*enabledPosModesFromSettings\(data\.settings\)/.test(identity),
    "the server loader must parse the workspace's own settings blob",
  );
});

test("the platform POS switch is a real column the loader reads", () => {
  const loader = read("src/lib/platform/workspace-ui.ts");
  assert.ok(loader.includes("workspace_pos_enabled"), "posEnabled must come from platform_settings");
});

// ── Runtime: the registry functions the component actually calls ────────

test("the top-4 mobile bar is identical for a cafe, a solo professional, and a hybrid workspace", () => {
  const cafe = ctx({ preset: derivePreset({ industryPreset: CAFE_PRESET_ID }) });
  const solo = ctx({ preset: derivePreset({ industryPreset: SOLO_PRESET_ID, teamMemberCount: 1 }) });
  const hybrid = ctx({ preset: "hybrid" });
  assert.equal(cafe.preset, "cafe");
  assert.equal(solo.preset, "solo");
  assert.equal(hybrid.preset, "hybrid");

  const cafeIds = mobileTabs(cafe, 4).map((d) => d.id);
  const soloIds = mobileTabs(solo, 4).map((d) => d.id);
  const hybridIds = mobileTabs(hybrid, 4).map((d) => d.id);
  // None of the top-4 mobilePriority destinations carry a preset-dependent
  // requirement or a preset label override today, so the set is the same —
  // this pins that fact rather than assuming it, so a future registry
  // change that DOES differentiate the top-4 by preset trips this test
  // instead of shipping unnoticed.
  assert.deepEqual(cafeIds, hybridIds);
  assert.deepEqual(soloIds, hybridIds);
  assert.deepEqual(cafeIds, ["overview", "messages", "calendar", "appts"]);
});

test("every mobile tab id is a real, built destination", () => {
  for (const preset of ["cafe", "solo", "hybrid"] as const) {
    for (const d of mobileTabs(ctx({ preset }), 4)) {
      assert.ok(d.id in DESTINATIONS, `${d.id} is not a registered destination`);
      assert.equal(DESTINATIONS[d.id].id, d.id);
    }
  }
});

test("each phone surface is a faithful projection of the registry — it invents nothing and drops nothing", () => {
  // NOT a desktop-parity claim (see the module header). What this pins is that
  // neither phone projection edits the visible set: the bar is a subset of it,
  // and the grouped sheet is exactly it, minus the chrome-only POS entry that
  // sidebarGroups() drops on purpose. A future projection that filtered on its
  // own — the thing that would break parity once the sidebar reads the same
  // registry — fails here.
  const scenarios: WorkspaceNavContext[] = [
    ctx({ role: "owner" }),
    ctx({ role: "assistant", canManageBilling: false }),
    ctx({ takesReservations: false }),
    ctx({ workspaceType: "business" }),
    ctx({ plan: "free" }),
    ctx({ posEnabled: true }),
  ];
  for (const c of scenarios) {
    const visible = visibleDestinations(c);
    const visibleIds = new Set(visible.map((d) => d.id));

    for (const d of mobileTabs(c, DESTINATION_LIST.length)) {
      assert.ok(visibleIds.has(d.id), `${d.id} is on the phone bar but not visible in this context`);
    }

    const sheetIds = sidebarGroups(c).flatMap((g) => g.destinations.map((d) => d.id));
    const expected = visible.filter((d) => d.chrome === undefined).map((d) => d.id);
    assert.deepEqual(
      [...sheetIds].sort(),
      [...expected].sort(),
      "the More sheet must show every visible non-chrome destination, and only those",
    );
  }
});

test("POS never appears on the phone bar or in the More sheet — it is chrome, reached from its own row", () => {
  for (const c of [ctx({ posEnabled: true }), ctx({ posEnabled: false })]) {
    assert.ok(!mobileTabs(c, 20).some((d) => d.id === "pos"));
    assert.ok(!sidebarGroups(c).some((g) => g.destinations.some((d) => d.id === "pos")));
  }
  assert.ok(isPosSegment("pos"));
});

test("role changes what a person can reach — through the registry clauses that exist today", () => {
  const owner = ctx({ role: "owner", canManageBilling: canManageBilling(deriveWorkRole("owner")) });
  const assistant = ctx({ role: "assistant", canManageBilling: canManageBilling(deriveWorkRole("assistant")) });
  assert.equal(owner.canManageBilling, true);
  assert.equal(assistant.canManageBilling, false);

  const ownerIds = new Set(
    sidebarGroups(owner).flatMap((g) => g.destinations.map((d) => d.id)),
  );
  const assistantIds = new Set(
    sidebarGroups(assistant).flatMap((g) => g.destinations.map((d) => d.id)),
  );
  assert.ok(ownerIds.has("payments"), "an owner must see Payments (requires.billing)");
  assert.ok(!assistantIds.has("payments"), "an assistant must not see Payments");
});

test("the fixed top-4 bar is role-invariant, and here is the structural reason", () => {
  // The brief asked for "an assistant sees a different fourth tab than an
  // owner". This asserts the opposite, deliberately, because it is what the
  // shipped registry does — and it asserts the CAUSE as well as the effect, so
  // it cannot quietly stay true for a different reason. The moment a
  // destination with a mobilePriority of 1-4 gains a `requires.roles` clause
  // (or any other role-varying clause), the first assertion below fails and
  // whoever made that change has to come here and state the new fourth tab.
  const owner = ctx({ role: "owner", canManageBilling: canManageBilling(deriveWorkRole("owner")) });
  const assistant = ctx({ role: "assistant", canManageBilling: canManageBilling(deriveWorkRole("assistant")) });

  const topFour = DESTINATION_LIST.filter(
    (d) => d.mobilePriority !== undefined && d.mobilePriority <= 4 && d.chrome === undefined,
  );
  assert.equal(topFour.length, 4, "exactly four destinations claim a top-4 mobile slot");
  for (const d of topFour) {
    assert.equal(d.requires?.roles, undefined, `${d.id} carries a role clause — the bar is no longer role-invariant`);
    assert.equal(d.requires?.billing, undefined, `${d.id} carries a billing clause — the bar is no longer role-invariant`);
  }

  const ownerTabs = mobileTabs(owner, 4).map((d) => d.id);
  const assistantTabs = mobileTabs(assistant, 4).map((d) => d.id);
  assert.deepEqual(ownerTabs, assistantTabs);
  assert.deepEqual(ownerTabs, ["overview", "messages", "calendar", "appts"]);
  // Role DOES change the phone today — in the sheet, not the bar. Proven in
  // "role changes what a person can reach" above.
});

test("the professional hat gates mywork, which has nowhere to route yet — never a mobile tab", () => {
  const bookable = ctx({ professional: true });
  const notBookable = ctx({ professional: false });
  assert.ok(visibleDestinations(bookable).some((d) => d.id === "mywork"));
  assert.ok(!visibleDestinations(notBookable).some((d) => d.id === "mywork"));
  assert.ok(DESTINATIONS.mywork.mobilePriority === undefined, "mywork must stay out of the fixed bar — it has no live route");
});
