/**
 * TUL-691: after claiming, a client lands on /client, and /client never dead-ends
 * (no marketing bounce, no role picker) for a client with claimed history.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { CLIENT_CLAIM_LANDING, clientRootFallback } from "./claim-landing";

test("the claim landing is /client", () => {
  assert.equal(CLIENT_CLAIM_LANDING, "/client");
});

test("a claimed client with no agency relationship gets the account area, not the marketing apex", () => {
  assert.equal(
    clientRootFallback({ hasClientProfile: true, appRole: "client", accountStatus: "active", accountAreaOn: true }),
    "account",
  );
});

test("an active client without a client profile row still gets the account area, never /onboarding/role", () => {
  assert.equal(
    clientRootFallback({ hasClientProfile: false, appRole: "client", accountStatus: "active", accountAreaOn: true }),
    "account",
  );
});

test("account area off on this host keeps the old discovery bounce for clients", () => {
  assert.equal(
    clientRootFallback({ hasClientProfile: true, appRole: "client", accountStatus: "active", accountAreaOn: false }),
    "discover",
  );
});

test("a user who is not a client and has no profile still picks a role", () => {
  assert.equal(
    clientRootFallback({ hasClientProfile: false, appRole: null, accountStatus: "onboarding", accountAreaOn: true }),
    "onboarding",
  );
  assert.equal(
    clientRootFallback({ hasClientProfile: false, appRole: "talent", accountStatus: "active", accountAreaOn: true }),
    "onboarding",
  );
});
