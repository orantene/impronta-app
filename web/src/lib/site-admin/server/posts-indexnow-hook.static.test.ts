/**
 * TUL-589 (S slice): publishPost / unpublishPost must ping IndexNow after a
 * successful write, so a viewer of the public post sees it recrawled fast.
 * Source-pin test, the same workaround this repo already uses for
 * `posts.ts`'s own `"server-only"` import (see `workspace-money-gates.test.ts`'s
 * header): `tenantScopedQuery` + `requirePhase5Capability` need a real
 * Supabase client to mock behaviorally, so this pins the call site and its
 * ordering instead.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(join(HERE, "posts.ts"), "utf8");

function body(fn: string): string {
  const start = SRC.indexOf(`export async function ${fn}(`);
  assert.ok(start >= 0, `${fn} must exist`);
  const next = SRC.indexOf("\nexport async function", start + 10);
  return SRC.slice(start, next < 0 ? undefined : next);
}

test("publishPost: pings IndexNow after the revision write, before returning ok", () => {
  const fn = body("publishPost");
  const revisionIdx = fn.indexOf("await writePostRevision(");
  const pingIdx = fn.indexOf("await pingIndexNowForPost(");
  const returnIdx = fn.indexOf("return { ok: true,");
  assert.ok(revisionIdx >= 0 && pingIdx >= 0 && returnIdx >= 0, "all three calls must be present");
  assert.ok(revisionIdx < pingIdx, "the ping must run after the revision is written");
  assert.ok(pingIdx < returnIdx, "the ping must run before the success return");
});

test("unpublishPost: pings IndexNow after confirming the row updated, before returning ok", () => {
  const fn = body("unpublishPost");
  const notFoundIdx = fn.indexOf('code: "NOT_FOUND"');
  const pingIdx = fn.indexOf("await pingIndexNowForPost(");
  const returnIdx = fn.indexOf("return { ok: true,");
  assert.ok(notFoundIdx >= 0 && pingIdx >= 0 && returnIdx >= 0, "all three must be present");
  assert.ok(notFoundIdx < pingIdx, "the ping must run after the not-found guard");
  assert.ok(pingIdx < returnIdx, "the ping must run before the success return");
});

test("pingIndexNowForPost: resolves the tenant's own origin, never the platform default", () => {
  const start = SRC.indexOf("async function pingIndexNowForPost(");
  assert.ok(start >= 0, "pingIndexNowForPost must exist");
  const helperBody = SRC.slice(start);
  assert.match(helperBody, /resolveTenantPublicOriginForIndexNow\(/);
  assert.match(helperBody, /if \(!origin\) return;/, "must no-op rather than ping a wrong/default host when the tenant has no live domain yet");
});
