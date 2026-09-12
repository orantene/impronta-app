/**
 * Every segment in SPA_ONLY_ADMIN_SEGMENTS must be a bare `PageRouteSyncer`
 * page: the rail moves to it with `history.pushState` and no server render,
 * so a page that grows server work (an `await`, a snapshot loader) would be
 * skipped on every rail click. This pins the list to the page files.
 */
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { SPA_ONLY_ADMIN_SEGMENTS } from "./spa-segments";

const ADMIN_DIR = join(process.cwd(), "src/app/(workspace)/[tenantSlug]/admin");

test("every SPA-only admin segment is a bare PageRouteSyncer page", () => {
  for (const segment of SPA_ONLY_ADMIN_SEGMENTS) {
    const file = join(ADMIN_DIR, segment, "page.tsx");
    const source = readFileSync(file, "utf8");
    assert.ok(source.includes("PageRouteSyncer"), `${segment}/page.tsx must render PageRouteSyncer`);
    assert.ok(!/\bawait\b/.test(source), `${segment}/page.tsx does server work; drop it from SPA_ONLY_ADMIN_SEGMENTS`);
    assert.ok(!/async function/.test(source), `${segment}/page.tsx is async; drop it from SPA_ONLY_ADMIN_SEGMENTS`);
  }
});

test("the overview is never SPA-only (its page loads the snapshot)", () => {
  assert.ok(!(SPA_ONLY_ADMIN_SEGMENTS as readonly string[]).includes(""));
  assert.ok(!(SPA_ONLY_ADMIN_SEGMENTS as readonly string[]).includes("overview"));
});
