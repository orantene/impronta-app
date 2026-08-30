import assert from "node:assert/strict";
import { test } from "node:test";

import { verifiedEmailForGuestClaim } from "./guest-claim-email";
import { guestTicketMatchesClaim } from "./guest-claim-match";

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

test("talent or operator sign-in claims a matching guest ticket (role is not a gate)", () => {
  const ticket = {
    requesterUserId: null,
    guestSessionId: null,
    surface: "guest",
    contactEmail: "operator@example.com",
  };
  const verified = verifiedEmailForGuestClaim({
    email: "operator@example.com",
    emailConfirmedAt: "2026-08-01T00:00:00Z",
  });
  assert.equal(
    guestTicketMatchesClaim(ticket, { guestSessionId: null, verifiedEmail: verified }),
    true,
  );
  assert.equal(
    guestTicketMatchesClaim(ticket, {
      guestSessionId: null,
      verifiedEmail: verifiedEmailForGuestClaim({
        email: "operator@example.com",
        emailConfirmedAt: null,
      }),
    }),
    false,
  );
});
