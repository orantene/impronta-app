import assert from "node:assert/strict";
import test from "node:test";

import { dockViewerCtaIdentity, dockViewerIdentityTier } from "./dock-viewer-identity";

test("anonymous visitor stays guest", () => {
  assert.equal(
    dockViewerIdentityTier({ hasUser: false, appRole: null, accountStatus: null }),
    "guest",
  );
});

test("active client session is account (hides claim banner)", () => {
  assert.equal(
    dockViewerIdentityTier({ hasUser: true, appRole: "client", accountStatus: "active" }),
    "account",
  );
  assert.equal(
    dockViewerIdentityTier({ hasUser: true, appRole: null, accountStatus: "active" }),
    "account",
  );
});

test("password/Google client without active status is email_verified, not guest", () => {
  assert.equal(
    dockViewerIdentityTier({ hasUser: true, appRole: "client", accountStatus: "onboarding" }),
    "email_verified",
  );
  assert.equal(
    dockViewerIdentityTier({ hasUser: true, appRole: "client", accountStatus: null }),
    "email_verified",
  );
});

test("talent/staff/platform sessions stay guest for the client dock", () => {
  for (const role of ["talent", "agency_staff", "super_admin"] as const) {
    assert.equal(
      dockViewerIdentityTier({ hasUser: true, appRole: role, accountStatus: "active" }),
      "guest",
      role,
    );
  }
});

test("cta identity follows signed-in client tiers", () => {
  assert.equal(dockViewerCtaIdentity("guest"), "guest");
  assert.equal(dockViewerCtaIdentity("identified"), "guest");
  assert.equal(dockViewerCtaIdentity("email_verified"), "client");
  assert.equal(dockViewerCtaIdentity("account"), "client");
});
