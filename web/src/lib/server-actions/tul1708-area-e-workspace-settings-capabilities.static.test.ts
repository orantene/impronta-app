/**
 * TUL-1708 (area E: workspace taxonomy, fields & team settings).
 *
 * `requireWorkspaceStaffAction()` with no capability defaults to `agency.workspace.view`, which a
 * `viewer` holds. Six writers across these files called it bare, so a viewer could change taxonomy,
 * field privacy/catalog settings, industry presets, team membership, and a talent's bookable flag.
 * This is a self-contained check (the repo-wide capability-less-guard ratchet from TUL-1629 isn't on
 * `main` yet, so this file does not depend on it and does not touch `capabilityless-staff-guard.*`):
 *
 *  - every WRITE in the five files below now passes the capability it needs into the guard;
 *  - every READ (and admin-scope.ts's two generic, cross-area staff-identity helpers) is still on the
 *    viewer default, and this file pins that list by name so a future writer added to the bare-guard
 *    side fails loudly instead of silently inheriting the viewer default;
 *  - on the role matrix, a viewer is refused every capability these writers now require, while the
 *    tier that actually owns the action (editor for the roster toggle, admin for everything else) and
 *    owner are allowed.
 *
 * `src/lib/saas/admin-scope.ts` is deliberately NOT touched: its two bare calls
 * (`requireWorkspaceStaffActionOnce`, and the identity resolver inside `requireInquiryManagerAction`)
 * are shared infrastructure used by many areas outside this sweep, both for reads and for writes whose
 * OWN capability check happens in the caller. Narrowing them is not a single-action fix.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { roleGrantsCapability } from "@/lib/access/roles";

const WEB_ROOT = join(__dirname, "..", "..", "..");

const BARE_GUARD = /requireWorkspaceStaffAction\(\s*\)/;
const CAP_GUARD = /requireWorkspaceStaffAction\(\{\s*capability:\s*"([^"]+)"\s*\}\)/;

/** Pulls out `functionName -> source between this function and the next top-level function`. */
function splitFunctions(src: string): Map<string, string> {
  const re = /(?:export\s+)?async function (\w+)/g;
  const starts: { name: string; at: number }[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(src))) starts.push({ name: m[1]!, at: m.index });
  const out = new Map<string, string>();
  starts.forEach((s, i) => {
    const end = i + 1 < starts.length ? starts[i + 1]!.at : src.length;
    out.set(s.name, src.slice(s.at, end));
  });
  return out;
}

function readSrc(relPath: string): string {
  return readFileSync(join(WEB_ROOT, "src", relPath), "utf8");
}

type FileSpec = {
  path: string;
  /** Functions that must keep the bare, capability-less guard (reads, or sanctioned internal helpers). */
  reads: string[];
  /** Function -> the capability its guard call must now pass. */
  writes: Record<string, string>;
};

const FILES: FileSpec[] = [
  {
    path: "lib/server-actions/admin-taxonomy.ts",
    reads: ["getEnabledTaxonomyTree", "getCategoryDetail", "getFieldsForTalent"],
    writes: {
      setTaxonomyEnabled: "manage_field_catalog",
      setTaxonomyFlags: "manage_field_catalog",
      addCustomSubType: "manage_field_catalog",
      removeCustomSubType: "manage_field_catalog",
    },
  },
  {
    path: "lib/server-actions/admin-workspace-field-settings.ts",
    reads: ["getFieldPrivacyCatalog", "getWorkspaceFieldSettings", "getWorkspaceFieldCatalog"],
    writes: {
      setWorkspaceFieldVisibility: "manage_field_catalog",
      resetWorkspaceFieldVisibility: "manage_field_catalog",
      setWorkspaceFieldCatalog: "manage_field_catalog",
      setWorkspaceFieldGroup: "manage_field_catalog",
    },
  },
  {
    path: "lib/server-actions/industry-settings.ts",
    reads: ["loadIndustrySettings"],
    writes: {
      setIndustryPreset: "manage_agency_settings",
      setBusinessType: "manage_agency_settings",
      setWordOverride: "manage_agency_settings",
    },
  },
  {
    path: "lib/server-actions/team-management.ts",
    reads: [],
    writes: {
      inviteTeamMember: "manage_memberships",
      promoteRosterTalentToAdmin: "manage_memberships",
      setDefaultCoordinator: "manage_memberships",
      removeTeamMember: "manage_memberships",
      changeTeamMemberRole: "manage_memberships",
      setInquiryCoordinatorTalent: "manage_memberships",
    },
  },
  {
    path: "app/(workspace)/[tenantSlug]/admin/people/people-actions.ts",
    // setPersonPublicProfile already passed `agency.roster.edit` before this sweep; included here as a
    // write so the "every write has its capability" assertion below also re-proves it didn't regress.
    reads: ["loadWhoPerforms", "seatCheck", "revalidatePeople"],
    writes: {
      setPersonBookable: "agency.roster.edit",
      setPersonPublicProfile: "agency.roster.edit",
    },
  },
];

