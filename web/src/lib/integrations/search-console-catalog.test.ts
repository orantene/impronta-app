import test from "node:test";
import assert from "node:assert/strict";

import {
  SEARCH_CONSOLE_INTEGRATION_KEY,
  getIntegrationDef,
  integrationHasSecret,
} from "./catalog";

test("search_console is a manual, public, ungated analytics integration", () => {
  const def = getIntegrationDef(SEARCH_CONSOLE_INTEGRATION_KEY);
  assert.ok(def, "search_console must be registered in the catalog");
  assert.equal(def!.category, "analytics");
  assert.equal(def!.connection, "manual");
  assert.equal(def!.inheritable, false);
  // Verification is a baseline capability — no plan-entitlement gate.
  assert.equal(def!.entitlement, undefined);
  // The token is a PUBLIC identifier, never a vault secret.
  assert.equal(integrationHasSecret(SEARCH_CONSOLE_INTEGRATION_KEY), false);
  const field = def!.fields.find((f) => f.name === "verification_token");
  assert.ok(field, "verification_token field must exist");
  assert.equal(field!.public, true);
  assert.equal(field!.secret, false);
});

test("verification_token validator accepts a real token and rejects a pasted meta tag", () => {
  const field = getIntegrationDef(SEARCH_CONSOLE_INTEGRATION_KEY)!.fields.find(
    (f) => f.name === "verification_token",
  )!;
  const testFn = field.test!;
  // A realistic ~43-char Google token.
  assert.equal(
    testFn("AT_7Nj7SfihEJhb9W1jP4oFW5fyoguijnMpqpIN7x0k").ok,
    true,
  );
  // The whole <meta> snippet must be rejected (angle brackets / spaces).
  assert.equal(
    testFn('<meta name="google-site-verification" content="abc" />').ok,
    false,
  );
  assert.equal(testFn("").ok, false);
  assert.equal(testFn("too short").ok, false);
});
