import assert from "node:assert/strict";
import { test } from "node:test";

import { parseOfferingResourceSet } from "./offering-resource-set";

test("empty or missing attributes is an empty set, not a throw", () => {
  assert.deepEqual(parseOfferingResourceSet(null), { companionTalentIds: [], spaceIds: [], spaceId: null });
  assert.deepEqual(parseOfferingResourceSet({}), { companionTalentIds: [], spaceIds: [], spaceId: null });
});

test("couples set keeps two companion ids and the room", () => {
  const t2 = "33330003-0000-4000-8000-000000000002";
  const room = "33330011-0000-4000-8000-000000000002";
  assert.deepEqual(
    parseOfferingResourceSet({
      resourceSet: { companionTalentIds: [t2, t2], spaceId: room },
    }),
    { companionTalentIds: [t2], spaceIds: [room], spaceId: room },
  );
});

test("junk ids are dropped rather than stored", () => {
  assert.deepEqual(
    parseOfferingResourceSet({
      resourceSet: { companionTalentIds: ["nope", ""], spaceId: "room" },
    }),
    { companionTalentIds: [], spaceIds: [], spaceId: null },
  );
});
