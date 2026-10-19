import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { publicLocaleHref } from "@/i18n/client-directory-href";
import { localeUrlSettings } from "@/i18n/pathnames";

// TUL-711: a roster-less workspace's /directory redirects to its own /book.
// On the shared path host the browser path is /w/<slug>/directory, and the
// redirect must keep the /w/<slug> base (it used to hit the platform /book).

const settings = localeUrlSettings("en", ["en", "es"]);

test("the browser path carries the /w/<slug> base into the /book redirect", () => {
  assert.equal(publicLocaleHref("/w/qa-grok/directory", "/book", "en", settings), "/w/qa-grok/book");
});

test("a subdomain or custom host (no base) still redirects to /book", () => {
  assert.equal(publicLocaleHref("/directory", "/book", "en", settings), "/book");
});

test("the directory page feeds the original browser path to the redirect", () => {
  const src = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
  assert.match(src, /ORIGINAL_PATHNAME_HEADER/);
  assert.doesNotMatch(src, /publicLocaleHref\("\/directory"/);
});
