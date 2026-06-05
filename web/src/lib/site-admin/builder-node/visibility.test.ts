import assert from "node:assert/strict";
import test from "node:test";

import {
  describeBuilderVisibilityCondition,
  evaluateBuilderNodeVisibility,
  evaluateBuilderVisibilityCondition,
  getBuilderNodeVisibilityCondition,
  normalizeBuilderVisibilityCondition,
  type BuilderVisibilityCondition,
  type BuilderVisibilityContext,
} from "./visibility";

// ── normalization ────────────────────────────────────────────────────────────

test("normalize keeps only valid signals; empty/garbage → null", () => {
  assert.equal(normalizeBuilderVisibilityCondition(null), null);
  assert.equal(normalizeBuilderVisibilityCondition({}), null);
  assert.equal(normalizeBuilderVisibilityCondition({ locale: "fr" }), null);
  assert.equal(normalizeBuilderVisibilityCondition({ auth: "maybe" }), null);
  assert.deepEqual(normalizeBuilderVisibilityCondition({ locale: "es" }), {
    locale: "es",
  });
  assert.deepEqual(
    normalizeBuilderVisibilityCondition({
      locale: "en",
      auth: "signed_in",
      variant: "promo",
      junk: 1,
    }),
    { locale: "en", auth: "signed_in", variant: "promo" },
  );
});

test("normalize trims + caps a variant flag and drops empties", () => {
  assert.equal(normalizeBuilderVisibilityCondition({ variant: "   " }), null);
  const long = "x".repeat(80);
  const out = normalizeBuilderVisibilityCondition({ variant: long });
  assert.equal(out?.variant?.length, 40);
});

// ── LOCALE signal — true/false ───────────────────────────────────────────────

test("locale rule: matches its locale, hides on a different KNOWN locale", () => {
  const rule: BuilderVisibilityCondition = { locale: "es" };
  assert.equal(evaluateBuilderVisibilityCondition(rule, { locale: "es" }), true);
  assert.equal(evaluateBuilderVisibilityCondition(rule, { locale: "es-MX" }), true);
  assert.equal(evaluateBuilderVisibilityCondition(rule, { locale: "en" }), false);
});

test("locale rule passes when the context has NO/Unknown locale (never hides on missing signal)", () => {
  const rule: BuilderVisibilityCondition = { locale: "en" };
  assert.equal(evaluateBuilderVisibilityCondition(rule, {}), true);
  assert.equal(evaluateBuilderVisibilityCondition(rule, { locale: "zz" }), true);
  assert.equal(evaluateBuilderVisibilityCondition(rule, undefined), true);
});

// ── AUTH signal — true/false ─────────────────────────────────────────────────

test("auth signed_in: shows to signed-in, hides from signed-out", () => {
  const rule: BuilderVisibilityCondition = { auth: "signed_in" };
  assert.equal(evaluateBuilderVisibilityCondition(rule, { signedIn: true }), true);
  assert.equal(evaluateBuilderVisibilityCondition(rule, { signedIn: false }), false);
});

test("auth signed_out: shows to signed-out, hides from signed-in", () => {
  const rule: BuilderVisibilityCondition = { auth: "signed_out" };
  assert.equal(evaluateBuilderVisibilityCondition(rule, { signedIn: false }), true);
  assert.equal(evaluateBuilderVisibilityCondition(rule, { signedIn: true }), false);
});

test("auth rule passes when the context provides no auth signal", () => {
  const rule: BuilderVisibilityCondition = { auth: "signed_in" };
  assert.equal(evaluateBuilderVisibilityCondition(rule, { locale: "en" }), true);
});

// ── VARIANT signal — true/false ──────────────────────────────────────────────

test("variant rule: matches its variant, hides on a different KNOWN variant", () => {
  const rule: BuilderVisibilityCondition = { variant: "promo" };
  assert.equal(evaluateBuilderVisibilityCondition(rule, { variant: "promo" }), true);
  assert.equal(evaluateBuilderVisibilityCondition(rule, { variant: "default" }), false);
  // Unknown / absent variant → pass.
  assert.equal(evaluateBuilderVisibilityCondition(rule, {}), true);
});

// ── combined (AND) ───────────────────────────────────────────────────────────

test("multiple signals combine with AND — all known signals must match", () => {
  const rule: BuilderVisibilityCondition = { locale: "es", auth: "signed_in" };
  const ctx: BuilderVisibilityContext = { locale: "es", signedIn: true };
  assert.equal(evaluateBuilderVisibilityCondition(rule, ctx), true);
  assert.equal(
    evaluateBuilderVisibilityCondition(rule, { locale: "es", signedIn: false }),
    false,
  );
  assert.equal(
    evaluateBuilderVisibilityCondition(rule, { locale: "en", signedIn: true }),
    false,
  );
});

test("no condition → always shown", () => {
  assert.equal(evaluateBuilderVisibilityCondition(null, { locale: "en" }), true);
  assert.equal(evaluateBuilderVisibilityCondition({}, { signedIn: false }), true);
});

// ── node-level reads ─────────────────────────────────────────────────────────

test("getBuilderNodeVisibilityCondition reads base first, then props", () => {
  assert.deepEqual(
    getBuilderNodeVisibilityCondition({
      visibilityCondition: { locale: "es" },
    }),
    { locale: "es" },
  );
  // Editor patch path writes into props before the next validate lifts it.
  assert.deepEqual(
    getBuilderNodeVisibilityCondition({
      props: { visibilityCondition: { auth: "signed_out" } },
    }),
    { auth: "signed_out" },
  );
  assert.equal(getBuilderNodeVisibilityCondition({ props: {} }), null);
});

test("evaluateBuilderNodeVisibility hides a node whose rule fails", () => {
  const node = { visibilityCondition: { locale: "es" } };
  assert.equal(evaluateBuilderNodeVisibility(node, { locale: "en" }), false);
  assert.equal(evaluateBuilderNodeVisibility(node, { locale: "es" }), true);
  // No node condition → always shown.
  assert.equal(evaluateBuilderNodeVisibility({ props: {} }, { locale: "en" }), true);
});

// ── descriptions (inspector) ─────────────────────────────────────────────────

test("describe summarizes the active rule", () => {
  assert.equal(describeBuilderVisibilityCondition(null), "Always visible");
  assert.equal(
    describeBuilderVisibilityCondition({ locale: "es" }),
    "Spanish only",
  );
  assert.equal(
    describeBuilderVisibilityCondition({ auth: "signed_in", variant: "promo" }),
    "Signed-in only · Variant “promo”",
  );
});
