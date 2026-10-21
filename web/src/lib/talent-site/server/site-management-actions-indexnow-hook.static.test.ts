/**
 * TUL-589 (S slice): publishMaxSiteAction must ping IndexNow after the site
 * actually goes live, so a change search engines otherwise wait on their own
 * schedule for gets recrawled fast. Source-pin test — this "use server" file
 * needs a real Supabase client + session to exercise behaviorally, the same
 * constraint `fulfillment-core.ts`'s header documents for a sibling module.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(HERE, "site-management-actions.ts"), "utf8");

test("publishMaxSiteAction: pings IndexNow after the site is marked published, before returning ok", () => {
  const start = SRC.indexOf("export async function publishMaxSiteAction(");
  assert.ok(start >= 0, "publishMaxSiteAction must exist");
  const next = SRC.indexOf("\nexport async function", start + 10);
  const fn = SRC.slice(start, next < 0 ? undefined : next);

  const siteUpdateIdx = fn.indexOf('status: "published"');
  const pingIdx = fn.indexOf("await pingIndexNowUrl(");
  const returnIdx = fn.indexOf("return { ok: true, data: { publishedAt: now } };");
  assert.ok(siteUpdateIdx >= 0 && pingIdx >= 0 && returnIdx >= 0, "all three must be present");
  assert.ok(siteUpdateIdx < pingIdx, "the ping must run after the site row is marked published");
  assert.ok(pingIdx < returnIdx, "the ping must run before the success return");
  assert.match(fn, /is_demo/, "must skip the ping for a demo profile");
});
