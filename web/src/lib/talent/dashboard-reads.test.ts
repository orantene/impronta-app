import assert from "node:assert/strict";
import { test } from "node:test";

import { isTalentDashboardReadKey, readTalentDashboard, TALENT_DASHBOARD_READ_KEYS } from "./dashboard-reads";

const respond = (status: number, body: unknown) =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

test("TUL-1274: a read is a same-origin no-store GET to /api/talent/dashboard-reads", async () => {
  let url = "";
  let init: RequestInit | undefined;
  const fetchImpl = (async (u: string, i?: RequestInit) => {
    url = u;
    init = i;
    return new Response(JSON.stringify({ value: true }), { status: 200 });
  }) as unknown as typeof fetch;
  const value = await readTalentDashboard("website-settings-enabled", fetchImpl);
  assert.equal(value, true);
  assert.equal(url, "/api/talent/dashboard-reads?read=website-settings-enabled");
  assert.equal(init?.method ?? "GET", "GET");
  assert.equal(init?.cache, "no-store");
  assert.equal(init?.credentials, "same-origin");
});

test("TUL-1274: null values pass through (no session / not published)", async () => {
  assert.equal(await readTalentDashboard("site-live-verified", respond(200, { value: null })), null);
});

test("TUL-1274: non-2xx and malformed bodies reject, so callers keep their fallback", async () => {
  await assert.rejects(readTalentDashboard("site-activation", respond(503, {})));
  await assert.rejects(readTalentDashboard("site-activation", respond(200, { nope: 1 })));
});

test("TUL-1274: only the allow-listed reads are keys", () => {
  assert.deepEqual([...TALENT_DASHBOARD_READ_KEYS].sort(), [
    "instagram-card",
    "site-activation",
    "site-live-verified",
    "website-settings-enabled",
  ]);
  assert.equal(isTalentDashboardReadKey("instagram-card"), true);
  assert.equal(isTalentDashboardReadKey("sync-instagram"), false);
  assert.equal(isTalentDashboardReadKey(null), false);
});
