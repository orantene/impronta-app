import test from "node:test";
import assert from "node:assert/strict";

import { isPathAllowedForHostKind } from "./surface-allow-list";

// TUL-697: the guest dock asks /api/client/account who is signed in. Public
// workspace sites (/w/<slug> on marketing and hub hosts) must reach it.
for (const kind of ["marketing", "hub", "agency", "app"] as const) {
  test(`TUL-697: ${kind} reaches /api/client/account`, () => {
    assert.equal(isPathAllowedForHostKind(kind, "/api/client/account"), true);
  });
}

test("TUL-697: path-based /w/<slug>/api/... is never an API path on any host", () => {
  for (const kind of ["marketing", "hub", "agency", "app"] as const) {
    assert.equal(isPathAllowedForHostKind(kind, "/w/x/api/client/account"), false);
  }
});

test("TUL-697: marketing and hub do not gain the rest of /api/client", () => {
  for (const kind of ["marketing", "hub"] as const) {
    for (const p of ["/api/client", "/api/client/bookings", "/api/client/inquiry-details", "/api/client/pitches/count", "/api/client/booking-prefill", "/api/client/accounts"]) {
      assert.equal(isPathAllowedForHostKind(kind, p), false, `${kind} must 404 ${p}`);
    }
  }
});
