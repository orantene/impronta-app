import assert from "node:assert/strict";
import { test } from "node:test";

import { markTicketBellRead, type BellUpdateClient } from "./mark-ticket-bell-read";

type Call = { table: string; values: { read_at: string }; filters: string[] };

function fakeClient(result: { error: { message: string } | null } | "throw"): { client: BellUpdateClient; calls: Call[] } {
  const calls: Call[] = [];
  const client: BellUpdateClient = {
    from(table) {
      const call: Call = { table, values: { read_at: "" }, filters: [] };
      calls.push(call);
      return {
        update(values) {
          call.values = values;
          return {
            eq(c1, v1) {
              call.filters.push(`${c1}=${v1}`);
              return {
                eq(c2, v2) {
                  call.filters.push(`${c2}=${v2}`);
                  return {
                    is(c3, v3) {
                      call.filters.push(`${c3} is ${String(v3)}`);
                      return {
                        filter(c4, op, v4) {
                          call.filters.push(`${c4} ${op} ${v4}`);
                          if (result === "throw") throw new Error("boom");
                          return Promise.resolve(result);
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
  return { client, calls };
}

test("reading a ticket marks only that user's unread ticket bell rows for that ticket", async () => {
  const { client, calls } = fakeClient({ error: null });
  const ok = await markTicketBellRead(client, "u1", "t1", "2026-10-13T10:00:00.000Z");
  assert.equal(ok, true);
  assert.equal(calls[0]!.table, "user_notifications");
  assert.deepEqual(calls[0]!.filters, ["user_id=u1", "kind=ticket", "read_at is null", "target_payload->>ticketId eq t1"]);
  assert.equal(calls[0]!.values.read_at, "2026-10-13T10:00:00.000Z");
});

test("a database error is swallowed and reported false", async () => {
  const { client } = fakeClient({ error: { message: "nope" } });
  assert.equal(await markTicketBellRead(client, "u1", "t1"), false);
});

test("a thrown error never escapes", async () => {
  const { client } = fakeClient("throw");
  assert.equal(await markTicketBellRead(client, "u1", "t1"), false);
});
