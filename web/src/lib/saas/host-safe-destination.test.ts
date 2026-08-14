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

// ── Talent post-auth default (register ?as=talent) ────────────────────────────
// Regression guard for the host-blind default in (auth)/register/page.tsx: it
// shipped as a bare "/talent/profile/fields", which 404s wherever /talent/* is
// not allow-listed. `defaultTalentNext()` now routes through this helper.
test("talent post-auth default stays relative where /talent/* is served", () => {
  for (const kind of ["app", "agency"]) {
    assert.equal(
      hostSafeDestination("/talent/profile/fields", kind),
      "/talent/profile/fields",
    );
  }
});

test("talent post-auth default crosses to the app host on marketing and hub", () => {
  for (const kind of ["marketing", "hub"]) {
    assert.equal(
      hostSafeDestination("/talent/profile/fields", kind),
      `${APP}/talent/profile/fields`,
    );
  }
});

test("the talent default is NEVER slug-prefixed on agency hosts", () => {
  // /talent/* is deliberately excluded from branded rewriting: /<slug>/talent/*
  // are legacy redirectors that bounce back to /talent/*, so prefixing would
  // create an infinite navigation loop (branded-admin-url.ts). The client
  // default DOES slug-prefix — these two must not be "unified".
  const out = hostSafeDestination("/talent/profile/fields", "agency");
  assert.equal(out, "/talent/profile/fields");
  assert.doesNotMatch(out, /^\/[^/]+\/talent\//);
});
