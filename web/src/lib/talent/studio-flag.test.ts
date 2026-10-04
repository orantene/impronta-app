import assert from "node:assert/strict";
import { test } from "node:test";

import { talentStudioV2Enabled } from "./studio-flag";

test("unset → OFF even when NODE_ENV=development", () => {
  assert.equal(
    talentStudioV2Enabled({ NODE_ENV: "development" }),
    false,
  );
});

test("unset → OFF in production", () => {
  assert.equal(
    talentStudioV2Enabled({ NODE_ENV: "production" }),
    false,
  );
});

test("explicit 1/true/on → ON", () => {
  for (const v of ["1", "true", "ON", " True "]) {
    assert.equal(
      talentStudioV2Enabled({ TALENT_STUDIO_V2: v, NODE_ENV: "production" }),
      true,
      v,
    );
  }
});

test("explicit 0/false/off → OFF", () => {
  for (const v of ["0", "false", "off", " False "]) {
    assert.equal(
      talentStudioV2Enabled({ TALENT_STUDIO_V2: v, NODE_ENV: "development" }),
      false,
      v,
    );
  }
});
