/**
 * The Door mode of the point of sale, walked as a person does.
 *
 * ONE STORY, IN ORDER. An owner switches the Door mode on in Settings,
 * creates an event with one priced tier through the Events page, schedules a
 * night for it from the Sessions view, opens a drawer at the counter, enters
 * the point of sale from the top bar switch and picks Door. At the box office
 * they sell a ticket for cash and receive its code. At the gate they type
 * that code and the holder is admitted; they type it again and are refused as
 * already admitted; they type nonsense and are refused as not a ticket. A
 * walk-up pays cash at the gate and walks in. Every row the screens wrote is
 * read back: two paid orders through the till, two paid cash transactions
 * stamped with the drawer, two admissions minted off those orders and both
 * admitted once, two committed seats on the tier's pool.
 *
 * NOTHING IS HAND-INSERTED. The settings card, the Events page, the schedule
 * form, the counter's shift screen, the box office and the gate wrote every
 * row asserted on below.
 *
 * Serial, because each test is the next scene of the same night.
 */
import { test, expect, type Page } from "@playwright/test";

import { prepareJourneysPage, signInJourneysStaff } from "../cases/_harness";
import { isolatedService, JOURNEYS_TENANT_ID } from "../cases/_isolated-db";

test.describe.configure({ mode: "serial" });

const VENUE_ZONE = "America/Mexico_City";
const ADMIN_PREFIX = process.env.JOURNEYS_ADMIN_PREFIX ?? "";
const ADMIN_BASE = `${ADMIN_PREFIX}/admin`;
const stamp = Date.now();
const TITLE = `Door night ${stamp}`;
const TIER = "Entry";
const TIER_PRICE = "20";
const HOLDER = `Door holder ${stamp}`;
const WALKUP = `Door walk-up ${stamp}`;

/** The engine's words. None may reach the screen. */
const ENGINE_WORDS =
  /\b(already_admitted|unknown_admission|token_superseded|not_valid|bad_signature|engine_error|not_draft|no_contact|conflict|wrong_tenant)\b/;

test.beforeEach(async ({ page }) => {
  await prepareJourneysPage(page);
});

