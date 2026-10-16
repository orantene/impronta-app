import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const src = readFileSync("src/app/not-found.tsx", "utf8");

// TUL-1068-class QA #4: a workspace public site's 404 must keep the site chrome.
test("tenant 404 renders the site header and footer around the card", () => {
  assert.match(src, /import \{ PublicHeader \} from "@\/components\/public-header"/);
  assert.match(src, /import \{ PublicFooter \} from "@\/components\/public-footer"/);
  assert.match(src, /isAgency \? \(\s*<DirectoryInquiryModalProvider>[\s\S]*<PublicHeader \/>/);
  assert.match(src, /<PublicFooter \/>/);
});

test("platform (non-tenant) 404 stays chrome-free", () => {
  assert.match(src, /: card\b/);
});

test("tenant 404 card links keep the workspace path prefix", () => {
  assert.match(src, /getPublicPathPrefix\(\)/);
});
