/**
 * FORMS-2b — talent-picker → inquiryTargetTalentId persistence tests.
 *
 * The contact_form inspector reuses the shared (code-keyed) TalentPicker but
 * persists a single talent UUID. These tests pin the pure id↔code translation
 * that makes that safe: a confirmed profile_code is mapped to the talent's id
 * before persistence (never a raw code), an empty confirmation clears the
 * target, and the saved id round-trips back to the picker's seed code.
 *
 * Run: npx tsx --test src/lib/site-admin/sections/contact_form/inquiry-target.test.ts
 */

import { strict as assert } from "node:assert";
import { describe, it } from "node:test";

import {
  buildIdentityMaps,
  pickTargetIdFromConfirmedCodes,
  seedCodesForTargetId,
  type TalentIdentity,
} from "./inquiry-target";

const ALICE: TalentIdentity = {
  id: "11111111-1111-4111-8111-111111111111",
  profileCode: "TAL-1001",
};
const BOB: TalentIdentity = {
  id: "22222222-2222-4222-8222-222222222222",
  profileCode: "TAL-1002",
};

describe("buildIdentityMaps", () => {
  it("builds bidirectional code↔id maps", () => {
    const { byCode, byId } = buildIdentityMaps([ALICE, BOB]);
    assert.equal(byCode.get("TAL-1001"), ALICE.id);
    assert.equal(byCode.get("TAL-1002"), BOB.id);
    assert.equal(byId.get(ALICE.id), "TAL-1001");
    assert.equal(byId.get(BOB.id), "TAL-1002");
  });

  it("skips hits missing an id or code", () => {
    const { byCode, byId } = buildIdentityMaps([
      ALICE,
      { id: "", profileCode: "TAL-X" },
      { id: "33333333-3333-4333-8333-333333333333", profileCode: "" },
    ]);
    assert.equal(byCode.size, 1);
    assert.equal(byId.size, 1);
    assert.equal(byCode.get("TAL-1001"), ALICE.id);
  });
});

describe("pickTargetIdFromConfirmedCodes — picker → persisted id", () => {
  it("maps the single confirmed code to its talent id (the value we persist)", () => {
    const { byCode } = buildIdentityMaps([ALICE, BOB]);
    const id = pickTargetIdFromConfirmedCodes(["TAL-1002"], byCode);
    // Persisted value is the UUID, never the profile_code.
    assert.equal(id, BOB.id);
  });

  it("clears the target when nothing is picked (empty confirmation)", () => {
    const { byCode } = buildIdentityMaps([ALICE]);
    assert.equal(pickTargetIdFromConfirmedCodes([], byCode), undefined);
  });

  it("ignores blank codes and resolves the first real one", () => {
    const { byCode } = buildIdentityMaps([ALICE]);
    assert.equal(
      pickTargetIdFromConfirmedCodes(["", "  ", "TAL-1001"], byCode),
      ALICE.id,
    );
  });

  it("returns undefined for an unknown code rather than persisting the code", () => {
    const { byCode } = buildIdentityMaps([ALICE]);
    // Defensive: a code with no id mapping must never be persisted as the id.
    assert.equal(
      pickTargetIdFromConfirmedCodes(["TAL-NOPE"], byCode),
      undefined,
    );
  });

  it("only honors the first pick (single-select picker contract)", () => {
    const { byCode } = buildIdentityMaps([ALICE, BOB]);
    assert.equal(
      pickTargetIdFromConfirmedCodes(["TAL-1001", "TAL-1002"], byCode),
      ALICE.id,
    );
  });
});

describe("seedCodesForTargetId — persisted id → picker seed", () => {
  it("round-trips a saved id back to its profile_code for the picker seed", () => {
    const { byId } = buildIdentityMaps([ALICE, BOB]);
    assert.deepEqual(seedCodesForTargetId(BOB.id, byId), ["TAL-1002"]);
  });

  it("seeds empty when there is no target", () => {
    const { byId } = buildIdentityMaps([ALICE]);
    assert.deepEqual(seedCodesForTargetId(undefined, byId), []);
  });

  it("seeds empty for an unresolvable id (off-roster) rather than a bogus code", () => {
    const { byId } = buildIdentityMaps([ALICE]);
    assert.deepEqual(
      seedCodesForTargetId("99999999-9999-4999-8999-999999999999", byId),
      [],
    );
  });

  it("full round-trip: confirm a code → persist id → re-seed the same code", () => {
    const { byCode, byId } = buildIdentityMaps([ALICE, BOB]);
    const persisted = pickTargetIdFromConfirmedCodes(["TAL-1001"], byCode);
    assert.equal(persisted, ALICE.id);
    assert.deepEqual(seedCodesForTargetId(persisted, byId), ["TAL-1001"]);
  });
});
