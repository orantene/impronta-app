import assert from "node:assert/strict";
import { test } from "node:test";

import { verifiedEmailForGuestClaim } from "./guest-claim-email";

test("Sweep B refuses an unconfirmed account email", () => {
  assert.equal(
    verifiedEmailForGuestClaim({
      email: "prospect@example.com",
      emailConfirmedAt: null,
    }),
    null,
  );
  assert.equal(
    verifiedEmailForGuestClaim({
      email: "prospect@example.com",
      emailConfirmedAt: undefined,
    }),
    null,
  );
});

test("Sweep B accepts only a confirmed session email", () => {
  assert.equal(
    verifiedEmailForGuestClaim({
      email: "prospect@example.com",
      emailConfirmedAt: "2026-08-01T00:00:00Z",
    }),
    "prospect@example.com",
  );
});
