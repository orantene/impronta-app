import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";

import { finishAppend, insertEvents } from "./support-engine-append";
import { mapTicketRow, type SupportTicketRow } from "./support-types";

type FakeResult = { data: unknown; error: { message: string } | null };
type FakeCall = { table: string; op: "select" | "insert" | "update"; payload: unknown };

/** Minimal chainable query builder: every terminal resolves to a scripted result. */
class FakeQuery implements PromiseLike<FakeResult> {
  constructor(
    private readonly result: FakeResult,
  ) {}
  insert(): FakeQuery { return this; }
  update(): FakeQuery { return this; }
  select(): FakeQuery { return this; }
  eq(): FakeQuery { return this; }
  single(): FakeQuery { return this; }
  maybeSingle(): FakeQuery { return this; }
  then<A = FakeResult, B = never>(
    ok?: ((v: FakeResult) => A | PromiseLike<A>) | null,
    bad?: ((e: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve(this.result).then(ok, bad);
  }
}

function fakeAdmin(script: Record<string, (op: FakeCall["op"], payload: unknown) => FakeResult>) {
  const calls: FakeCall[] = [];
  const client = {
    from(table: string) {
      let op: FakeCall["op"] = "select";
      let payload: unknown = null;
      const respond = () => {
        calls.push({ table, op, payload });
        return new FakeQuery(script[table](op, payload));
      };
      return {
        insert(p: unknown) { op = "insert"; payload = p; return respond(); },
        update(p: unknown) { op = "update"; payload = p; return respond(); },
        select() { return respond(); },
      };
    },
  };
  return { admin: client as unknown as SupabaseClient, calls };
}

const RAW = {
  id: "t1", ticket_number: 7, tenant_id: null, surface: "talent", status: "open",
  waiting_on: "support", priority: "normal", handled_by: "human", subject: "Hi",
  message_count: 1, tags: [], metadata: {}, created_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z", last_message_at: "2026-10-01T00:00:00Z",
};
const working = mapTicketRow({ ...RAW, message_count: 0 }) as SupportTicketRow;
const afterTrigger = mapTicketRow(RAW) as SupportTicketRow;
const event = {
  ticketId: "t1", tenantId: null, actorKind: "requester" as const, actorUserId: "u1",
  eventType: "message_sent" as const, newValue: { messageId: "m1" },
};

test("finishAppend: update .select() replaces the trailing reload (3 calls -> 2, parallel)", async () => {
  const { admin, calls } = fakeAdmin({
    support_tickets: () => ({ data: RAW, error: null }),
    support_ticket_events: () => ({ data: { id: "e1" }, error: null }),
  });
  const out = await finishAppend(admin, working, "requester", event);
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map((c) => c.op).sort(), ["insert", "update"]);
  assert.deepEqual(calls.find((c) => c.op === "update")?.payload, { waiting_on: "support" });
  assert.equal(out.eventId, "e1");
  assert.deepEqual(out.ticket, afterTrigger);
});

test("finishAppend: agent flips waiting_on to requester", async () => {
  const { admin, calls } = fakeAdmin({
    support_tickets: () => ({ data: { ...RAW, waiting_on: "requester" }, error: null }),
    support_ticket_events: () => ({ data: { id: "e1" }, error: null }),
  });
  const out = await finishAppend(admin, working, "agent", { ...event, actorKind: "agent" });
  assert.deepEqual(calls.find((c) => c.op === "update")?.payload, { waiting_on: "requester" });
  assert.equal(out.ticket.waitingOn, "requester");
});

test("finishAppend: no applicable update falls back to one reload", async () => {
  const { admin, calls } = fakeAdmin({
    support_tickets: () => ({ data: RAW, error: null }),
    support_ticket_events: () => ({ data: { id: "e1" }, error: null }),
  });
  const out = await finishAppend(admin, working, "system", { ...event, actorKind: "system" });
  assert.deepEqual(calls.map((c) => `${c.table}:${c.op}`), [
    "support_ticket_events:insert",
    "support_tickets:select",
  ]);
  assert.deepEqual(out.ticket, afterTrigger);
});

test("finishAppend: update matched no row (status raced) reloads", async () => {
  const { admin, calls } = fakeAdmin({
    support_tickets: (op) => ({ data: op === "update" ? null : RAW, error: null }),
    support_ticket_events: () => ({ data: { id: "e1" }, error: null }),
  });
  const out = await finishAppend(admin, working, "requester", event);
  assert.equal(calls.length, 3);
  assert.deepEqual(out.ticket, afterTrigger);
});

test("insertEvents: created + escalated in one insert, ids aligned by type", async () => {
  const { admin, calls } = fakeAdmin({
    support_ticket_events: () => ({
      data: [{ id: "e-esc", event_type: "escalated" }, { id: "e-new", event_type: "created" }],
      error: null,
    }),
  });
  const ids = await insertEvents(admin, [
    { ...event, eventType: "created" },
    { ...event, eventType: "escalated" },
  ]);
  assert.equal(calls.length, 1);
  assert.equal((calls[0].payload as unknown[]).length, 2);
  assert.deepEqual(ids, ["e-new", "e-esc"]);
});

test("insertEvents: error yields nulls like insertEvent", async () => {
  const { admin } = fakeAdmin({
    support_ticket_events: () => ({ data: null, error: { message: "boom" } }),
  });
  assert.deepEqual(await insertEvents(admin, [{ ...event, eventType: "created" }]), [null]);
});
