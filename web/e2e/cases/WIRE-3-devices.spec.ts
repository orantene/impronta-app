/**
 * 3.10 Devices + heartbeat + defaults; offline outbox replay (POSDevices,
 * POSConnection, W20). The offline cash sale end to end (queue while offline,
 * Sync now settles) is `WIRE-3-devices-outbox.spec.ts`. Here: Settings › POS ›
 * Devices pairs a device (`pos_devices` row), the till's heartbeat refreshes
 * `last_seen_at`, and the engine applies one command exactly once on a
 * replay. Refusal: a provider command → `not_replayable`. The till's own
 * queue never accepts a provider command (`normalizeCashOutboxItem` drops
 * it, disabled-by-design), so the engine is asked directly for that sentence's
 * code.
 */
import { test, expect, prepareJourneysPage, signInJourneysStaff, counterStartSale, counterAddItem, skipUnlessFixture } from "./_harness";
import { isolatedService, JOURNEYS_TENANT_ID } from "./_isolated-db";
import { openSettingsCard, latestOrderIdByUrl } from "./_wire";

skipUnlessFixture();

test("WIRE-3.10 pair a device, heartbeat, replay once, provider command refused", async ({ page }) => {
  test.setTimeout(240_000);
  await prepareJourneysPage(page);
  const sb = isolatedService();
  const name = `WIRE tablet ${Date.now()}`;
  let deviceId: string | null = null;
  let tillDeviceId: string | null = null;
  try {
    await openSettingsCard(page, "Point of sale", "pos-devices-card");
    await page.getByTestId("pos-pair-name").fill(name);
    await page.getByTestId("pos-pair-device").click();
    await expect(page.getByText(name, { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    await expect
      .poll(
        async () => {
          const { data } = await sb.from("pos_devices").select("id, status, last_seen_at").eq("tenant_id", JOURNEYS_TENANT_ID).eq("name", name).maybeSingle();
          deviceId = (data as { id: string } | null)?.id ?? null;
          return (data as { status: string } | null)?.status ?? null;
        },
        { timeout: 20_000 },
      )
      .toBe("active");

    // Heartbeat: the till pairs itself (cashier menu › Devices › Pair this
    // till) and Connection › Sync now sends the heartbeat for its device key.
    await signInJourneysStaff(page, "/admin/pos?mode=counter");
    await page.getByRole("button", { name: /cashier and drawer/i }).first().click();
    await page.getByRole("menuitem", { name: /^devices$/i }).first().click();
    await expect(page.getByTestId("pos-device-registry")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("pos-pair-this-till").click();
    let paired: { deviceKey: string; deviceId: string } | null = null;
    await expect
      .poll(
        async () => {
          paired = await page.evaluate(() => {
            const raw = window.localStorage.getItem("tulala.pos.device");
            return raw ? (JSON.parse(raw) as { deviceKey: string; deviceId: string }) : null;
          });
          return paired?.deviceId ?? null;
        },
        { timeout: 20_000, message: "the till stores its paired device" },
      )
      .not.toBeNull();
    tillDeviceId = paired!.deviceId;
    await sb.from("pos_devices").update({ last_seen_at: new Date(Date.now() - 3600_000).toISOString() }).eq("id", tillDeviceId);

    // One cash sale queued on the till (what the counter writes while
    // offline; `WIRE-3-devices-outbox` drives that path through the UI).
    await page.goto("/admin/pos?mode=counter");
    await counterStartSale(page);
    await counterAddItem(page, "House pizza");
    const orderId = await latestOrderIdByUrl(page);
    const opKey = `wire-3-10:${Date.now()}`;
    const command = { kind: "cash_collect", method: "cash", order_id: orderId, amount_cents: 1800 };
    await page.evaluate(
      ([key, cmd]) => {
        window.localStorage.setItem("tulala.pos.cashOutbox", JSON.stringify([{ operationKey: key, command: cmd }]));
      },
      [opKey, command] as const,
    );
    await page.reload();
    await page.getByRole("button", { name: /cashier and drawer/i }).first().click();
    await page.getByRole("menuitem", { name: /^connection$/i }).first().click();
    await expect(page.getByTestId("pos-outbox-sync")).toBeVisible({ timeout: 20_000 });
    const sync = page.getByTestId("pos-outbox-sync-button");
    await expect(sync).toBeEnabled({ timeout: 20_000 });
    await sync.click();
    await expect(page.getByTestId("pos-outbox-synced")).toBeVisible({ timeout: 40_000 });
    // Heartbeat rode on the sync.
    await expect
      .poll(
        async () => {
          const { data } = await sb.from("pos_devices").select("last_seen_at").eq("id", tillDeviceId!).maybeSingle();
          const seen = (data as { last_seen_at: string | null } | null)?.last_seen_at;
          return seen ? Date.now() - Date.parse(seen) < 5 * 60_000 : false;
        },
        { timeout: 20_000, message: "heartbeat refreshes last_seen_at" },
      )
      .toBe(true);
    // Applied once; a replay of the same key is answered `already`, one row.
    const { data: applied } = await sb.from("pos_outbox").select("applied_at").eq("operation_key", opKey).maybeSingle();
    expect((applied as { applied_at: string | null } | null)?.applied_at, "applied_at stamped").toBeTruthy();
    const second = await sb.rpc("pos_outbox_apply", { p_tenant_id: JOURNEYS_TENANT_ID, p_device_id: tillDeviceId, p_operation_key: opKey, p_command: command });
    expect(second.error, second.error?.message).toBeNull();
    expect((second.data as { already?: boolean }).already, "second apply is a replay").toBe(true);
    const { count: rows } = await sb.from("pos_outbox").select("id", { count: "exact", head: true }).eq("operation_key", opKey);
    expect(rows, "one outbox row for one key").toBe(1);
    const { data: paidOrder } = await sb.from("orders").select("status").eq("id", orderId).maybeSingle();
    expect((paidOrder as { status: string } | null)?.status).toBe("paid");
    const { count: txns } = await sb.from("booking_transactions").select("id", { count: "exact", head: true }).eq("order_id", orderId).eq("status", "paid");
    expect(txns, "exactly one paid transaction after the replay").toBe(1);

    // Provider command → not_replayable.
    const provider = await sb.rpc("pos_outbox_apply", {
      p_tenant_id: JOURNEYS_TENANT_ID,
      p_device_id: tillDeviceId,
      p_operation_key: `${opKey}:card`,
      p_command: { kind: "card_collect", provider: "stripe", order_id: orderId, amount_cents: 100 },
    });
    expect(provider.error, provider.error?.message).toBeNull();
    expect((provider.data as { ok: boolean; reason?: string }).ok).toBe(false);
    expect((provider.data as { reason?: string }).reason).toBe("not_replayable");
  } finally {
    for (const id of [deviceId, tillDeviceId]) {
      if (!id) continue;
      await sb.from("pos_outbox").delete().eq("device_id", id);
      await sb.from("pos_device_sessions").delete().eq("device_id", id);
      await sb.from("pos_devices").delete().eq("id", id);
    }
  }
});
