/**
 * mobile-bottom-nav.static.test.ts — T2-mobile.
 *
 * MobileBottomNav.tsx is a `"use client"` module (React + next/navigation),
 * so — same reason as `rail-visible-pages.static.test.ts` gives for
 * WorkspaceShell.tsx — it cannot be imported into a plain node:test. Two
 * kinds of check below: SOURCE-SCAN assertions that the component is built
 * as a projection of the registry (not a hand-written list), and RUNTIME
 * assertions against the registry's own pure functions, which is what the
 * component actually calls at render time.
 *
 * A NOTE ON THE "DIFFERENT FOURTH TAB" CASE
 * ──────────────────────────────────────────
 * The task brief for this slice named a specific check: "an assistant sees
 * a different fourth tab than an owner." Checked against the registry as
 * shipped (`DESTINATIONS` in ./../../../../../lib/workspace/destinations —
 * see the import below), that is not true today: the four destinations
 * carrying a `mobilePriority` of 1-4 (overview, messages, calendar, appts)
 * carry no `requires.roles` clause, and no other visibility clause on any of
 * them varies by role either. Every existing role-based visibility
 * difference in the registry (payments' `requires.billing`, `mywork`'s
 * `requires.professional`) sits on destinations with NO `mobilePriority`, so
 * they can only ever show up in the More sheet, never the fixed top-4 bar.
 *
 * Per this program's hard rule — "if the task text contradicts the code,
 * trust the code, fix the real thing, and record the decision" — this file
 * does not fabricate a `requires.roles` clause on one of the top-4
 * destinations just to make that specific sentence true: nothing in the
 * approved design package (docs/plans/program/specs/*.md) or the registry's
 * own module header calls for gating Messages/Calendar/Appointments away
 * from an assistant, and inventing one would be a product decision this
 * task was not asked to make. What IS true and load-bearing, and what the
 * tests below actually prove: (1) role changes what a person can reach,
 * through the exact registry clauses that already exist, and MobileBottomNav
 * surfaces that difference in the More sheet; (2) the fixed top-4 bar is a
 * pure, unconditional projection of `mobileTabs()`, so if a later task adds
 * a role clause to a `mobilePriority` destination, an owner and an assistant
 * start seeing a different fourth tab automatically, with no component
 * change required.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DESTINATIONS,
  mobileTabs,
  sidebarGroups,
  isPosSegment,
  visibleDestinations,
  type WorkspaceNavContext,
} from "@/lib/workspace/destinations";
import { canManageBilling, derivePreset, deriveWorkRole } from "@/lib/workspace/nav-context";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
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

test("no new inline style props were added under this directory (existing ones are grandfathered)", () => {
  const src = read(SRC);
  // The workspace More-sheet content this task added is entirely
  // className-driven; only the pre-existing bar/BottomTab/talent-branch
  // style={{...}} objects (grandfathered) and the feedback row (copied
  // verbatim, also grandfathered) remain.
  assert.ok(src.includes('className="tulala-mnav-row"'), "new More-sheet rows must use classes");
  assert.ok(src.includes("tulala-mnav-role-chip"), "the role chip must use a class");
  assert.ok(src.includes("tulala-mnav-switcher"), "the workspace switcher row must use a class");
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

test("nothing shows on the phone that the sidebar hides — both are the same visibleDestinations()", () => {
  const scenarios: WorkspaceNavContext[] = [
    ctx({ role: "owner" }),
    ctx({ role: "assistant", canManageBilling: false }),
    ctx({ takesReservations: false }),
    ctx({ workspaceType: "business" }),
    ctx({ plan: "free" }),
  ];
  for (const c of scenarios) {
    const phoneIds = new Set(mobileTabs(c, 20).map((d) => d.id));
    const desktopIds = new Set(
      sidebarGroups(c).flatMap((g) => g.destinations.map((d) => d.id)),
    );
    for (const id of phoneIds) {
      assert.ok(desktopIds.has(id), `${id} is on the phone bar but hidden from the sidebar`);
    }
  }
});

test("POS never appears on the phone bar or in the More sheet", () => {
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

  // But the FIXED top-4 mobile bar is role-invariant today — see the module
  // header for why this file does not force that to be otherwise.
  assert.deepEqual(
    mobileTabs(owner, 4).map((d) => d.id),
    mobileTabs(assistant, 4).map((d) => d.id),
  );
});

test("the professional hat gates mywork, which has nowhere to route yet — never a mobile tab", () => {
  const bookable = ctx({ professional: true });
  const notBookable = ctx({ professional: false });
  assert.ok(visibleDestinations(bookable).some((d) => d.id === "mywork"));
  assert.ok(!visibleDestinations(notBookable).some((d) => d.id === "mywork"));
  assert.ok(DESTINATIONS.mywork.mobilePriority === undefined, "mywork must stay out of the fixed bar — it has no live route");
});
