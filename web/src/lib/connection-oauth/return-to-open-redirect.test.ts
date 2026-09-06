import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizeReturnTo } from "./state";

/**
 * The `returnTo` open redirect, pinned by the payloads that actually worked.
 *
 * The old rule was `startsWith("/") && !startsWith("//")`. It reads as airtight.
 * It is not, because the value is handed to `new URL(returnTo, appUrl)` one line
 * later in the callback, and the WHATWG parser treats a backslash in a
 * special-scheme URL as a slash and strips raw tabs and newlines before parsing.
 *
 * These tests deliberately assert against the URL CONSTRUCTOR rather than
 * against the string rule, because the constructor is what the callback uses and
 * the defect was a differential between the two. A test of the string rule alone
 * would have passed on the vulnerable code.
 */
const APP = "https://app.tulala.digital";

/** The rule as it stood before the fix. */
function oldNormalize(value: string, fallback: string): string {
  const raw = value.trim();
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return fallback;
  return raw.slice(0, 500);
}

/**
 * The REAL function, imported rather than reimplemented. A test that copies the
 * rule it is testing passes happily while the shipped code says something else;
 * that is the defect this repo calls "a true measurement of the wrong thing".
 */
const newNormalize = (value: string, fallback: string) => normalizeReturnTo(value, fallback);

const ESCAPES = ["/\\evil.com", "/\\\\evil.com", "/\t/evil.com", "/\n/evil.com"];

test("the payloads escaped the OLD rule and reached an external origin", () => {
  for (const payload of ESCAPES) {
    const passed = oldNormalize(payload, "/FALLBACK");
    assert.notEqual(passed, "/FALLBACK", `${JSON.stringify(payload)} should have slipped the old rule`);
    const resolved = new URL(passed, APP);
    assert.notEqual(
      resolved.origin,
      APP,
      `${JSON.stringify(payload)} should have resolved OFF-ORIGIN under the old rule`,
    );
  }
});

test("every one of them now falls back, checked at the origin", () => {
  for (const payload of ESCAPES) {
    assert.equal(
      newNormalize(payload, "/FALLBACK"),
      "/FALLBACK",
      `${JSON.stringify(payload)} must not survive`,
    );
  }
});

test("the shapes the old rule did catch are still caught", () => {
  for (const payload of ["//evil.com", "https://evil.com", "", "   "]) {
    assert.equal(newNormalize(payload, "/FALLBACK"), "/FALLBACK");
  }
});

test("ordinary in-app destinations still work, with the query preserved", () => {
  assert.equal(newNormalize("/admin/settings", "/FALLBACK"), "/admin/settings");
  assert.equal(
    newNormalize("/admin/settings?tab=integrations", "/FALLBACK"),
    "/admin/settings?tab=integrations",
  );
});

test("a fragment cannot ride along", () => {
  // Only pathname + search are carried forward.
  assert.equal(newNormalize("/admin#evil", "/FALLBACK"), "/admin");
});
