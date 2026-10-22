/**
 * TUL-1708 (area H leftover) / TUL-1727: `authorizeForTalent`
 * (offerings-auth.server.ts) is the shared staff-path guard for every
 * talent-offerings reader and writer. Its staff branch called
 * `requireWorkspaceStaffAction()` with no capability, which defaults to
 * `agency.workspace.view` — a capability every active member, including
 * `viewer`, holds. A viewer-tier staff member could therefore write a
 * rostered talent's services, booking rules, variants, photos, and legacy
 * import through the 7 writing callers below.
 *
 * `authorizeForTalent` now takes an optional `capability` second argument,
 * forwarded to `requireWorkspaceStaffAction({ capability })`. Every WRITING
 * caller must pass `"agency.roster.edit"` (the capability already gating
 * this exact roster-drawer surface elsewhere, per #4324/#4327 precedent).
 * Every READING caller must keep the bare call (no capability) so the
 * default is unchanged and no reader is mis-gated.
 *
 * Source half: pins the call site inside each function body (cheaper and
 * more precise than mocking the Supabase/session chain for an end-to-end
 * run). Unit half: `roleGrantsCapability` proves the capability's real tier.
 *
 * Run: cd web && npm run test:wt -- src/lib/talent/offerings-auth-staff-capabilities.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { TENANT_ROLE_KEYS, roleGrantsCapability } from "@/lib/access/roles";

const HERE = dirname(fileURLToPath(import.meta.url));
const read = (f: string) => readFileSync(join(HERE, f), "utf8");

/** Body of one exported async function, up to the next top-level export. */
function exported(src: string, name: string): string {
  const start = src.indexOf(`export async function ${name}(`);
  assert.ok(start >= 0, `${name} must exist`);
  const next = src.indexOf("\nexport ", start + 10);
  return src.slice(start, next < 0 ? undefined : next);
}

const WRITE_CAP = "agency.roster.edit";

// ─── The guard itself takes an optional capability and forwards it ─────────

test("authorizeForTalent takes an optional capability and forwards it to the staff guard", () => {
  const src = read("offerings-auth.server.ts");
  assert.match(
    src,
    /export async function authorizeForTalent\(\s*talentProfileId: string,\s*capability\?: CapabilityKey,?\s*\)/,
  );
  assert.match(
    src,
    /requireWorkspaceStaffAction\(capability \? \{ capability \} : undefined\)/,
  );
});

// ─── Writers: every call site passes "agency.roster.edit" ──────────────────

const WRITERS: { file: string; fn: string }[] = [
  { file: "offering-booking-rules-action.ts", fn: "patchOfferingBookingRules" },
  { file: "offering-variants-actions.ts", fn: "setOfferingVariants" },
  { file: "offerings-actions.ts", fn: "upsertTalentOffering" },
  { file: "offerings-actions.ts", fn: "deleteTalentOffering" },
  { file: "offerings-actions.ts", fn: "deleteTalentOfferingForever" },
  { file: "offerings-actions.ts", fn: "reorderTalentOfferings" },
  { file: "offerings-actions.ts", fn: "setOfferingImages" },
  { file: "offerings-actions.ts", fn: "setOfferingOptions" },
  { file: "offerings-actions.ts", fn: "importLegacyToOfferings" },
];

for (const { file, fn } of WRITERS) {
  test(`WRITE ${file}:${fn} passes "${WRITE_CAP}" to authorizeForTalent`, () => {
    const body = exported(read(file), fn);
    assert.match(
      body,
      new RegExp(`authorizeForTalent\\(talentProfileId, "${WRITE_CAP}"\\)`),
      `${fn} must call authorizeForTalent(talentProfileId, "${WRITE_CAP}")`,
    );
  });
}

// ─── Readers: left on the bare call (no capability — the default) ──────────

const READERS: { file: string; fn: string }[] = [
  { file: "offerings-actions.ts", fn: "loadTalentOfferingsForEditor" },
  { file: "offerings-actions.ts", fn: "listTalentPortfolioPhotos" },
  { file: "instant-plan-entitlement-action.ts", fn: "loadInstantPlanEntitlement" },
];

for (const { file, fn } of READERS) {
  test(`READ ${file}:${fn} keeps the bare authorizeForTalent(talentProfileId) call`, () => {
    const body = exported(read(file), fn);
    assert.match(
      body,
      /authorizeForTalent\(talentProfileId\)/,
      `${fn} must call the bare authorizeForTalent(talentProfileId) (no capability — stays on the viewer-held default)`,
    );
    assert.doesNotMatch(
      body,
      /authorizeForTalent\(talentProfileId,/,
      `${fn} is a read and must not gain a capability argument`,
    );
  });
}

// ─── Role matrix: agency.roster.edit is editor-tier and up ─────────────────

test(`role matrix: "${WRITE_CAP}" — viewer refused, editor/manager/admin/owner allowed`, () => {
  const expectedAllowed: Record<string, boolean> = {
    viewer: false,
    editor: true,
    manager: true,
    admin: true,
    owner: true,
  };
  for (const role of TENANT_ROLE_KEYS) {
    assert.equal(
      roleGrantsCapability(role, WRITE_CAP),
      expectedAllowed[role],
      `${role} -> ${WRITE_CAP}`,
    );
  }
});

test("a viewer does not hold agency.roster.edit (the bug this fixes)", () => {
  assert.equal(roleGrantsCapability("viewer", WRITE_CAP), false);
  // ...but every viewer-tier active member does hold the old, too-loose default.
  assert.equal(roleGrantsCapability("viewer", "agency.workspace.view"), true);
});
