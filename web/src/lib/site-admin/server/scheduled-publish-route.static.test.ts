/**
 * scheduled-publish-route.static.test.ts — the NEGATIVE guard for the
 * scheduled-publish cron.
 *
 * `scheduled-publish-sweep.test.ts` proves the routing is right once rows
 * arrive. This file proves the rows ARRIVE: the route's own query must not
 * narrow the sweep back to the homepage. That narrowing is exactly the bug —
 * `.eq("system_template_key", "homepage")` on the due-row select meant an
 * operator could schedule an inner page and nothing would ever fire.
 *
 * Re-adding that filter makes the first test here fail. Re-introducing the
 * `status='draft'` filter makes the second fail (a freeform page that has been
 * published once never returns to draft, so a draft-only filter silently
 * disables every later schedule on it).
 *
 * WHY FILE-TEXT SCAN: importing the route pulls Next's server runtime, the
 * Supabase service-role client, and the whole publish graph. A text scan
 * asserts the query shape at zero cost and cannot be faked by a mock.
 *
 * Test runner: node:test + node:assert/strict
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Scan CODE, not prose. Every file under test documents the bug it fixes in its
 * header, so a bare word match would fire on the explanation of the defect
 * rather than on the defect. Strip block and line comments first.
 */
function code(relativePath: string): string {
  return readFileSync(resolve(HERE, relativePath), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const ROUTE = code("../../../app/api/cron/publish-scheduled/route.ts");
const SCHEDULE_ACTIONS = code("../edit-mode/schedule-actions.ts");
const SHARE_ACTIONS = code("../share-link/share-actions.ts");

test("the cron's due-row query does NOT filter to the homepage", () => {
  assert.ok(
    !/system_template_key/.test(ROUTE),
    'the scheduled-publish cron narrowed its query by system_template_key again — that is the original bug: "Schedule publish" is offered on every surface, so a homepage-only sweep means an inner page never publishes',
  );
});

test("the cron's due-row query does NOT filter to status='draft'", () => {
  assert.ok(
    !/\.eq\(\s*["']status["']\s*,\s*["']draft["']\s*\)/.test(ROUTE),
    "the scheduled-publish cron filtered status='draft' again — publishing a freeform page never flips its status back, so that filter silently disables every schedule set on an already-published page",
  );
});

test("the cron still excludes archived pages", () => {
  assert.ok(
    /\.neq\(\s*["']status["']\s*,\s*["']archived["']\s*\)/.test(ROUTE),
    "the archived exclusion is gone — a stale schedule on an archived page would resurrect it",
  );
});

test("the cron dispatches through the shared sweep, not an inline loop", () => {
  assert.ok(
    ROUTE.includes("runScheduledPublishSweep"),
    "the cron stopped using runScheduledPublishSweep — the routing rules would no longer be the ones under test",
  );
  for (const handler of ["homepage(", "freeform(", "template("]) {
    assert.ok(
      ROUTE.includes(handler),
      `the cron lost its "${handler}" handler — that page kind would have no publish path`,
    );
  }
});

test("each cron handler calls the publisher its page kind actually needs", () => {
  assert.ok(
    ROUTE.includes("publishHomepage("),
    "homepage rows must go through publishHomepage (slot composition)",
  );
  assert.ok(
    ROUTE.includes("publishCmsFreeformPageWithClient("),
    "freeform rows must go through the shared freeform publish core, not the homepage publisher (which reads cms_page_sections and would publish an empty composition over a real page)",
  );
  assert.ok(
    ROUTE.includes("publishPage("),
    "template rows must go through publishPage",
  );
});

test("the schedule write side is page-scoped, not homepage-pinned", () => {
  assert.ok(
    !/system_template_key/.test(SCHEDULE_ACTIONS),
    "schedule-actions resolved the homepage row directly again — scheduling from an inner page would silently schedule a HOMEPAGE publish",
  );
  assert.ok(
    SCHEDULE_ACTIONS.includes("resolveEditorPage("),
    "schedule-actions must resolve the edited page through resolveEditorPage",
  );
});

test("the share link is page-scoped, not homepage-pinned", () => {
  assert.ok(
    !SHARE_ACTIONS.includes("loadDraftHomepage"),
    "share-actions called loadDraftHomepage again — a link minted while editing an inner page would hand the recipient the HOMEPAGE draft",
  );
  assert.ok(
    SHARE_ACTIONS.includes("resolveEditorPage("),
    "share-actions must resolve the edited page through resolveEditorPage",
  );
});
