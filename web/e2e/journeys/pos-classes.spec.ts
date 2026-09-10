/**
 * The Appointments & Classes mode of the point of sale, walked from the till.
 *
 * ONE STORY, IN ORDER. The owner switches the mode on in Settings and enters
 * it from the top bar's own switch. A walk-in is booked onto a free slot and
 * pays cash at the till. That customer is checked in; a second desk that
 * opened the day earlier is refused for the stale screen. The same booking is
 * moved: onto a taken time (refused, naming who is busy), then onto a free
 * one (moved, person and booking together). A class night is created through
 * the interface for today; a walk-in takes a seat and pays cash; attendance
 * is marked on the roster and the row says Present. A second walk-in fills the
 * night; somebody is put on its list; offering a place while it is full is
 * refused in words; a seat is opened; the place is offered and taken, and the
 * person is on the roster.
 *
 * NOTHING IS HAND-INSERTED. Every row asserted on was written by a screen.
 * Database reads are checks on what the browser did.
 */
import { test, expect, type Page } from "@playwright/test";

import { prepareJourneysPage, signInJourneysStaff } from "../cases/_harness";
import { isolatedService, JOURNEYS_TENANT_ID } from "../cases/_isolated-db";

test.describe.configure({ mode: "serial" });

const ADMIN_PREFIX = process.env.JOURNEYS_ADMIN_PREFIX ?? "";
const VENUE_ZONE = "America/Mexico_City";
const stamp = Date.now();
const WALKIN = `walkin-${stamp}`;
const WALKIN_TWO = `walkin-two-${stamp}`;
const SEAT_ONE = `seat-one-${stamp}`;
const SEAT_TWO = `seat-two-${stamp}`;
const WAITER = `Ana Espera ${stamp}`;
const NIGHT_TITLE = `POS class ${stamp}`;

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
  const hour = get("hour") === "24" ? "00" : get("hour");
  return `${get("year")}-${get("month")}-${get("day")}T${hour}:${get("minute")}`;
}

async function openClasses(page: Page, extra = "") {
  await signInJourneysStaff(page, `${ADMIN_PREFIX}/admin/pos?mode=classes${extra}`);
  await expect(page.locator("[data-pos-classes-day]")).toBeVisible({ timeout: 45_000 });
}

/** Pick a <select> option by a fragment of its label. */
async function pickOption(page: Page, selector: string, fragment: string) {
  const select = page.locator(selector);
  await expect(select).toBeVisible({ timeout: 45_000 });
  const value = await select.locator("option").filter({ hasText: fragment }).first().getAttribute("value");
  expect(value, `no option containing "${fragment}"`).toBeTruthy();
  await select.selectOption(value!);
}

function rail(page: Page, name: RegExp) {
  return page.getByRole("navigation", { name: /appointments and classes/i }).getByRole("button", { name });
}

async function bookingByContact(contact: string) {
  const db = isolatedService();
  const { data, error } = await db
    .from("agency_bookings")
    .select("id, status, starts_at, ends_at, order_id, contact_name")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("contact_name", contact)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as { id: string; status: string; starts_at: string; ends_at: string | null; order_id: string | null } | null;
}

async function orderMoney(orderId: string) {
  const db = isolatedService();
  const { data: order, error } = await db.from("orders").select("id, status, total_cents, source_channel").eq("id", orderId).maybeSingle();
  if (error) throw new Error(error.message);
  const { data: txns, error: tErr } = await db
    .from("booking_transactions")
    .select("status, gross_amount_cents, paid_via, tendered_cents")
    .eq("order_id", orderId);
  if (tErr) throw new Error(tErr.message);
  const { data: holds, error: hErr } = await db
    .from("talent_holds")
    .select("starts_at, expires_at, talent_profile_id")
    .eq("operation_key", `order:${orderId}:reserve`);
  if (hErr) throw new Error(hErr.message);
  return {
    order: order as { status: string; total_cents: number; source_channel: string | null } | null,
    paid: ((txns ?? []) as Array<{ status: string; gross_amount_cents: number; paid_via: string | null; tendered_cents: number | null }>).filter((t) => t.status === "paid"),
    holds: (holds ?? []) as Array<{ starts_at: string; expires_at: string | null; talent_profile_id: string }>,
  };
}

let walkIn: { bookingId: string; orderId: string; startsAt: string } | null = null;
let walkInTwo: { bookingId: string; startsAt: string } | null = null;
let night: { title: string; sessionId: string; poolId: string; eventId: string } | null = null;

