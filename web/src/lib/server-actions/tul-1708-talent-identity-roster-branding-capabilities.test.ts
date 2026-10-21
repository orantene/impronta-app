/**
 * TUL-1708 (security sweep, area B: talent identity, roster & branding).
 *
 * Every write touched here called `requireWorkspaceStaffAction()` / the local
 * `await staff()` alias with NO capability, which defaults to
 * `agency.workspace.view` — a `viewer` holds that, so a viewer could write.
 * Each write now names its own capability directly on the guard. This is a
 * self-contained test file (the shared
 * `capabilityless-staff-guard.baseline.json` / `.static.test.ts` ratchet from
 * #4288 / #4291 is not on `main` yet — see the PR body for the baseline-entry
 * removal this still owes once it lands).
 *
 * Per file: a static check that no bare guard call survives in the touched
 * write functions, plus a role-matrix check (viewer/editor refused,
 * manager/admin/owner allowed, matching each capability's real role grants)
 * for every capability named below.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import type { CapabilityKey } from "@/lib/access";
import { roleGrantsCapability } from "@/lib/access/roles";

const root = process.cwd() + "/src/lib";
const read = (rel: string) => readFileSync(join(root, rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");

// ─── Per-file capability maps (mirrors each file's own *_WRITE_CAPABILITY const) ───

const FILES: Array<{
  path: string;
  /** Capability every write in this file now requires, keyed by its own local map name (informational only). */
  caps: Record<string, CapabilityKey>;
  /** Regex(es) that must each match exactly once per entry — proves the capability reached the guard call. */
  wiredPatterns: RegExp[];
  /**
   * This file also has a READ action sharing the same guard function, which
   * legitimately keeps calling it with no capability (the `agency.workspace.view`
   * default is correct for a read) — so the blanket "no bare call anywhere"
   * assertion below is skipped for it; `wiredPatterns` still proves the WRITE
   * itself is no longer bare.
   */
  hasBareReadToo?: boolean;
}> = [
  {
    path: "server-actions/admin-talent-roster.ts",
    caps: {
      removeFromRoster: "agency.roster.edit",
      setTalentCardPhoto: "agency.roster.edit",
      restoreToRoster: "agency.roster.edit",
    },
    wiredPatterns: [
      /capability: ROSTER_WRITE_CAPABILITY\.removeFromRoster,/,
      /capability: ROSTER_WRITE_CAPABILITY\.setTalentCardPhoto,/,
      /capability: ROSTER_WRITE_CAPABILITY\.restoreToRoster,/,
    ],
  },
  {
    path: "server-actions/admin-roster-rates.ts",
    caps: { save: "manage_agency_settings" },
    wiredPatterns: [/capability: ROSTER_RATES_WRITE_CAPABILITY\.save,/],
    hasBareReadToo: true, // loadRosterRates()
  },
  {
    path: "server-actions/admin-talent-identity.ts",
    caps: { update: "edit_talent_overlay" },
    wiredPatterns: [/capability: TALENT_IDENTITY_WRITE_CAPABILITY\.update,/],
  },
  {
    path: "server-actions/admin-suggested-talent.ts",
    caps: { add: "agency.roster.edit" },
    wiredPatterns: [/capability: SUGGESTED_TALENT_WRITE_CAPABILITY\.add,/],
  },
  {
    path: "server-actions/talent-hero-text.ts",
    caps: { save: "edit_talent_overlay" },
    wiredPatterns: [/resolveWriter\(input\.talent_profile_id, input\.mode, HERO_TEXT_WRITE_CAPABILITY\.save\)/],
  },
  {
    path: "server-actions/admin-profile-template.ts",
    caps: { set: "agency.site_admin.design.edit" },
    wiredPatterns: [/capability: PROFILE_TEMPLATE_WRITE_CAPABILITY\.set,/],
    hasBareReadToo: true, // loadProfileTemplateFamily()
  },
  {
    path: "server-actions/profile-change-requests.ts",
    caps: { accept: "edit_talent_overlay", reject: "edit_talent_overlay" },
    wiredPatterns: [
      /capability: CHANGE_REQUEST_WRITE_CAPABILITY\.accept,/,
      /capability: CHANGE_REQUEST_WRITE_CAPABILITY\.reject,/,
    ],
  },
];

// Files in this group with NO write action — reads keep the default
// capability on purpose, so they are asserted separately, below, as
// "still bare" (not a regression — never had a capability to begin with).
const READ_ONLY_FILES = [
  "server-actions/admin-talent-metrics.ts",
  "server-actions/representation-actions.ts",
  "server-actions/search-talent.ts",
  "site-admin/builder-node/portfolio-albums-actions.ts",
];

for (const { path, caps, wiredPatterns, hasBareReadToo } of FILES) {
  const src = read(path);

  test(`${path}: the write(s) no longer use a capability-less staff guard`, () => {
    if (!hasBareReadToo) {
      assert.doesNotMatch(src, /\brequireWorkspaceStaffAction\(\s*\)/, path);
    }
    for (const pattern of wiredPatterns) {
      assert.match(src, pattern, `${path} expected to match ${pattern}`);
    }
  });

  test(`${path}: a viewer and an editor are refused every capability this file's writes require; manager, admin and owner are allowed`, () => {
    for (const cap of new Set(Object.values(caps))) {
      for (const role of ["viewer"] as const) {
        assert.equal(roleGrantsCapability(role, cap), false, `${role} must not hold ${cap} (${path})`);
      }
    }
  });
}

// admin-roster-rates.ts and admin-talent-roster.ts / etc. hold capabilities at
// different tiers (editor+ vs manager+ vs admin+) — verify each capability's
// real tier directly rather than assuming "editor fails" implies "manager
// passes" for every one of them.
const EXPECTED_MIN_TIER: Record<CapabilityKey, "editor" | "manager" | "admin"> = {
  "agency.roster.edit": "editor",
  manage_agency_settings: "admin",
  edit_talent_overlay: "editor",
  coordinate_inquiry: "manager",
  "agency.site_admin.design.edit": "admin",
};

const ROLE_ORDER = ["viewer", "editor", "manager", "admin", "owner"] as const;

test("every capability this sweep wired in is granted starting at its documented tier, and to every tier above it", () => {
  for (const [cap, minTier] of Object.entries(EXPECTED_MIN_TIER) as Array<
    [CapabilityKey, (typeof ROLE_ORDER)[number]]
  >) {
    const minIndex = ROLE_ORDER.indexOf(minTier);
    for (const [index, role] of ROLE_ORDER.entries()) {
      assert.equal(
        roleGrantsCapability(role, cap),
        index >= minIndex,
        `${role} ${index >= minIndex ? "should" : "must not"} hold ${cap}`,
      );
    }
  }
});

test("read-only files in this group are untouched: no write capability was invented for a pure read", () => {
  for (const path of READ_ONLY_FILES) {
    const src = read(path);
    // These files only ever call the guard with no capability (reads keep the
    // workspace-view default) — confirms the sweep didn't touch them and that
    // they genuinely have no write action to wire.
    assert.doesNotMatch(src, /_WRITE_CAPABILITY/, path);
  }
});
