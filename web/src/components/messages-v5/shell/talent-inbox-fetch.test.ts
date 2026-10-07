import assert from "node:assert/strict";
import { test } from "node:test";

import { fetchTalentInbox } from "./talent-inbox-fetch";

const input = { locationSlug: "all", filter: "all" as const };
const respond = (status: number, body: unknown) =>
  (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;

test("direct load: rows come from GET /api/talent/inbox, not a server action", async () => {
  let url = "";
  const fetchImpl = (async (u: string) => {
    url = u;
    return new Response(JSON.stringify({ ok: true, rows: [{ id: "a" }, { id: "b" }], unreadCount: 2 }), { status: 200 });
  }) as unknown as typeof fetch;
  const result = await fetchTalentInbox({ locationSlug: "all", filter: "needs_action" as never }, fetchImpl);
  assert.equal(url, "/api/talent/inbox?filter=needs_action");
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.rows.length, 2);
});

test("a refusal body passes through", async () => {
  assert.deepEqual(await fetchTalentInbox(input, respond(200, { ok: false, reason: "not_allowed" })), { ok: false, reason: "not_allowed" });
});

test("non-2xx and malformed bodies become unavailable", async () => {
  assert.deepEqual(await fetchTalentInbox(input, respond(503, {})), { ok: false, reason: "unavailable" });
  assert.deepEqual(await fetchTalentInbox(input, respond(200, { nope: 1 })), { ok: false, reason: "unavailable" });
});