test("the owner switches Classes on in Settings and enters it from the top bar switch", async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  await signInJourneysStaff(page, `${ADMIN_PREFIX}/admin/settings`);
  const classesSwitch = page.getByRole("switch", { name: /classes/i });
  await expect(classesSwitch).toBeVisible({ timeout: 45_000 });
  if ((await classesSwitch.getAttribute("aria-checked")) !== "true") {
    await classesSwitch.click();
    await expect(classesSwitch).toHaveAttribute("aria-checked", "true", { timeout: 30_000 });
  }
  await page.screenshot({ path: testInfo.outputPath("settings-classes-on.png"), fullPage: true });

  const db = isolatedService();
  const { data: agency } = await db.from("agencies").select("settings").eq("id", JOURNEYS_TENANT_ID).maybeSingle();
  const modes = (agency as { settings?: { pos?: { locations?: { default?: { modes?: string[] } } } } } | null)?.settings?.pos?.locations?.default?.modes ?? [];
  expect(modes, "Settings did not persist the classes mode").toContain("classes");

  // THE DOOR: the top bar's Workspace / <mode> switch, its menu, the Classes row.
  await page.goto(`${ADMIN_PREFIX}/admin`);
  const group = page.getByRole("group", { name: /workspace or point of sale/i });
  await expect(group).toBeVisible({ timeout: 45_000 });
  await group.getByRole("button", { name: /counter|classes/i }).first().click();
  const menu = page.getByRole("menu", { name: /choose a point of sale mode/i });
  await expect(menu).toBeVisible({ timeout: 15_000 });
  await menu.getByRole("menuitem", { name: /^classes$/i }).click();
  await expect(page).toHaveURL(/mode=classes/, { timeout: 45_000 });
  await expect(page.locator("[data-tulala-app-sidebar]")).toHaveCount(0);
  await expect(rail(page, /^today$/i)).toBeVisible({ timeout: 45_000 });
  await expect(rail(page, /^sessions$/i)).toBeVisible();
  await expect(rail(page, /^walk-in$/i)).toBeVisible();
  await expect(rail(page, /^waitlist$/i)).toBeVisible();
  await expect(page.locator("[data-pos-classes-zone]")).toHaveAttribute("data-pos-classes-zone", VENUE_ZONE);
  await page.screenshot({ path: testInfo.outputPath("classes-today.png"), fullPage: true });
});

test("a walk-in is booked onto a free time and pays cash at the till", async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  await openClasses(page);
  await rail(page, /^walk-in$/i).click();
  await pickOption(page, "[data-pos-classes-service]", "Gel manicure");
  const slots = page.locator("[data-pos-classes-slots] button");
  await expect(slots.first()).toBeVisible({ timeout: 45_000 });
  const count = await slots.count();
  expect(count, "the walk-in needs at least two free times today for this story").toBeGreaterThanOrEqual(2);
  await slots.first().click();
  await page.locator("[data-pos-classes-name]").fill(WALKIN);
  await page.locator("[data-pos-classes-email]").fill(`${WALKIN}@impronta.test`);
  await page.locator("[data-pos-classes-book]").click();
  await expect(page.locator("[data-pos-classes-notice=done]")).toContainText(/booked for/i, { timeout: 45_000 });
  await page.screenshot({ path: testInfo.outputPath("walkin-booked.png"), fullPage: true });

  const booking = await bookingByContact(WALKIN);
  expect(booking, "the walk-in wrote no booking").not.toBeNull();
  expect(booking!.order_id).not.toBeNull();
  const before = await orderMoney(booking!.order_id!);
  expect(before.order?.status).toBe("pending_payment");
  expect(before.paid.length).toBe(0);
  // Pay in person: the person's time is committed (no expiry) before the money.
  expect(before.holds.length).toBeGreaterThanOrEqual(1);
  expect(before.holds[0]!.expires_at).toBeNull();

  // THE MONEY, through the Counter's own charge.
  const collect = page.locator("[data-pos-classes-collect]");
  await expect(collect).toContainText(/50\.00/);
  await collect.click();
  await expect(page.locator("[data-pos-classes-notice=done]")).toContainText(/paid/i, { timeout: 45_000 });
  await page.screenshot({ path: testInfo.outputPath("walkin-paid.png"), fullPage: true });

  const after = await orderMoney(booking!.order_id!);
  expect(after.order?.status).toBe("paid");
  expect(after.paid.length).toBe(1);
  expect(after.paid[0]!.gross_amount_cents).toBe(5000);
  expect(after.paid[0]!.paid_via).toBe("cash");
  walkIn = { bookingId: booking!.id, orderId: booking!.order_id!, startsAt: booking!.starts_at };

  // Today lists it, in arrival order, paid.
  await rail(page, /^today$/i).click();
  const row = page.locator(`[data-pos-classes-appointment="${booking!.id}"]`);
  await expect(row).toBeVisible({ timeout: 45_000 });
  await expect(row).toContainText(WALKIN);
  await expect(row).toContainText(/^(?!.*to collect)/);
  await expect(row.locator("[data-pos-classes-state]")).toHaveAttribute("data-pos-classes-state", "confirmed");
});

