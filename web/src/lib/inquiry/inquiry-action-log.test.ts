import test from "node:test";
import assert from "node:assert/strict";

import { logInquiryAction } from "@/lib/inquiry/inquiry-action-log";

type InsertCall = { table: string; row: Record<string, unknown> };

function makeStubClient(
  insertResult: { data?: unknown; error?: { code?: string; message: string } | null },
  calls: InsertCall[],
) {
  return {
    from(table: string) {
      return {
        insert(row: Record<string, unknown>) {
          calls.push({ table, row });
          return Promise.resolve({
            data: insertResult.data ?? null,
            error: insertResult.error ?? null,
          });
        },
      };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
}

function makeThrowingClient(): unknown {
  return {
    from() {
      throw new Error("network down");
    },
  };
}

// Silence console noise during the deliberate-failure tests so the test runner
// output isn't polluted. Failures are emitted as one structured JSON line via
// improntaLog (console.info); the final test proves the helper does emit.
const origError = console.error;
const origInfo = console.info;

test("logInquiryAction: happy path — inserts row and returns true", async () => {
  const calls: InsertCall[] = [];
  const client = makeStubClient({ error: null }, calls);
  const ok = await logInquiryAction(client, {
    inquiryId: "inquiry-1",
    actorUserId: "user-1",
    actionType: "coordinator_promoted",
    result: "success",
    metadata: { target_user_id: "user-2" },
  });

  assert.equal(ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].table, "inquiry_action_log");
  assert.deepEqual(calls[0].row, {
    inquiry_id: "inquiry-1",
    actor_user_id: "user-1",
    action_type: "coordinator_promoted",
    result: "success",
    reason: null,
    metadata: { target_user_id: "user-2" },
  });
});

test("logInquiryAction: failure branch — writes with reason and metadata", async () => {
  const calls: InsertCall[] = [];
  const client = makeStubClient({ error: null }, calls);
  const ok = await logInquiryAction(client, {
    inquiryId: "inquiry-1",
    actorUserId: "user-1",
    actionType: "booking_conversion_attempt",
    result: "failure",
    reason: "requirement_groups_unfulfilled",
    metadata: { shortfall: [{ group_id: "g-1", needed: 2, have: 1 }] },
  });

  assert.equal(ok, true);
  assert.equal(calls[0].row.result, "failure");
  assert.equal(calls[0].row.reason, "requirement_groups_unfulfilled");
});

test("logInquiryAction: null reason and metadata coerced correctly", async () => {
  const calls: InsertCall[] = [];
  const client = makeStubClient({ error: null }, calls);
  await logInquiryAction(client, {
    inquiryId: "inquiry-1",
    actorUserId: "user-1",
    actionType: "message_sent",
    result: "success",
  });

  assert.equal(calls[0].row.reason, null);
  assert.equal(calls[0].row.metadata, null);
});

test("logInquiryAction: DB error — returns false, never throws", async () => {
  console.error = () => {};
  console.info = () => {};
  try {
    const calls: InsertCall[] = [];
    const client = makeStubClient(
      { error: { code: "23514", message: "metadata too large" } },
      calls,
    );
    const ok = await logInquiryAction(client, {
      inquiryId: "inquiry-1",
      actorUserId: "user-1",
      actionType: "coordinator_removed",
      result: "failure",
    });
    assert.equal(ok, false);
  } finally {
    console.error = origError;
    console.info = origInfo;
  }
});

test("logInquiryAction: synchronous client throw — returns false, never throws", async () => {
  console.error = () => {};
  console.info = () => {};
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const client = makeThrowingClient() as any;
    const ok = await logInquiryAction(client, {
      inquiryId: "inquiry-1",
      actorUserId: "user-1",
      actionType: "coordinator_assigned",
      result: "success",
    });
    assert.equal(ok, false);
  } finally {
    console.error = origError;
    console.info = origInfo;
  }
});

test("logInquiryAction: DB error emits a structured log line with diagnostic fields", async () => {
  const captured: string[] = [];
  console.info = (...args: unknown[]) => captured.push(String(args[0]));
  try {
    const calls: InsertCall[] = [];
    const client = makeStubClient(
      { error: { code: "42501", message: "rls denied" } },
      calls,
    );
    await logInquiryAction(client, {
      inquiryId: "inquiry-1",
      actorUserId: "user-1",
      actionType: "participant_moved_group",
      result: "failure",
      reason: "not_allowed",
    });
    assert.equal(captured.length, 1);
    const line = JSON.parse(captured[0]) as Record<string, unknown>;
    assert.equal(line.event, "inquiry_action_log.error");
    assert.equal(line.context, "[inquiry_action_log] insert failed");
    assert.equal(line.inquiryId, "inquiry-1");
    assert.equal(line.actionType, "participant_moved_group");
    assert.equal(line.result, "failure");
    assert.equal(line.code, "42501");
    assert.equal(line.message, "rls denied");
  } finally {
    console.error = origError;
    console.info = origInfo;
  }
});
