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

import { blankComments } from "@/lib/quality/supabase-unchecked-read";

import { isBareShellPath, railMovesWithPushState, SPA_ONLY_ADMIN_SEGMENTS } from "./spa-segments";

const ADMIN_DIR = join(process.cwd(), "src/app/(workspace)/[tenantSlug]/admin");

test("every SPA-only admin segment is a bare PageRouteSyncer page", () => {
  for (const segment of SPA_ONLY_ADMIN_SEGMENTS) {
    const file = join(ADMIN_DIR, segment, "page.tsx");
    const source = blankComments(readFileSync(file, "utf8"));
    assert.ok(source.includes("PageRouteSyncer"), `${segment}/page.tsx must render PageRouteSyncer`);
    assert.ok(!/\bawait\b/.test(source), `${segment}/page.tsx does server work; drop it from SPA_ONLY_ADMIN_SEGMENTS`);
    assert.ok(!/async function/.test(source), `${segment}/page.tsx is async; drop it from SPA_ONLY_ADMIN_SEGMENTS`);
  }
});

test("the overview is never SPA-only (its page loads the snapshot)", () => {
  assert.ok(!(SPA_ONLY_ADMIN_SEGMENTS as readonly string[]).includes(""));
  assert.ok(!(SPA_ONLY_ADMIN_SEGMENTS as readonly string[]).includes("overview"));
});

test("isBareShellPath: only the base and one SPA-only segment are bare (D-167)", () => {
  for (const base of ["/admin", "/impronta/admin"]) {
    assert.equal(isBareShellPath(base, base), true, `${base} (overview) is bare`);
    assert.equal(isBareShellPath(`${base}/`, base), true);
    assert.equal(isBareShellPath(`${base}/messages`, base), true);
    assert.equal(isBareShellPath(`${base}/catalog`, base), true);
    // A canonical server page hosted in the shell: leaving it must go through the router.
    assert.equal(isBareShellPath(`${base}/projects`, base), false);
    assert.equal(isBareShellPath(`${base}/projects/abc`, base), false);
    assert.equal(isBareShellPath(`${base}/messages/abc`, base), false, "a thread is canonical");
    assert.equal(isBareShellPath(`${base}/settings/domains`, base), false, "a settings sub-route may render");
    assert.equal(isBareShellPath(`${base}/pos`, base), false);
  }
  assert.equal(isBareShellPath("/other/admin/messages", "/impronta/admin"), false);
  assert.equal(isBareShellPath("/adminx/messages", "/admin"), false);
});

test("railMovesWithPushState: SPA-only target AND a bare origin (D-167)", () => {
  assert.equal(railMovesWithPushState("/impronta/admin/catalog", "/impronta/admin", "messages"), true);
  assert.equal(railMovesWithPushState("/impronta/admin", "/impronta/admin", "messages"), true);
  assert.equal(railMovesWithPushState("/impronta/admin/projects", "/impronta/admin", "messages"), false);
  assert.equal(railMovesWithPushState("/impronta/admin/messages", "/impronta/admin", "projects"), false);
  assert.equal(railMovesWithPushState("/impronta/admin/messages", "/impronta/admin", ""), false);
});