test("the customer is checked in; a stale desk is refused in words", async ({ page, context }, testInfo) => {
  test.setTimeout(240_000);
  expect(walkIn).not.toBeNull();
  const w = walkIn!;
  // Desk 1 opens the day first and will act second.
  await openClasses(page);
  const stale = page.locator(`[data-pos-classes-appointment="${w.bookingId}"]`);
  await expect(stale).toBeVisible({ timeout: 45_000 });

  // Desk 2 checks the customer in.
  const desk2 = await context.newPage();
  await prepareJourneysPage(desk2);
  await desk2.goto(`${ADMIN_PREFIX}/admin/pos?mode=classes`);
  const fresh = desk2.locator(`[data-pos-classes-appointment="${w.bookingId}"]`);
  await expect(fresh).toBeVisible({ timeout: 45_000 });
  await fresh.getByRole("button", { name: /check in/i }).click();
  await expect(desk2.locator("[data-pos-classes-notice=done]")).toContainText(/arrived/i, { timeout: 45_000 });
  await expect(fresh.locator("[data-pos-classes-state]")).toHaveAttribute("data-pos-classes-state", "in_progress", { timeout: 45_000 });
  await desk2.screenshot({ path: testInfo.outputPath("checked-in.png"), fullPage: true });
  const checked = await bookingByContact(WALKIN);
  expect(checked?.status).toBe("in_progress");

  // Desk 1, still showing Confirmed, taps Check in: refused, nothing changes.
  await stale.getByRole("button", { name: /check in/i }).click();
  const alert = page.locator("[data-pos-classes-notice=refused]");
  await expect(alert).toContainText(/changed since you opened it/i, { timeout: 45_000 });
  await expect(alert).not.toContainText(/changed_since_opened|not_found|unavailable/);
  await page.screenshot({ path: testInfo.outputPath("checkin-stale-refused.png"), fullPage: true });
  expect((await bookingByContact(WALKIN))?.status).toBe("in_progress");
  await desk2.close();
});

test("a move onto a taken time is refused naming who is busy; a move onto a free time moves person and booking together", async ({ page }, testInfo) => {
  test.setTimeout(300_000);
  const w = walkIn!;
  // A second walk-in on the same person takes another free time today.
  await openClasses(page);
  await rail(page, /^walk-in$/i).click();
  await pickOption(page, "[data-pos-classes-service]", "Gel manicure");
  const slots = page.locator("[data-pos-classes-slots] button");
  await expect(slots.first()).toBeVisible({ timeout: 45_000 });
  await slots.first().click();
  await page.locator("[data-pos-classes-name]").fill(WALKIN_TWO);
  await page.locator("[data-pos-classes-book]").click();
  await expect(page.locator("[data-pos-classes-notice=done]")).toContainText(/booked for/i, { timeout: 45_000 });
  const second = await bookingByContact(WALKIN_TWO);
  expect(second).not.toBeNull();
  walkInTwo = { bookingId: second!.id, startsAt: second!.starts_at };

  // Move the first onto the second's time: the same person is busy.
  await rail(page, /^today$/i).click();
  const row = page.locator(`[data-pos-classes-appointment="${w.bookingId}"]`);
  await expect(row).toBeVisible({ timeout: 45_000 });
  await row.getByRole("button", { name: /move it/i }).click();
  const input = row.locator("[data-pos-classes-move-input]");
  await input.fill(venueLocalValue(new Date(second!.starts_at)));
  await row.getByRole("button", { name: /^move it$/i }).click();
  const alert = page.locator("[data-pos-classes-notice=refused]");
  await expect(alert).toContainText(/is already booked at that time/i, { timeout: 45_000 });
  await expect(alert).toContainText(/QA Journeys Talent/);
  await page.screenshot({ path: testInfo.outputPath("move-person-busy.png"), fullPage: true });
  const unchanged = await bookingByContact(WALKIN);
  expect(unchanged?.starts_at).toBe(w.startsAt);

  // Move it onto a free time tomorrow: booking and hold move together.
  const target = new Date(Date.parse(w.startsAt) + 24 * 60 * 60_000);
  await input.fill(venueLocalValue(target));
  await row.getByRole("button", { name: /^move it$/i }).click();
  await expect(page.locator("[data-pos-classes-notice=done]")).toContainText(/moved to/i, { timeout: 45_000 });
  await page.screenshot({ path: testInfo.outputPath("moved.png"), fullPage: true });
  const moved = await bookingByContact(WALKIN);
  expect(Date.parse(moved!.starts_at)).toBe(target.getTime());
  const money = await orderMoney(w.orderId);
  expect(money.holds.length).toBeGreaterThanOrEqual(1);
  expect(Date.parse(money.holds[0]!.starts_at)).toBe(target.getTime());
  // And it left today's list.
  await expect(row).toHaveCount(0, { timeout: 45_000 });
});

