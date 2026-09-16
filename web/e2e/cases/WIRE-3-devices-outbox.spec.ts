/**
 * 3.8 Offline cash outbox (D-POS-11, D-122; audit A4).
 *
 * The till goes offline, takes cash, the sale is queued on the device; back
 * online, Connection › Sync now replays it: `pos_outbox.applied_at` is set, the
 * order is `paid`, and one cash `booking_transactions` row exists. Before
 * 20261231237000 the replay was refused `invalid` on every sync and, even
 * matched, only reserved and never settled.
 */
import type { Page } from "@playwright/test";

import { test, expect, prepareJourneysPage, signInJourneysStaff, skipUnlessFixture } from "./_harness";
import { isolatedService, JOURNEYS_TENANT_ID } from "./_isolated-db";
import { ensureHydrated } from "./_wire-seed";

skipUnlessFixture();

const PIZZA = "House pizza";

function rail(page: Page) {
  return page.getByRole("navigation", { name: /^(counter|mostrador|comptoir)$/i });
}

/** Devices (pairing) and Connection (the outbox) live under the cashier chip, not on the rail. */
async function openDevices(page: Page): Promise<void> {
  await page.getByRole("button", { name: /cashier and drawer/i }).first().click();
  await page.getByRole("menuitem", { name: /^devices$/i }).first().click();
  await expect(page.getByTestId("pos-device-registry")).toBeVisible({ timeout: 20_000 });
}

async function openConnection(page: Page): Promise<void> {
  await page.getByRole("button", { name: /cashier and drawer/i }).first().click();
  await page.getByRole("menuitem", { name: /^connection$/i }).first().click();
  await expect(page.getByTestId("pos-outbox-sync")).toBeVisible({ timeout: 20_000 });
}

async function openShift(page: Page): Promise<void> {
  await rail(page).getByRole("button", { name: /^(cash|caja|caisse)$/i }).click();
  const openingField = page.locator("#pos-shift-opening");
  const closeAndCount = page.locator("[data-pos-close-and-count]");
  await expect(openingField.or(closeAndCount).first()).toBeVisible({ timeout: 20_000 });
  if (await closeAndCount.count()) return;
  await openingField.fill("100.00");
  await page.locator("[data-pos-open-shift]").click();
  await expect(closeAndCount).toBeVisible({ timeout: 30_000 });
}

test("WIRE-3.8 offline cash queues on the device and Sync now settles it", async ({ page, context }, testInfo) => {
  test.setTimeout(300_000);
  await prepareJourneysPage(page);
  await signInJourneysStaff(page, "/admin/pos?mode=counter");
  await ensureHydrated(page, "[data-pos-tile]");
  await openShift(page);

  // Pair this till so the outbox has a device to replay under.
  await openDevices(page);
  const pair = page.getByTestId("pos-pair-this-till");
  await expect(pair).toBeVisible({ timeout: 20_000 });
  await pair.click();
  await expect
    .poll(async () => page.evaluate(() => window.localStorage.getItem("tulala.pos.device")), { timeout: 20_000 })
    .toMatch(/deviceId/);

  // A sale with one pizza on it.
  await rail(page).getByRole("button", { name: /^(sell|vender|vendre)$/i }).click();
  await ensureHydrated(page, "[data-pos-tile]");
  await page.getByRole("button", { name: PIZZA }).first().click();
  await expect(page).toHaveURL(/order=/, { timeout: 30_000 });
  const orderId = new URL(page.url()).searchParams.get("order")!;
  await expect(page.locator("[data-pos-line]")).toHaveCount(1, { timeout: 30_000 });

  // OFFLINE. Charge › Cash › Confirm queues instead of calling the server.
  await page.locator("[data-pos-charge]").first().click();
  await expect(page.getByRole("tab", { name: /^cash$/i })).toBeVisible({ timeout: 20_000 });
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await page.locator("[data-pos-confirm-cash]").click();
  await expect
    .poll(async () => page.evaluate(() => window.localStorage.getItem("tulala.pos.cashOutbox")), { timeout: 20_000 })
    .toContain(orderId);
  const queued = JSON.parse((await page.evaluate(() => window.localStorage.getItem("tulala.pos.cashOutbox"))) ?? "[]") as Array<{
    operationKey: string;
    command: Record<string, unknown>;
  }>;
  expect(queued.length).toBe(1);
  expect(queued[0].command).toMatchObject({ kind: "cash_collect", method: "cash", order_id: orderId, amount_cents: 1800 });
  await page.screenshot({ path: testInfo.outputPath("offline-queued.png") });

  const sb = isolatedService();
  const stillOpen = await sb.from("orders").select("status").eq("id", orderId).maybeSingle();
  expect((stillOpen.data as { status: string } | null)?.status).toBe("draft");

  // BACK ONLINE. Connection › Sync now.
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));
  await openConnection(page);
  const sync = page.getByTestId("pos-outbox-sync-button");
  await expect(sync).toBeEnabled({ timeout: 20_000 });
  await sync.click();
  await expect(page.getByTestId("pos-outbox-synced")).toBeVisible({ timeout: 40_000 });
  await page.screenshot({ path: testInfo.outputPath("synced.png") });

  // The rows.
  const outbox = await sb
    .from("pos_outbox")
    .select("operation_key, applied_at, result")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("operation_key", queued[0].operationKey)
    .maybeSingle();
  const row = outbox.data as { operation_key: string; applied_at: string | null; result: { stage?: string; transaction_id?: string } } | null;
  expect(row, "pos_outbox row for the queued key").toBeTruthy();
  expect(row!.applied_at, "applied_at is stamped").toBeTruthy();
  expect(row!.result.stage).toBe("settled");

  const order = await sb.from("orders").select("status").eq("id", orderId).maybeSingle();
  expect((order.data as { status: string } | null)?.status).toBe("paid");

  const txns = await sb.from("booking_transactions").select("id, status, provider, gross_amount_cents").eq("order_id", orderId);
  const paid = ((txns.data ?? []) as Array<{ id: string; status: string; provider: string; gross_amount_cents: number }>).filter((t) => t.status === "paid");
  expect(paid.length, "exactly one paid cash transaction").toBe(1);
  expect(paid[0].gross_amount_cents).toBe(1800);
  expect(row!.result.transaction_id).toBe(paid[0].id);

  const reservation = await sb
    .from("order_collection_reservations")
    .select("state, transaction_id")
    .eq("order_id", orderId)
    .eq("operation_key", queued[0].operationKey)
    .maybeSingle();
  expect((reservation.data as { state: string; transaction_id: string | null } | null)?.state).toBe("settled");

  // The device's queue is empty; a second sync has nothing to do.
  expect(await page.evaluate(() => window.localStorage.getItem("tulala.pos.cashOutbox"))).toBe("[]");
  testInfo.attach("rows", {
    body: JSON.stringify({ orderId, outbox: row, order: order.data, paid, reservation: reservation.data }, null, 2),
    contentType: "application/json",
  });
});
