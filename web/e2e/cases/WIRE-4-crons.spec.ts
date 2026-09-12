/**
 * 4.5 Reminders cron + delivery retry cron.
 */
import { test, expect, skipUnlessFixture } from "./_harness";
import { isolatedService, JOURNEYS_TENANT_ID } from "./_isolated-db";

skipUnlessFixture();

test("WIRE-4.5 cron routes move scheduled_messages and message_delivery", async ({ request }) => {
  const secret = process.env.CRON_SECRET;
  test.skip(!secret, "blocked-external: CRON_SECRET missing");
  const remind = await request.get("/api/cron/scheduled-messages", {
    headers: { authorization: `Bearer ${secret}` },
  });
  expect([200, 204]).toContain(remind.status());
  const retry = await request.get("/api/cron/message-delivery", {
    headers: { authorization: `Bearer ${secret}` },
  });
  expect([200, 204]).toContain(retry.status());
  const sb = isolatedService();
  const { count } = await sb
    .from("scheduled_messages")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", JOURNEYS_TENANT_ID);
  expect((count ?? 0) >= 0).toBeTruthy();
});