function venueLocalValue(at: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: VENUE_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}`;
}

type Night = { eventId: string; sessionId: string; poolId: string; variantId: string };
let night: Night | null = null;
let ticketCode: string | null = null;
let boxOrderId: string | null = null;

/** The top bar's own switch: the only desktop door into the point of sale. */
async function enterDoorFromTopBar(page: Page): Promise<void> {
  const control = page.getByRole("group", { name: /workspace or point of sale/i });
  await expect(control, "the top bar switch needs platform_settings.workspace_pos_enabled").toBeVisible({
    timeout: 30_000,
  });
  // With more than one mode the POS half opens a menu of modes.
  const posHalf = control.getByRole("button").nth(1);
  await posHalf.click();
  const menu = page.getByRole("menu");
  if (await menu.isVisible().catch(() => false)) {
    await menu.getByRole("menuitem", { name: /^(door|puerta|porte)$/i }).click();
  }
  await expect(page).toHaveURL(/\/admin\/pos\?mode=door/, { timeout: 30_000 });
  await expect(page.locator("[data-tulala-app-sidebar]")).toHaveCount(0);
  await expect(page.locator("[data-tulala-pos-chrome]")).toHaveCount(1);
  await expect(doorRail(page)).toBeVisible();
}

function doorRail(page: Page) {
  return page.getByRole("navigation", { name: /^(door|puerta|porte)$/i });
}

async function verdict(page: Page): Promise<{ key: string; text: string }> {
  const box = page.locator("[data-door-verdict]");
  await expect(box).toBeVisible({ timeout: 30_000 });
  const key = (await box.getAttribute("data-door-verdict")) ?? "";
  const text = (await box.innerText()).trim();
  expect(text, "the engine's own vocabulary must never reach the door").not.toMatch(ENGINE_WORDS);
  return { key, text };
}

async function typeCode(page: Page, code: string): Promise<void> {
  const field = page.locator("#door-scan");
  await expect(field).toBeVisible({ timeout: 30_000 });
  await field.fill(code);
  await page.getByRole("button", { name: /^(admit|admitir|admettre)$/i }).first().click();
}

async function waitForVerdict(page: Page, key: string): Promise<string> {
  await expect(page.locator(`[data-door-verdict="${key}"]`)).toBeVisible({ timeout: 30_000 });
  return (await verdict(page)).text;
}

test("Door mode is switched on in Settings, and the night exists through the interface", async ({
  page,
}, testInfo) => {
  test.setTimeout(300_000);

  // ── Settings › Point of sale: the Door switch.
  await signInJourneysStaff(page, `${ADMIN_BASE}/settings`);
  const card = page.getByTestId("pos-modes-card");
  await expect(card).toBeVisible({ timeout: 30_000 });
  const doorSwitch = card.getByRole("switch", { name: /door|puerta|porte/i });
  await expect(doorSwitch).toBeVisible({ timeout: 30_000 });
  await expect(doorSwitch, "a built mode's switch must be usable").toBeEnabled();
  if ((await doorSwitch.getAttribute("aria-checked")) !== "true") {
    await doorSwitch.click();
    await expect(doorSwitch).toHaveAttribute("aria-checked", "true", { timeout: 30_000 });
  }
  await page.screenshot({ path: testInfo.outputPath("01-settings-door-on.png"), fullPage: true });

  const db = isolatedService();
  const { data: agency, error: agencyErr } = await db
    .from("agencies")
    .select("settings")
    .eq("id", JOURNEYS_TENANT_ID)
    .maybeSingle();
  if (agencyErr) throw new Error(agencyErr.message);
  const modes = (agency as { settings?: { pos?: { locations?: { default?: { modes?: string[] } } } } } | null)
    ?.settings?.pos?.locations?.default?.modes;
  expect(modes, "the settings card must persist door").toContain("door");

  // ── The event, one priced tier, published. Events page.
  await page.goto(`${ADMIN_BASE}/events`);
  await page.getByLabel("Title").fill(TITLE);
  await page.getByRole("button", { name: /create draft/i }).click();
  await expect(page.getByRole("button", { name: TITLE })).toBeVisible({ timeout: 30_000 });
  await page.getByLabel("Tier name").fill(TIER);
  await page.getByLabel("Price").fill(TIER_PRICE);
  await page.getByRole("button", { name: /^add$/i }).click();
  await expect(page.getByText(TIER).first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Details" }).click();
  await page.getByRole("button", { name: /^publish$/i }).click();
  await expect(page.getByText(/\(live\)/)).toBeVisible({ timeout: 30_000 });

  const { data: event, error: eventErr } = await db
    .from("events")
    .select("id, offering_id, status")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("title", TITLE)
    .maybeSingle();
  if (eventErr) throw new Error(eventErr.message);
  expect(event, "the Events page created no event").not.toBeNull();
  const ev = event as { id: string; offering_id: string; status: string };
  expect(ev.status).toBe("published");

  const { data: variant, error: variantErr } = await db
    .from("talent_offering_variants")
    .select("id, pool_key, amount_cents")
    .eq("offering_id", ev.offering_id)
    .eq("label", TIER)
    .maybeSingle();
  if (variantErr) throw new Error(variantErr.message);
  const v = variant as { id: string; pool_key: string; amount_cents: number } | null;
  expect(v, "the tier must exist on the event's offering").not.toBeNull();
  expect(Number(v!.amount_cents)).toBe(2000);

  // ── The night, tonight, from the Sessions view.
  await page.goto(`${ADMIN_BASE}/appts`);
  await page.getByTestId("appointments-tab-sessions").click();
  await expect(page.getByText("Schedule a night")).toBeVisible({ timeout: 30_000 });
  const form = page.locator("form, div").filter({ hasText: "Schedule a night" }).last();
  await form.getByLabel("Event").selectOption({ label: TITLE });
  const starts = new Date(Date.now() + 2 * 60 * 60_000);
  starts.setUTCMinutes(0, 0, 0);
  const ends = new Date(starts.getTime() + 3 * 60 * 60_000);
  await form.getByLabel("Starts").fill(venueLocalValue(starts));
  await form.getByLabel("Ends").fill(venueLocalValue(ends));
  await form.getByLabel(TIER).fill("5");
  await form.getByRole("button", { name: /schedule this night/i }).click();
  await expect(page.getByText(/scheduled, with seats for 1 tier/i)).toBeVisible({ timeout: 30_000 });

  const { data: session, error: sessionErr } = await db
    .from("sessions")
    .select("id, status")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("event_id", ev.id)
    .maybeSingle();
  if (sessionErr) throw new Error(sessionErr.message);
  const sn = session as { id: string; status: string } | null;
  expect(sn, "the schedule form created no session").not.toBeNull();
  const { data: pool, error: poolErr } = await db
    .from("capacity_pools")
    .select("id, units_total, pool_key")
    .eq("subject_kind", "session_tier")
    .eq("subject_id", sn!.id)
    .eq("pool_key", v!.pool_key)
    .maybeSingle();
  if (poolErr) throw new Error(poolErr.message);
  const p = pool as { id: string; units_total: number } | null;
  expect(p, "the night has no pool for the tier").not.toBeNull();
  expect(Number(p!.units_total)).toBe(5);

  night = { eventId: ev.id, sessionId: sn!.id, poolId: p!.id, variantId: v!.id };
});

test("a drawer is open at the counter, so the door's cash has somewhere to go", async ({ page }) => {
  test.setTimeout(180_000);
  await signInJourneysStaff(page, `${ADMIN_BASE}/pos?mode=counter`);
  const rail = page.getByRole("navigation", { name: /^(counter|mostrador|comptoir)$/i });
  await expect(rail).toBeVisible({ timeout: 30_000 });
  await rail.getByRole("button", { name: /^(shifts|turnos|quarts)$/i }).click();
  const openingField = page.locator("#pos-shift-opening");
  const countedField = page.locator("#pos-shift-counted");
  await expect(openingField.or(countedField).first()).toBeVisible({ timeout: 20_000 });
  if (await countedField.count()) {
    // A drawer is already open (another journey's, or the last run's). Use it:
    // the transaction rows below are asserted against whichever shift is open.
    return;
  }
  await openingField.fill("100.00");
  await page.getByRole("button", { name: /open the shift/i }).click();
  await expect(countedField, "the shift must actually open").toBeVisible({ timeout: 30_000 });
});

test("box office: a ticket is sold for cash through the till and issued with its code", async ({
  page,
}, testInfo) => {
  test.setTimeout(240_000);
  expect(night, "the night was not created").not.toBeNull();
  const n = night!;

  await signInJourneysStaff(page, ADMIN_BASE);
  await enterDoorFromTopBar(page);
  await page.screenshot({ path: testInfo.outputPath("02-door-gate-sessions.png"), fullPage: true });
  await expect(page.locator("[data-door-zone]")).toHaveAttribute("data-door-zone", VENUE_ZONE);

  await doorRail(page).getByRole("button", { name: /^(box office|taquilla|billetterie)$/i }).click();
  await page.locator(`[data-door-session="${n.sessionId}"]`).first().click();
  const panel = page.locator('[data-door-sale="box"]');
  await expect(panel).toBeVisible({ timeout: 30_000 });
  await panel.locator("[data-door-tier]").selectOption(n.variantId);
  await panel.locator("[data-door-holder-name]").fill(HOLDER);
  await panel.locator("[data-door-email]").fill(`door-holder-${stamp}@impronta.test`);
  await panel.getByRole("button", { name: /open the sale|abrir la venta|ouvrir la vente/i }).click();
  await expect(page.getByRole("tab", { name: /^(cash|efectivo|espèces)$/i })).toBeVisible({ timeout: 30_000 });
  await expect(panel).toContainText("$20.00");
  await page.screenshot({ path: testInfo.outputPath("03-box-office-sale-open.png"), fullPage: true });
  await panel.getByRole("button", { name: /take cash|cobrar en efectivo|encaisser en espèces/i }).click();

  const issued = panel.locator("[data-door-issued]");
  await expect(issued).toBeVisible({ timeout: 45_000 });
  const code = (await issued.locator("[data-door-code]").first().innerText()).trim();
  expect(code, "the issued ticket must carry a signed code").toMatch(/^adm1\./);
  ticketCode = code;
  const receiptHref = await panel.locator("[data-pos-receipt-link]").getAttribute("href");
  expect(receiptHref, "the sale must have a receipt").toMatch(/\/r\/[A-Za-z0-9]{16,}/);
  await page.screenshot({ path: testInfo.outputPath("04-box-office-issued.png"), fullPage: true });

  // The rows the box office wrote.
  const db = isolatedService();
  const { data: adm, error: admErr } = await db
    .from("admissions")
    .select("id, order_line_id, session_id, holder_name, party_size, admitted_count, status")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("session_id", n.sessionId)
    .eq("holder_name", HOLDER)
    .maybeSingle();
  if (admErr) throw new Error(admErr.message);
  const a = adm as { id: string; order_line_id: string | null; admitted_count: number; status: string } | null;
  expect(a, "the box office must mint an admission").not.toBeNull();
  expect(a!.order_line_id, "a box office ticket is minted off an order line").not.toBeNull();
  expect(Number(a!.admitted_count)).toBe(0);
  expect(a!.status).toBe("valid");
  const { data: line, error: lineErr } = await db
    .from("order_lines")
    .select("order_id, variant_id, session_id")
    .eq("id", a!.order_line_id!)
    .maybeSingle();
  if (lineErr) throw new Error(lineErr.message);
  const l = line as { order_id: string; variant_id: string | null } | null;
  expect(l!.variant_id).toBe(n.variantId);
  boxOrderId = l!.order_id;
  const { data: order, error: orderErr } = await db
    .from("orders")
    .select("id, status, total_cents, source_channel, source_page")
    .eq("id", boxOrderId)
    .maybeSingle();
  if (orderErr) throw new Error(orderErr.message);
  const o = order as { status: string; total_cents: number; source_channel: string; source_page: string } | null;
  expect(o!.status).toBe("paid");
  expect(Number(o!.total_cents)).toBe(2000);
  expect(o!.source_channel).toBe("pos");
  expect(o!.source_page).toBe("door");
});

test("gate: the code admits once, is refused the second time, and nonsense is not a ticket", async ({
  page,
}, testInfo) => {
  test.setTimeout(240_000);
  expect(night, "the night was not created").not.toBeNull();
  expect(ticketCode, "no ticket was issued").not.toBeNull();
  const n = night!;

  await signInJourneysStaff(page, ADMIN_BASE);
  await enterDoorFromTopBar(page);
  await page.locator(`[data-door-session="${n.sessionId}"]`).first().click();
  await expect(page.locator("#door-scan")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("[data-door-counts]")).toContainText(/\b1 expected\b/);
  await expect(page.locator("[data-door-list]")).toContainText(HOLDER);

  await typeCode(page, ticketCode!);
  const first = await waitForVerdict(page, "admitted");
  expect(first).toMatch(/^In\./);
  await expect(page.locator("[data-door-counts]")).toContainText(/\b1 in\b/);
  await page.screenshot({ path: testInfo.outputPath("05-gate-admitted.png"), fullPage: true });

  await typeCode(page, ticketCode!);
  const second = await waitForVerdict(page, "alreadyIn");
  expect(second).toMatch(/already admitted/i);
  await page.screenshot({ path: testInfo.outputPath("06-gate-already-admitted.png"), fullPage: true });

  await typeCode(page, `not-a-ticket-${stamp}`);
  const third = await waitForVerdict(page, "forged");
  expect(third).toMatch(/not a valid ticket/i);
  await page.screenshot({ path: testInfo.outputPath("07-gate-forged.png"), fullPage: true });

  const db = isolatedService();
  const { data: adm, error: admErr } = await db
    .from("admissions")
    .select("admitted_count, party_size, seated_at")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("session_id", n.sessionId)
    .eq("holder_name", HOLDER)
    .maybeSingle();
  if (admErr) throw new Error(admErr.message);
  const a = adm as { admitted_count: number; party_size: number; seated_at: string | null };
  expect(Number(a.admitted_count), "one admission, not two").toBe(1);
  expect(a.seated_at).not.toBeNull();
});

test("gate: a walk-up pays cash at the door and walks in", async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  expect(night, "the night was not created").not.toBeNull();
  const n = night!;

  await signInJourneysStaff(page, ADMIN_BASE);
  await enterDoorFromTopBar(page);
  await page.locator(`[data-door-session="${n.sessionId}"]`).first().click();
  const panel = page.locator('[data-door-sale="gate"]');
  await expect(panel).toBeVisible({ timeout: 30_000 });
  await panel.locator("[data-door-tier]").selectOption(n.variantId);
  await panel.locator("[data-door-holder-name]").fill(WALKUP);
  await panel.locator("[data-door-email]").fill(`door-walkup-${stamp}@impronta.test`);
  await panel.getByRole("button", { name: /open the sale|abrir la venta|ouvrir la vente/i }).click();
  await expect(page.getByRole("tab", { name: /^(cash|efectivo|espèces)$/i })).toBeVisible({ timeout: 30_000 });
  await panel.getByRole("button", { name: /take cash and admit|cobrar en efectivo y admitir|encaisser en espèces et admettre/i }).click();
  await expect(panel.locator("[data-door-issued]")).toBeVisible({ timeout: 45_000 });
  await waitForVerdict(page, "admitted");
  await expect(page.locator("[data-door-counts]")).toContainText(/\b2 in\b/);
  await expect(page.locator("[data-door-counts]")).toContainText(/\b2 expected\b/);
  await page.screenshot({ path: testInfo.outputPath("08-gate-walkup-admitted.png"), fullPage: true });

  // ── The rows: two paid orders, two paid cash transactions, two admissions
  //    each admitted once, two committed seats.
  const db = isolatedService();
  const { data: adms, error: admErr } = await db
    .from("admissions")
    .select("id, order_line_id, holder_name, admitted_count, party_size, status")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("session_id", n.sessionId)
    .order("created_at", { ascending: true });
  if (admErr) throw new Error(admErr.message);
  const rows = (adms ?? []) as Array<{ order_line_id: string | null; holder_name: string | null; admitted_count: number }>;
  expect(rows.map((r) => r.holder_name)).toEqual([HOLDER, WALKUP]);
  expect(rows.every((r) => Number(r.admitted_count) === 1 && r.order_line_id !== null)).toBe(true);

  const lineIds = rows.map((r) => r.order_line_id!);
  const { data: lines, error: lineErr } = await db.from("order_lines").select("id, order_id").in("id", lineIds);
  if (lineErr) throw new Error(lineErr.message);
  const orderIds = [...new Set(((lines ?? []) as Array<{ order_id: string }>).map((l) => l.order_id))];
  expect(orderIds).toHaveLength(2);
  expect(orderIds).toContain(boxOrderId);

  const { data: orders, error: orderErr } = await db
    .from("orders")
    .select("id, status, total_cents, source_channel, source_page")
    .in("id", orderIds);
  if (orderErr) throw new Error(orderErr.message);
  for (const o of (orders ?? []) as Array<{ status: string; total_cents: number; source_channel: string; source_page: string }>) {
    expect(o.status).toBe("paid");
    expect(Number(o.total_cents)).toBe(2000);
    expect(o.source_channel).toBe("pos");
    expect(o.source_page).toBe("door");
  }

  const { data: txs, error: txErr } = await db
    .from("booking_transactions")
    .select("order_id, status, amount_cents, provider, metadata")
    .in("order_id", orderIds)
    .eq("status", "paid");
  if (txErr) throw new Error(txErr.message);
  const paid = (txs ?? []) as Array<{ order_id: string; amount_cents: number; provider: string; metadata: Record<string, unknown> | null }>;
  expect(paid, "one paid transaction per order").toHaveLength(2);
  for (const t of paid) {
    expect(Number(t.amount_cents)).toBe(2000);
    expect(t.provider).toBe("manual");
    expect(t.metadata?.paid_via).toBe("cash");
  }
  const { data: openShift } = await db
    .from("pos_shifts")
    .select("id")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("status", "open")
    .maybeSingle();
  if (openShift) {
    for (const t of paid) expect(t.metadata?.shift_id, "cash is stamped with the open drawer").toBe((openShift as { id: string }).id);
  }

  const { data: allocs, error: allocErr } = await db
    .from("capacity_allocations")
    .select("id, state, units, order_line_id")
    .eq("pool_id", n.poolId)
    .eq("state", "committed");
  if (allocErr) throw new Error(allocErr.message);
  const committed = (allocs ?? []) as Array<{ units: number; order_line_id: string | null }>;
  expect(committed.reduce((s, a) => s + Number(a.units), 0), "two seats committed on the tier's pool").toBe(2);
  expect(new Set(committed.map((a) => a.order_line_id))).toEqual(new Set(lineIds));
});
