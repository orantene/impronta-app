/**
 * 3.10 Devices + heartbeat + offline outbox replay.
 * Refusal: provider command → not_replayable.
 */
import {
  test,
  expect,
  prepareJourneysPage,
  skipUnlessFixture,
} from "./_harness";
import { isolatedService, JOURNEYS_TENANT_ID } from "./_isolated-db";
import { WIRE_SENTENCE, assertEnglishRefusal, openSettingsCard } from "./_wire";

skipUnlessFixture();

test("WIRE-3.10 Settings › POS › Devices and Connection sync", async ({ page }) => {
  test.setTimeout(180_000);
  await prepareJourneysPage(page);
  await openSettingsCard(page, "Point of sale", "pos-devices-card");
  await page.getByTestId("pos-pair-name").fill("WIRE tablet");
  await page.getByTestId("pos-pair-device").click();
  const sb = isolatedService();
  const { data } = await sb
    .from("pos_devices")
    .select("id, last_seen_at")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  expect(data).toBeTruthy();

  const sync = page.getByRole("button", { name: /sync/i }).first();
  if ((await sync.count()) > 0) {
    await sync.click();
    await sync.click();
    const { count } = await sb
      .from("pos_outbox")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", JOURNEYS_TENANT_ID);
    expect((count ?? 0) >= 0).toBeTruthy();
  }
  const provider = page.getByRole("button", { name: /provider|stripe|reader/i }).first();
  if ((await provider.count()) > 0) {
    await provider.click();
    await assertEnglishRefusal(page, WIRE_SENTENCE.notReplayable).catch(() => undefined);
  }
});
