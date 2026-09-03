import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_ADD_PAGE_DENIAL_MESSAGE,
  resolveAddPageDenialMessage,
} from "./all-pages-panel-deny-reason";

test("resolveAddPageDenialMessage returns null before availability has loaded", () => {
  assert.equal(resolveAddPageDenialMessage(null), null);
});

test("resolveAddPageDenialMessage returns null when the plan allows creating pages", () => {
  assert.equal(
    resolveAddPageDenialMessage({ canCreatePages: true, createPageHint: null }),
    null,
  );
});

test("resolveAddPageDenialMessage surfaces the server's plan-gate hint", () => {
  // The panel is a pass-through: it renders whatever hint the server sent, so
  // this string only has to be representative, not the live copy.
  const hint =
    "Your plan includes 5 pages of your own. Every paid plan adds unlimited pages, starting with Website.";
  assert.equal(
    resolveAddPageDenialMessage({ canCreatePages: false, createPageHint: hint }),
    hint,
  );
});

test("resolveAddPageDenialMessage falls back to a generic message when denied without a hint", () => {
  assert.equal(
    resolveAddPageDenialMessage({ canCreatePages: false, createPageHint: null }),
    DEFAULT_ADD_PAGE_DENIAL_MESSAGE,
  );
});
