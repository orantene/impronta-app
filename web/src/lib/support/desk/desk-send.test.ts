import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { beginDeskSend, type DeskSendAttempt } from "./desk-send";

describe("desk-send (journeys 26–27)", () => {
  it("blocks a second send while inflight with the same body", () => {
    const first = beginDeskSend({
      previous: null,
      ticketId: "t1",
      body: "Hello",
      asInternalNote: false,
      fresh: true,
    });
    assert.ok(first);
    assert.equal(first!.status, "inflight");

    const blocked = beginDeskSend({
      previous: first,
      ticketId: "t1",
      body: "Hello",
      asInternalNote: false,
      fresh: false,
    });
    assert.equal(blocked, null);
  });

  it("retry after failure reuses the client send key (no duplicate)", () => {
    const failed: DeskSendAttempt = {
      key: "same-key-12345678",
      ticketId: "t1",
      body: "Hello",
      asInternalNote: false,
      status: "failed",
    };
    const retry = beginDeskSend({
      previous: failed,
      ticketId: "t1",
      body: "Hello",
      asInternalNote: false,
      fresh: false,
    });
    assert.ok(retry);
    assert.equal(retry!.key, "same-key-12345678");
    assert.equal(retry!.status, "inflight");
  });

  it("fresh compose always gets a new key", () => {
    const failed: DeskSendAttempt = {
      key: "old-key-abcdefgh",
      ticketId: "t1",
      body: "Hello",
      asInternalNote: false,
      status: "failed",
    };
    const next = beginDeskSend({
      previous: failed,
      ticketId: "t1",
      body: "Hello again",
      asInternalNote: false,
      fresh: true,
    });
    assert.ok(next);
    assert.notEqual(next!.key, "old-key-abcdefgh");
  });
});