test("a class night for today is created through the interface, a walk-in takes a seat for cash, and attendance is marked", async ({ page }, testInfo) => {
  test.setTimeout(300_000);
  await signInJourneysStaff(page, `${ADMIN_PREFIX}/admin/events`);
  await page.getByLabel("Title").fill(NIGHT_TITLE);
  await page.getByRole("button", { name: /create draft/i }).click();
  await expect(page.getByRole("button", { name: NIGHT_TITLE })).toBeVisible({ timeout: 30_000 });
  await page.getByLabel("Tier name").fill("Seat");
  await page.getByLabel("Price").fill("5");
  await page.getByRole("button", { name: /^add$/i }).click();
  await expect(page.getByText("Seat").first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Details" }).click();
  await page.getByRole("button", { name: /^publish$/i }).click();
  await expect(page.getByText(/\(live\)/)).toBeVisible({ timeout: 30_000 });

  const db = isolatedService();
  const { data: event } = await db.from("events").select("id").eq("tenant_id", JOURNEYS_TENANT_ID).eq("title", NIGHT_TITLE).maybeSingle();
  expect(event).not.toBeNull();

  await page.goto(`${ADMIN_PREFIX}/admin/appts`);
  await page.getByTestId("appointments-tab-sessions").click();
  await expect(page.getByText("Schedule a night")).toBeVisible({ timeout: 30_000 });
  const form = page.locator("form, div").filter({ hasText: "Schedule a night" }).last();
  await form.getByLabel("Event").selectOption({ label: NIGHT_TITLE });
  // Later today at the venue: two hours from now, on the hour.
  const starts = new Date(Date.now() + 2 * 60 * 60_000);
  starts.setUTCMinutes(0, 0, 0);
  const ends = new Date(starts.getTime() + 60 * 60_000);
  await form.getByLabel("Starts").fill(venueLocalValue(starts));
  await form.getByLabel("Ends").fill(venueLocalValue(ends));
  await form.getByLabel("Seat").fill("2");
  await form.getByRole("button", { name: /schedule this night/i }).click();
  await expect(page.getByText(/scheduled, with seats for 1 tier/i)).toBeVisible({ timeout: 30_000 });

  const { data: session } = await db.from("sessions").select("id").eq("tenant_id", JOURNEYS_TENANT_ID).eq("event_id", (event as { id: string }).id).maybeSingle();
  expect(session).not.toBeNull();
  const { data: pool } = await db.from("capacity_pools").select("id, pool_key").eq("subject_kind", "session_tier").eq("subject_id", (session as { id: string }).id).maybeSingle();
  expect(pool).not.toBeNull();
  night = { title: NIGHT_TITLE, sessionId: (session as { id: string }).id, poolId: (pool as { id: string }).id, eventId: (event as { id: string }).id };

  // Sessions from the till: the night, 0 of 2 taken.
  await openClasses(page);
  await rail(page, /^sessions$/i).click();
  const card = page.locator(`[data-pos-classes-session="${night.sessionId}"]`);
  await expect(card).toBeVisible({ timeout: 45_000 });
  await expect(card.locator("[data-pos-classes-seats]")).toContainText("0 of 2");
  await page.screenshot({ path: testInfo.outputPath("sessions-empty-roster.png"), fullPage: true });

  // Book a walk-in seat from the card, pay $5 cash.
  await card.getByRole("button", { name: /book a walk-in seat/i }).click();
  await expect(page.locator("[data-pos-classes-session-pick]")).toHaveValue(night.sessionId, { timeout: 30_000 });
  await page.locator("[data-pos-classes-name]").fill(SEAT_ONE);
  await page.locator("[data-pos-classes-email]").fill(`${SEAT_ONE}@impronta.test`);
  await page.locator("[data-pos-classes-book]").click();
  await expect(page.locator("[data-pos-classes-notice=done]")).toContainText(/seat held/i, { timeout: 45_000 });
  const collect = page.locator("[data-pos-classes-collect]");
  await expect(collect).toContainText(/5\.00/);
  await collect.click();
  await expect(page.locator("[data-pos-classes-notice=done]")).toContainText(/paid/i, { timeout: 45_000 });
  await page.screenshot({ path: testInfo.outputPath("seat-paid.png"), fullPage: true });

  const { data: admissions, error } = await db
    .from("admissions")
    .select("id, party_size, admitted_count, status, allocation_id, order_line_id")
    .eq("session_id", night.sessionId);
  if (error) throw new Error(error.message);
  expect((admissions ?? []).length, "the paid seat minted no admission").toBe(1);
  const admission = admissions![0] as { id: string; admitted_count: number; allocation_id: string | null; order_line_id: string };
  expect(admission.admitted_count).toBe(0);
  expect(admission.allocation_id).not.toBeNull();
  const { data: alloc } = await db.from("capacity_allocations").select("state, pool_id, units").eq("id", admission.allocation_id!).maybeSingle();
  expect((alloc as { state: string; pool_id: string } | null)?.state).toBe("committed");
  expect((alloc as { pool_id: string } | null)?.pool_id).toBe(night.poolId);
  const { data: line } = await db.from("order_lines").select("order_id").eq("id", admission.order_line_id).maybeSingle();
  const money = await orderMoney((line as { order_id: string }).order_id);
  expect(money.order?.status).toBe("paid");
  expect(money.paid[0]?.paid_via).toBe("cash");
  expect(money.paid[0]?.gross_amount_cents).toBe(500);

  // The roster names the walk-in through the order's customer; attendance is marked.
  await rail(page, /^sessions$/i).click();
  await expect(card.locator("[data-pos-classes-seats]")).toContainText("1 of 2", { timeout: 45_000 });
  const rosterRow = card.locator(`[data-pos-classes-roster="${admission.id}"]`);
  await expect(rosterRow).toContainText(SEAT_ONE);
  await rosterRow.getByRole("button", { name: /mark present/i }).click();
  await expect(rosterRow).toHaveAttribute("data-pos-classes-admitted", "1", { timeout: 45_000 });
  await expect(rosterRow).toContainText(/present/i);
  await page.screenshot({ path: testInfo.outputPath("attendance-marked.png"), fullPage: true });
  const { data: marked } = await db.from("admissions").select("admitted_count, seated_at").eq("id", admission.id).maybeSingle();
  expect((marked as { admitted_count: number } | null)?.admitted_count).toBe(1);
});

test("the night fills, somebody joins its list, a place that does not exist is refused, a seat is opened, the place is offered and taken", async ({ page }, testInfo) => {
  test.setTimeout(360_000);
  const n = night!;
  await openClasses(page);
  await rail(page, /^walk-in$/i).click();
  await page.getByRole("button", { name: /a seat in a session/i }).click();
  await page.locator("[data-pos-classes-session-pick]").selectOption(n.sessionId);
  await page.locator("[data-pos-classes-name]").fill(SEAT_TWO);
  await page.locator("[data-pos-classes-book]").click();
  await expect(page.locator("[data-pos-classes-notice=done]")).toContainText(/seat held/i, { timeout: 45_000 });
  await page.locator("[data-pos-classes-collect]").click();
  await expect(page.locator("[data-pos-classes-notice=done]")).toContainText(/paid/i, { timeout: 45_000 });

  // Full, from the Sessions card; the door to the queue.
  await rail(page, /^sessions$/i).click();
  const card = page.locator(`[data-pos-classes-session="${n.sessionId}"]`);
  await expect(card.locator("[data-pos-classes-seats]")).toContainText(/2 of 2.*full/i, { timeout: 45_000 });
  await card.getByRole("button", { name: /put somebody on the list/i }).click();
  const queue = page.locator(`[data-pos-classes-queue="${n.sessionId}"]`);
  await expect(queue).toBeVisible({ timeout: 45_000 });
  await queue.locator("[data-pos-classes-join-name]").fill(WAITER);
  await queue.getByRole("button", { name: /add to the list/i }).click();
  await expect(page.locator("[data-pos-classes-notice=done]")).toContainText(/is on the list/i, { timeout: 45_000 });
  await page.screenshot({ path: testInfo.outputPath("waitlist-joined.png"), fullPage: true });

  // A THIRD walk-in seat is refused by the engine at the money step.
  await rail(page, /^walk-in$/i).click();
  await page.getByRole("button", { name: /a seat in a session/i }).click();
  await expect(page.locator("[data-pos-classes-session-pick] option")).not.toContainText([n.title], { timeout: 45_000 });

  // Offering a place while the night is full: refused, in words.
  await rail(page, /^waitlist$/i).click();
  const entry = queue.locator("[data-pos-classes-entry]").filter({ hasText: WAITER });
  await entry.getByRole("button", { name: /offer the place/i }).click();
  const alert = page.locator("[data-pos-classes-notice=refused]");
  await expect(alert).toContainText(/no free place right now/i, { timeout: 45_000 });
  await page.screenshot({ path: testInfo.outputPath("promote-refused-full.png"), fullPage: true });

  // Open a seat on the night (the Events page), then offer and take it.
  await signInJourneysStaff(page, `${ADMIN_PREFIX}/admin/events`);
  await page.getByRole("button", { name: n.title }).click();
  await page.getByRole("button", { name: "Sessions", exact: true }).click();
  const seatsBox = page.getByLabel("Seats for Seat");
  await expect(seatsBox).toHaveValue("2", { timeout: 30_000 });
  await seatsBox.fill("3");
  await page.getByRole("button", { name: /^save$/i }).click();
  const db = isolatedService();
  await expect.poll(async () => {
    const { data } = await db.from("capacity_pools").select("units_total").eq("id", n.poolId).maybeSingle();
    return Number((data as { units_total: number } | null)?.units_total ?? -1);
  }, { timeout: 30_000 }).toBe(3);

  await openClasses(page);
  await rail(page, /^waitlist$/i).click();
  const entry2 = page.locator(`[data-pos-classes-queue="${n.sessionId}"] [data-pos-classes-entry]`).filter({ hasText: WAITER });
  await entry2.getByRole("button", { name: /offer the place/i }).click();
  await expect(page.locator("[data-pos-classes-notice=done]")).toContainText(/offered to/i, { timeout: 45_000 });
  await expect(entry2).toHaveAttribute("data-pos-classes-entry-state", "offered", { timeout: 45_000 });
  await page.screenshot({ path: testInfo.outputPath("promoted.png"), fullPage: true });
  await entry2.getByRole("button", { name: /they took it/i }).click();
  await expect(entry2).toHaveAttribute("data-pos-classes-entry-state", "accepted", { timeout: 45_000 });

  const { data: rows } = await db
    .from("session_waitlist_entries")
    .select("customer_name, status, accepted_allocation_id")
    .eq("session_id", n.sessionId);
  const ana = (rows ?? []).find((r) => (r as { customer_name: string }).customer_name === WAITER) as { status: string; accepted_allocation_id: string | null } | undefined;
  expect(ana?.status).toBe("accepted");
  expect(ana?.accepted_allocation_id).not.toBeNull();
  const { data: alloc } = await db.from("capacity_allocations").select("state").eq("id", ana!.accepted_allocation_id!).maybeSingle();
  expect((alloc as { state: string } | null)?.state).toBe("committed");

  // On the roster, from the list; the night is full again (3 of 3).
  await rail(page, /^sessions$/i).click();
  const cardAgain = page.locator(`[data-pos-classes-session="${n.sessionId}"]`);
  await expect(cardAgain.locator("[data-pos-classes-seats]")).toContainText(/3 of 3/, { timeout: 45_000 });
  await expect(cardAgain.locator('[data-pos-classes-roster="waitlist_place"]')).toContainText(WAITER);
  await page.screenshot({ path: testInfo.outputPath("roster-with-waitlist-place.png"), fullPage: true });
});
