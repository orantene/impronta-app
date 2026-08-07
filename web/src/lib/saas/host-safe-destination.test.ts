import test from "node:test";
import assert from "node:assert/strict";
import { hostSafeDestination } from "@/lib/saas/host-safe-destination";
import { getAppUrl } from "@/lib/auth-flow";

const APP = getAppUrl();

test("workspace destinations stay relative on surfaces that serve them", () => {
  for (const kind of ["app", "agency"]) {
    assert.equal(hostSafeDestination("/admin", kind), "/admin");
    assert.equal(hostSafeDestination("/client", kind), "/client");
    assert.equal(hostSafeDestination("/onboarding/role", kind), "/onboarding/role");
  }
});

test("workspace destinations cross to the app host on marketing and hub", () => {
  assert.equal(hostSafeDestination("/onboarding/role", "marketing"), `${APP}/onboarding/role`);
  assert.equal(hostSafeDestination("/client", "marketing"), `${APP}/client`);
  assert.equal(hostSafeDestination("/onboarding/role", "hub"), `${APP}/onboarding/role`);
});

test("the query string rides along and is not part of the allow-list check", () => {
  assert.equal(
    hostSafeDestination("/onboarding/workspace?lead=abc-123", "marketing"),
    `${APP}/onboarding/workspace?lead=abc-123`,
  );
  assert.equal(
    hostSafeDestination("/onboarding/workspace?lead=abc-123", "app"),
    "/onboarding/workspace?lead=abc-123",
  );
});

test("destinations the surface already serves are untouched", () => {
  assert.equal(hostSafeDestination("/get-started", "marketing"), "/get-started");
  assert.equal(hostSafeDestination("/login", "marketing"), "/login");
  assert.equal(hostSafeDestination("/", "marketing"), "/");
});

test("unknown host kinds and absolute destinations are left alone", () => {
  assert.equal(hostSafeDestination("/client", null), "/client");
  assert.equal(hostSafeDestination("/client", "unknown"), "/client");
  assert.equal(hostSafeDestination("/client", "talent_site"), "/client");
  assert.equal(
    hostSafeDestination("https://app.example.com/client", "marketing"),
    "https://app.example.com/client",
  );
  // Protocol-relative is never rewritten into an app-host URL.
  assert.equal(hostSafeDestination("//evil.example/admin", "marketing"), "//evil.example/admin");
});
