import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  BARE_ID_LANE,
  WEBHOOK_LANES,
  laneForEventId,
  laneScopedEventKey,
  type WebhookLane,
} from "./webhook-lanes";

describe("lane assignment", () => {
  test("every lane round-trips: key -> laneForEventId -> same lane", () => {
    for (const lane of WEBHOOK_LANES) {
      assert.equal(laneForEventId(laneScopedEventKey(lane, "evt_123")), lane);
    }
  });

  test("the bare-id lane is platform and keeps the bare id", () => {
    assert.equal(BARE_ID_LANE, "platform");
    assert.equal(laneScopedEventKey("platform", "evt_1"), "evt_1");
    assert.equal(laneForEventId("evt_1"), "platform");
  });

  test("prefixed lanes use the prefix before the first colon", () => {
    assert.equal(laneForEventId("platform_mx:evt_1"), "platform_mx");
    assert.equal(laneForEventId("discover_client_subscription:evt_1"), "discover_client_subscription");
  });

  test("an unknown prefix is null, not a guess", () => {
    assert.equal(laneForEventId("mystery:evt_1"), null);
  });

  test("matches the migration backfill rule", () => {
    const sql = readFileSync(
      new URL("../../../../supabase/migrations/20261231348000_stripe_processed_events_lane.sql", import.meta.url),
      "utf8",
    );
    assert.match(sql, /add column if not exists lane text/i);
    assert.match(sql, /LIKE 'platform_mx:%' THEN 'platform_mx'/);
    assert.match(sql, /split_part\(event_id, ':', 1\)/);
    assert.match(sql, /ELSE 'platform'/);
    assert.match(sql, /\(lane, processed_at DESC\)/);
    assert.ok(!/primary key|drop /i.test(sql.replace(/--.*$/gm, "")), "must stay additive");
  });
});

describe("claim path writes the lane explicitly", () => {
  const src = readFileSync(new URL("./event-idempotency.ts", import.meta.url), "utf8");

  test("claimStripeEvent inserts lane: input.lane", () => {
    assert.match(src, /lane: input\.lane,/);
  });

  test("every lane a caller passes is a known WebhookLane", () => {
    const callers: Array<[string, RegExp]> = [
      ["./webhook-handler.ts", /lane: account === "mx" \? "platform_mx" : "platform"/],
      ["../../app/api/discover/subscriptions/webhook/route.ts", /const LANE = "discover_client_subscription" as const/],
    ];
    for (const [file, re] of callers) {
      assert.match(readFileSync(new URL(file, import.meta.url), "utf8"), re, file);
    }
    const known: WebhookLane[] = ["platform", "platform_mx", "discover_client_subscription"];
    assert.deepEqual([...WEBHOOK_LANES], known);
  });
});
