import assert from "node:assert/strict";
import { test } from "node:test";

import type { ThreadMessage } from "@/lib/messaging/types";

import { latestHoldExpiresAt } from "./hold-expiry-from-messages";

function msg(partial: Partial<ThreadMessage> & Pick<ThreadMessage, "id" | "kind">): ThreadMessage {
  return {
    inquiryId: "inq-1",
    body: "",
    payload: null,
    senderUserId: null,
    guestSessionId: null,
    createdAt: "2026-09-20T00:00:00.000Z",
    editedAt: null,
    deletedAt: null,
    thread: "private",
    internal: false,
    delivery: null,
    ...partial,
  };
}

test("latestHoldExpiresAt returns null for empty / non-hold messages", () => {
  assert.equal(latestHoldExpiresAt(null), null);
  assert.equal(latestHoldExpiresAt([]), null);
  assert.equal(
    latestHoldExpiresAt([msg({ id: "1", kind: "text", payload: { holdExpiresAt: "2026-01-01T00:00:00Z" } })]),
    null,
  );
});

test("latestHoldExpiresAt picks the newest professional_times expiry and ignores group / deleted", () => {
  const older = "2026-09-17T10:00:00.000Z";
  const newer = "2026-09-17T12:00:00.000Z";
  assert.equal(
    latestHoldExpiresAt([
      msg({ id: "a", kind: "professional_times", payload: { holdExpiresAt: older } }),
      msg({ id: "b", kind: "professional_times", payload: { holdExpiresAt: newer } }),
      msg({ id: "c", kind: "professional_times", thread: "group", payload: { holdExpiresAt: "2099-01-01T00:00:00Z" } }),
      msg({
        id: "d",
        kind: "service_card",
        deletedAt: "2026-09-17T11:00:00.000Z",
        payload: { holdExpiresAt: "2099-01-01T00:00:00Z" },
      }),
    ]),
    newer,
  );
});
