/**
 * TUL-464: the paid-QA spec types card numbers on a stripe.com page, so its safety rails are pinned.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const setup = readFileSync("e2e-isolated/global-setup.ts", "utf8");
const spec = readFileSync("e2e-isolated/paid-qa.spec.ts", "utf8");
const config = readFileSync("playwright.isolated.config.ts", "utf8");

test("the refuse-first guard checks the isolated project, test-only keys and local-only URLs", () => {
  assert.match(setup, /assertIsolatedJourneysTarget\(process\.env, \{ requireIsolatedFlag: true \}\)/);
  assert.match(setup, /_live_/);
  assert.match(setup, /\(sk\|pk\|rk\)_test_/);
  assert.match(setup, /localhost[\s\S]{0,80}127\.0\.0\.1[\s\S]{0,80}\.localhost/);
  assert.match(setup, /PAID_QA_PAY_URLS/);
});

test("the spec asserts Test mode BEFORE typing a card, and only types Stripe's published test cards", () => {
  const open = spec.indexOf("async function openStripeCheckout");
  const fill = spec.indexOf("async function fillCard");
  assert.ok(open > -1 && fill > open);
  assert.match(spec.slice(open, fill), /getByText\(\/test mode\/i\)/);
  const cards = [...spec.matchAll(/fillCard\(page, "([0-9 ]+)"\)/g)].map((m) => m[1]);
  assert.deepEqual(cards.sort(), ["4000 0000 0000 0002", "4000 0000 0000 3220", "4242 4242 4242 4242"]);
});

test("the spec only reads the database (GET) and never writes", () => {
  assert.doesNotMatch(spec, /method:\s*"(POST|PATCH|PUT|DELETE)"/);
});

test("the isolated config is its own testDir and the other configs never collect it", () => {
  assert.match(config, /testDir: "\.\/e2e-isolated"/);
  assert.match(readFileSync("playwright.config.ts", "utf8"), /testDir: "\.\/e2e"/);
  assert.match(readFileSync("playwright.live.config.ts", "utf8"), /testDir: "\.\/e2e-live"/);
  assert.match(readFileSync("package.json", "utf8"), /"qa:paid-isolated": "playwright test -c playwright\.isolated\.config\.ts"/);
});

const after = readFileSync("e2e-isolated/paid-qa-after-pay.spec.ts", "utf8");

test("the after-pay spec never pays or types a card, never writes the database, and skips until its feature is live", () => {
  assert.doesNotMatch(after, /fillCard|4242|checkout\.stripe\.com/);
  assert.doesNotMatch(after, /method:\s*"(POST|PATCH|PUT|DELETE)"/);
  assert.match(after, /PAID_QA_LIVE/);
  assert.match(after, /test\.skip\(!LIVE\.has\("money-net"\)/);
  assert.match(after, /test\.skip\(!LIVE\.has\("refund-lines"\)/);
  // It runs only behind the isolated-target refusal in global-setup (the same config as the paid spec).
  assert.match(config, /globalSetup: "\.\/e2e-isolated\/global-setup\.ts"/);
});
