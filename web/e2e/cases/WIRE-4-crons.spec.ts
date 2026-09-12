/**
 * 4.5 Reminders cron + delivery retry cron.
 */
import { test, expect, skipUnlessFixture } from "./_harness";
import { isolatedService, JOURNEYS_TENANT_ID } from "./_isolated-db";

skipUnlessFixture();

test("WIRE-4.5 cron routes move scheduled_messages and message_delivery", async ({ request }) => {
  const secret = process.env.CRON_SECRET;
  test.skip(!secret, "blocked-external: CRON_SECRET missing");
  const sb = isolatedService();
  const { count: dueBefore } = await sb
    .from("scheduled_messages")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("state", "scheduled");
  const { count: failedBefore } = await sb
    .from("message_delivery")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("state", "failed");

  const remind = await request.get("/api/cron/messaging-reminders", {
    headers: { authorization: `Bearer ${secret}` },
  });
  expect([200, 204]).toContain(remind.status());
  const retry = await request.get("/api/cron/messaging-delivery-retry", {
    headers: { authorization: `Bearer ${secret}` },
  });
  expect([200, 204]).toContain(retry.status());

  const { count: dueAfter } = await sb
    .from("scheduled_messages")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("state", "scheduled");
  const { count: failedAfter } = await sb
    .from("message_delivery")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("state", "failed");
  if ((dueBefore ?? 0) > 0) {
    expect(dueAfter ?? 0).toBeLessThan(dueBefore ?? 0);
  }
  if ((failedBefore ?? 0) > 0) {
    expect(failedAfter ?? 0).toBeLessThanOrEqual(failedBefore ?? 0);
  }
});