for (const file of FILES) {
  test(`${file.path}: every write passes its capability, every read stays on the viewer default`, () => {
    const src = readSrc(file.path);
    const fns = splitFunctions(src);

    for (const [name, cap] of Object.entries(file.writes)) {
      const body = fns.get(name);
      assert.ok(body, `${file.path}: could not find function ${name}`);
      const capMatch = body!.match(CAP_GUARD);
      assert.ok(
        capMatch,
        `${file.path}: ${name} must call requireWorkspaceStaffAction({ capability: "..." }); a bare guard lets a viewer write`,
      );
      assert.equal(capMatch![1], cap, `${file.path}: ${name} must require "${cap}", not "${capMatch![1]}"`);
      assert.doesNotMatch(
        body!,
        BARE_GUARD,
        `${file.path}: ${name} must not ALSO call the bare guard`,
      );
    }

    for (const name of file.reads) {
      const body = fns.get(name);
      assert.ok(body, `${file.path}: could not find function ${name}`);
      assert.match(
        body!,
        BARE_GUARD,
        `${file.path}: ${name} is pinned as a read on the viewer default; if it now writes, give it a capability and move it out of this file's "reads" list`,
      );
    }
  });
}

test("admin-scope.ts: the two generic staff-identity helpers are untouched (shared across many non-area-E callers)", () => {
  const src = readSrc("lib/saas/admin-scope.ts");
  const bareCount = [...src.matchAll(new RegExp(BARE_GUARD, "g"))].length;
  // main narrowed one of the two (batch 5+6+7, #4299); one generic bare helper is left.
  assert.equal(bareCount, 1, "admin-scope.ts's bare-guard count changed; re-check whether this sweep still leaves it alone");
});

test("role matrix: viewer is refused every TUL-1708 area-E capability; owner is allowed every one", () => {
  const required = new Set<string>();
  for (const file of FILES) for (const cap of Object.values(file.writes)) required.add(cap);
  assert.deepEqual([...required].sort(), ["agency.roster.edit", "manage_agency_settings", "manage_field_catalog", "manage_memberships"]);

  for (const cap of required) {
    assert.equal(roleGrantsCapability("viewer", cap as never), false, `viewer must NOT hold ${cap}`);
    assert.equal(roleGrantsCapability("owner", cap as never), true, `owner must hold ${cap}`);
  }
});

test("role matrix: agency.roster.edit (editor+) vs the admin-tier config capabilities", () => {
  // setPersonBookable / setPersonPublicProfile: roster edits are editor-tier today (EDITOR_CAPS).
  assert.equal(roleGrantsCapability("editor", "agency.roster.edit"), true, "editor must hold agency.roster.edit");
  assert.equal(roleGrantsCapability("viewer", "agency.roster.edit"), false);

  // Taxonomy / field catalog / industry settings / team membership are workspace-configuration-tier:
  // admin (and owner) hold them, editor and manager do not (ADMIN_CAPS).
  for (const cap of ["manage_field_catalog", "manage_agency_settings", "manage_memberships"]) {
    assert.equal(roleGrantsCapability("admin", cap as never), true, `admin must hold ${cap}`);
    assert.equal(roleGrantsCapability("manager", cap as never), false, `manager must NOT hold ${cap} (admin-tier)`);
    assert.equal(roleGrantsCapability("editor", cap as never), false, `editor must NOT hold ${cap} (admin-tier)`);
  }

  assert.equal(roleGrantsCapability("viewer", "agency.workspace.view"), true, "the viewer default still reads");
});
