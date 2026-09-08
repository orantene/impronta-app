import { test } from "node:test";
import assert from "node:assert/strict";
import {
  fixtureFor,
  fixtureReady,
  JOURNEYS_TENANT_ID,
  JOURNEYS_TENANT_SLUG,
  REPRESENTATIVE_CASE_IDS,
  REPRESENTATIVE_FIXTURES,
} from "./journeys-fixture";

test("ten representatives, one descriptor each", () => {
  assert.equal(REPRESENTATIVE_CASE_IDS.length, 10);
  assert.equal(REPRESENTATIVE_FIXTURES.length, 10);
  const ids = new Set(REPRESENTATIVE_FIXTURES.map((f) => f.caseId));
  assert.equal(ids.size, 10);
});

test("a restaurant fixture is not ready without spaces", () => {
  const need = fixtureFor("C06").needs;
  assert.equal(
    fixtureReady(
      {
        tenantId: JOURNEYS_TENANT_ID,
        slug: JOURNEYS_TENANT_SLUG,
        host: "qa-journeys.local",
        staffUserIds: ["s1"],
        offeringIds: ["o1"],
        spaceIds: [],
        sessionIds: [],
      },
      need,
    ),
    false,
  );
});

test("the yoga fixture needs sessions; the nail salon does not", () => {
  assert.equal(fixtureFor("C09").needs.sessions, true);
  assert.equal(fixtureFor("C01").needs.sessions, false);
});

test("Impronta is never the fixture tenant", () => {
  assert.notEqual(JOURNEYS_TENANT_SLUG, "impronta");
  assert.notEqual(JOURNEYS_TENANT_ID, "00000000-0000-0000-0000-000000000001");
});
