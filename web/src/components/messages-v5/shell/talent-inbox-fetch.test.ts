import assert from "node:assert/strict";
import { test } from "node:test";

import { fetchTalentInbox, primeTalentInbox, resetTalentInboxFetchForTests } from "./talent-inbox-fetch";

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

const okBody = (ids: string[]) => ({ ok: true, rows: ids.map((id) => ({ id })), unreadCount: 0 });
function countingFetch(body: unknown) {
  const calls: string[] = [];
  const impl = (async (u: string) => {
    calls.push(u);
    return new Response(JSON.stringify(body), { status: 200 });
  }) as unknown as typeof fetch;
  return { calls, impl };
}

test("concurrent reads of the same filter share ONE request (shell + Today)", async () => {
  resetTalentInboxFetchForTests();
  const { calls, impl } = countingFetch(okBody(["a", "b"]));
  const [a, b, c] = await Promise.all([
    fetchTalentInbox(input, impl),
    fetchTalentInbox(input, impl),
    fetchTalentInbox(input, impl),
  ]);
  assert.equal(calls.length, 1);
  assert.deepEqual(a, b);
  assert.deepEqual(b, c);
  // Settled: the next read (e.g. after a write) goes to the network again.
  await fetchTalentInbox(input, impl);
  assert.equal(calls.length, 2);
});

test("the server-rendered first read is used instead of a client request, then consumed", async () => {
  resetTalentInboxFetchForTests();
  const { calls, impl } = countingFetch(okBody(["fresh"]));
  primeTalentInbox("all", Promise.resolve({ ok: true as const, rows: [{ id: "ssr" }] as never, unreadCount: 0 }));
  await Promise.resolve();
  const first = await fetchTalentInbox(input, impl);
  assert.equal(calls.length, 0);
  assert.equal(first.ok && first.rows[0]?.id, "ssr");
  const second = await fetchTalentInbox(input, impl);
  assert.equal(calls.length, 1);
  assert.equal(second.ok && second.rows[0]?.id, "fresh");
});

test("a failed server read falls back to one GET", async () => {
  resetTalentInboxFetchForTests();
  const { calls, impl } = countingFetch(okBody(["x"]));
  primeTalentInbox("all", Promise.resolve({ ok: false as const, reason: "unavailable" as const }));
  const result = await fetchTalentInbox(input, impl);
  assert.equal(calls.length, 1);
  assert.equal(result.ok, true);
});

test("a network error becomes unavailable instead of rejecting", async () => {
  resetTalentInboxFetchForTests();
  const impl = (async () => {
    throw new TypeError("network");
  }) as unknown as typeof fetch;
  assert.deepEqual(await fetchTalentInbox(input, impl), { ok: false, reason: "unavailable" });
});
