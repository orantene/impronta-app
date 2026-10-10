/**
 * live2b-05: dismiss must persist across a same-tab reload (consent Accept
 * reloads to load TikTok/LinkedIn). Cookie alone is not enough when the next
 * SSR races the write — sessionStorage is the session mirror.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

import {
  LOCALE_SUGGESTION_DISMISSED_COOKIE,
  LOCALE_SUGGESTION_DISMISSED_SESSION_KEY,
} from "@/i18n/locale-suggestion";

const clientSrc = readFileSync(
  fileURLToPath(new URL("./locale-suggestion-banner-client.tsx", import.meta.url)),
  "utf8",
);

describe("LocaleSuggestionBannerClient dismiss persistence (live2b-05)", () => {
  it("exports a sessionStorage key distinct from nothing and shared with the cookie name", () => {
    assert.equal(LOCALE_SUGGESTION_DISMISSED_SESSION_KEY, "locale-suggest-dismissed");
    assert.equal(LOCALE_SUGGESTION_DISMISSED_COOKIE, LOCALE_SUGGESTION_DISMISSED_SESSION_KEY);
  });

  it("writes sessionStorage on dismiss and re-hides from sessionStorage on mount", () => {
    assert.match(clientSrc, /LOCALE_SUGGESTION_DISMISSED_SESSION_KEY/);
    assert.match(clientSrc, /sessionStorage\.setItem\(LOCALE_SUGGESTION_DISMISSED_SESSION_KEY,\s*"1"\)/);
    assert.match(clientSrc, /sessionStorage\.getItem\(LOCALE_SUGGESTION_DISMISSED_SESSION_KEY\)\s*===\s*"1"/);
    assert.match(clientSrc, /LOCALE_SUGGESTION_DISMISSED_COOKIE/);
  });
});
