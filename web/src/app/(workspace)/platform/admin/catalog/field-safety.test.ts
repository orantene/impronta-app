import test from "node:test";
import assert from "node:assert/strict";

import { sanitizePlatformFieldSafety } from "./field-safety";

test("platform field safety allows public surfaces for normal fields", () => {
  assert.deepEqual(
    sanitizePlatformFieldSafety({
      defaultVisibility: ["public", "agency"],
      showInPublic: true,
      showInDirectory: true,
      showInRegistration: true,
      talentEditable: true,
      adminOnly: false,
      sensitive: false,
    }),
    {
      defaultVisibility: ["public", "agency"],
      showInPublic: true,
      showInDirectory: true,
      showInRegistration: true,
      talentEditable: true,
    },
  );
});

test("platform field safety clamps admin-only fields away from public and talent surfaces", () => {
  assert.deepEqual(
    sanitizePlatformFieldSafety({
      defaultVisibility: ["public"],
      showInPublic: true,
      showInDirectory: true,
      showInRegistration: true,
      talentEditable: true,
      adminOnly: true,
      sensitive: false,
    }),
    {
      defaultVisibility: ["agency"],
      showInPublic: false,
      showInDirectory: false,
      showInRegistration: false,
      talentEditable: false,
    },
  );
});

test("platform field safety clamps sensitive fields away from public and talent surfaces", () => {
  assert.deepEqual(
    sanitizePlatformFieldSafety({
      defaultVisibility: ["public", "private"],
      showInPublic: true,
      showInDirectory: true,
      showInRegistration: true,
      talentEditable: true,
      adminOnly: false,
      sensitive: true,
    }),
    {
      defaultVisibility: ["private"],
      showInPublic: false,
      showInDirectory: false,
      showInRegistration: false,
      talentEditable: false,
    },
  );
});
