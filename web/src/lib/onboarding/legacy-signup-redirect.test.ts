import assert from "node:assert/strict";
import test from "node:test";

import { buildStartUrl, legacySignupRedirect, type LegacySignupInput } from "./legacy-signup-redirect";

const base: LegacySignupInput = {
  flagOn: true,
  surface: "register",
  siteUrl: "https://tulala.digital",
  lang: "es",
  hostKind: "app",
};

test("plain pro signup on /register goes to /start with the language", () => {
  assert.equal(legacySignupRedirect(base), "https://tulala.digital/start?lang=es");
  assert.equal(
    legacySignupRedirect({ ...base, lang: "en", intent: null }),
    "https://tulala.digital/start?lang=en",
  );
});

test("talent intent and talent next carry choice=myself", () => {
  assert.equal(
    legacySignupRedirect({ ...base, intent: "talent" }),
    "https://tulala.digital/start?choice=myself&lang=es",
  );
  assert.equal(
    legacySignupRedirect({ ...base, next: "/talent/profile/fields", nextIsTalentSignup: true }),
    "https://tulala.digital/start?choice=myself&lang=es",
  );
});

test("role page: no next is a plain pro, talent next is myself", () => {
  assert.equal(
    legacySignupRedirect({ ...base, surface: "role" }),
    "https://tulala.digital/start?lang=es",
  );
  assert.equal(
    legacySignupRedirect({ ...base, surface: "role", next: "/talent/today", nextIsTalentSignup: true }),
    "https://tulala.digital/start?choice=myself&lang=es",
  );
});

test("client next and client intent keep the old pages", () => {
  assert.equal(legacySignupRedirect({ ...base, surface: "role", next: "/client", nextIsTalentSignup: false }), null);
  assert.equal(legacySignupRedirect({ ...base, intent: "client" }), null);
  assert.equal(legacySignupRedirect({ ...base, next: "/client" }), null);
});

test("claim, workspace lead, operator and roster-invite next are never redirected", () => {
  assert.equal(legacySignupRedirect({ ...base, hasClaimInvite: true }), null);
  assert.equal(legacySignupRedirect({ ...base, hasWorkspaceLead: true }), null);
  assert.equal(legacySignupRedirect({ ...base, intent: "operator" }), null);
  assert.equal(legacySignupRedirect({ ...base, next: "/invite/abc123" }), null);
  assert.equal(legacySignupRedirect({ ...base, surface: "role", next: "/claim?invitation=x" }), null);
});

test("flag off keeps the old page", () => {
  assert.equal(legacySignupRedirect({ ...base, flagOn: false }), null);
  assert.equal(legacySignupRedirect({ ...base, flagOn: false, surface: "role" }), null);
});

test("a whitelabel agency host keeps its own signup", () => {
  assert.equal(legacySignupRedirect({ ...base, hostKind: "agency" }), null);
  assert.equal(legacySignupRedirect({ ...base, hostKind: "hub" }), null);
  assert.equal(
    legacySignupRedirect({ ...base, hostKind: "marketing" }),
    "https://tulala.digital/start?lang=es",
  );
});

test("buildStartUrl trims a trailing slash", () => {
  assert.equal(
    buildStartUrl({ siteUrl: "https://tulala.digital/", lang: "en", choice: "myself" }),
    "https://tulala.digital/start?choice=myself&lang=en",
  );
});
