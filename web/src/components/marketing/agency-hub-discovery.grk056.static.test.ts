import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

/**
 * GRK-056 — /discover-agencies "View profile" must not leave Tulala for an
 * agency's external website. Editorial discovery cards keep in-product hrefs
 * (`/w/<slug>` or marketing paths) so contact stays inside Tulala.
 */
const src = readFileSync(
  join(process.cwd(), "src/components/marketing/agency-hub-discovery.tsx"),
  "utf8",
);

test("GRK-056: discovery cards never use external http(s) View-profile hrefs", () => {
  assert.doesNotMatch(src, /href:\s*"https?:\/\//);
  assert.match(src, /href:\s*"\/w\/impronta"/);
  assert.match(src, /withLocaleHref\(card\.href,\s*locale\)/);
});
