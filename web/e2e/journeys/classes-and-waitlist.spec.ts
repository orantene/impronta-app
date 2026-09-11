/**
 * Classes and the waitlist, walked from the sidebar.
 *
 * ONE STORY, IN ORDER. An operator creates a class night through the
 * interface (an event with one $0 tier, then "Schedule a night" on the
 * Appointments page), two guests take its two seats on the public event page,
 * the night reads full on the schedule, the operator opens its queue from that
 * row and puts two people on it, is refused when they try to offer a place
 * that does not exist, opens one more seat on the night, offers it, watches
 * the first person take it, is refused again for the second person BECAUSE
 * the accepted place holds a real seat, gives that seat back, and hands it to
 * the second person.
 *
 * NOTHING IS HAND-INSERTED. Every row asserted on below was written by a
 * screen: the Events page, the schedule form, the ticket picker, the waitlist
 * card. Database reads are checks on what the browser did.
 *
 * Serial, because each test is the next scene of the same night.
 */
import { test, expect, type Page } from "@playwright/test";

import { prepareJourneysPage, signInJourneysStaff } from "../cases/_harness";
import { isolatedService, JOURNEYS_TENANT_ID } from "../cases/_isolated-db";

test.describe.configure({ mode: "serial" });

const VENUE_ZONE = "America/Mexico_City";
const ADMIN_PREFIX = process.env.JOURNEYS_ADMIN_PREFIX ?? "";
const PUBLIC_PREFIX = process.env.JOURNEYS_PUBLIC_PREFIX ?? "";

test.beforeEach(async ({ page }) => {
  await prepareJourneysPage(page);
});

/** What a `datetime-local` box needs for an instant, on the venue's clock. */
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

/** The one night this file is about, once the schedule form has created it. */
type Night = {
  readonly eventId: string;
  readonly slug: string;
  readonly title: string;
  readonly sessionId: string;
  readonly poolId: string;
};

const stamp = Date.now();
const TITLE = `Prove class ${stamp}`;
let night: Night | null = null;

async function seatsOf(poolId: string) {
  const db = isolatedService();
  const { data: pool, error } = await db
    .from("capacity_pools")
    .select("units_total")
    .eq("id", poolId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const { data: allocs, error: allocErr } = await db
    .from("capacity_allocations")
    .select("id, units, state, order_line_id")
    .eq("pool_id", poolId)
    .neq("state", "released");
  if (allocErr) throw new Error(allocErr.message);
  return {
    total: Number((pool as { units_total: number } | null)?.units_total ?? -1),
    allocations: (allocs ?? []) as Array<{
      id: string;
      units: number;
      state: string;
      order_line_id: string | null;
    }>,
  };
}

async function waitlistRows(sessionId: string) {
  const db = isolatedService();
  const { data, error } = await db
    .from("session_waitlist_entries")
    .select("id, customer_name, status, offered_at, offer_expires_at, accepted_allocation_id")
    .eq("session_id", sessionId)
    .order("joined_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<{
    id: string;
    customer_name: string;
    status: string;
    offered_at: string | null;
    offer_expires_at: string | null;
    accepted_allocation_id: string | null;
  }>;
}

/** Take one $0 seat on the public event page, as a guest. */
async function takeASeat(page: Page, slug: string, sessionId: string, marker: string) {
  await page.goto(`${PUBLIC_PREFIX}/events/${slug}`, { waitUntil: "domcontentloaded" });
  const picker = page.locator("[data-ticket-picker=root]");
  await expect(picker).toBeVisible({ timeout: 30_000 });
  const nightRadio = picker.locator(`input[name=night][value="${sessionId}"]`);
  await expect(nightRadio).toBeEnabled({ timeout: 30_000 });
  await nightRadio.check();
  await picker.locator("input[name=tier]").first().check();
  await picker.locator("input[type=email]").fill(`${marker}@impronta.test`);
  await picker.locator("input[autocomplete=name]").fill(marker);
  await picker.getByRole("button", { name: /get your ticket/i }).click();
  await expect(page).toHaveURL(/\/r\/[A-Za-z0-9]+/, { timeout: 45_000 });
}

function scheduleRow(page: Page) {
  return page.locator("[data-testid=schedule-nights] tr").filter({ hasText: TITLE });
}

test("an operator creates a class night through the interface, and it is on the schedule", async ({
  page,
}, testInfo) => {
  test.setTimeout(240_000);

  // ── The event, with one free tier, published. Events page, as an operator.
  await signInJourneysStaff(page, `${ADMIN_PREFIX}/admin/events`);
  await page.getByLabel("Title").fill(TITLE);
  await page.getByRole("button", { name: /create draft/i }).click();
  await expect(page.getByRole("button", { name: TITLE })).toBeVisible({ timeout: 30_000 });
  // Creating lands on Tickets. One tier, free.
  await page.getByLabel("Tier name").fill("Seat");
  await page.getByLabel("Price").fill("0");
  await page.getByRole("button", { name: /^add$/i }).click();
  await expect(page.getByText("Seat").first()).toBeVisible({ timeout: 30_000 });
  await page.getByRole("button", { name: "Details" }).click();
  await page.getByRole("button", { name: /^publish$/i }).click();
  await expect(page.getByText(/\(live\)/)).toBeVisible({ timeout: 30_000 });

  const db = isolatedService();
  const { data: event, error: eventErr } = await db
    .from("events")
    .select("id, slug, status")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("title", TITLE)
    .maybeSingle();
  if (eventErr) throw new Error(eventErr.message);
  expect(event, "the Events page created no event").not.toBeNull();
  const ev = event as { id: string; slug: string; status: string };
  expect(ev.status).toBe("published");

  // ── The night, from the Appointments page's own Schedule view.
  await page.goto(`${ADMIN_PREFIX}/admin/appts`);
  await page.getByTestId("appointments-tab-sessions").click();
  await expect(page.getByText("Schedule a night")).toBeVisible({ timeout: 30_000 });
  const form = page.locator("form, div").filter({ hasText: "Schedule a night" }).last();
  await form.getByLabel("Event").selectOption({ label: TITLE });
  const starts = new Date(Date.now() + 26 * 60 * 60_000);
  starts.setUTCMinutes(0, 0, 0);
  const ends = new Date(starts.getTime() + 2 * 60 * 60_000);
  await form.getByLabel("Starts").fill(venueLocalValue(starts));
  await form.getByLabel("Ends").fill(venueLocalValue(ends));
  await form.getByLabel("Seat").fill("2");
  await form.getByRole("button", { name: /schedule this night/i }).click();
  await expect(page.getByText(/scheduled, with seats for 1 tier/i)).toBeVisible({ timeout: 30_000 });

  // ON THE SCHEDULE, AS ITSELF. This page used to say "No series yet" over the
  // night it had just created, because the loader grouped every session under
  // a series and a one-off night belongs to none.
  const row = scheduleRow(page);
  await expect(row).toHaveCount(1, { timeout: 30_000 });
  // The board's seats cell: booked / places. Nothing sold yet, two places.
  await expect(row).toContainText("0 / 2");
  await expect(row).toContainText("Scheduled");
  await page.screenshot({ path: testInfo.outputPath("night-scheduled.png"), fullPage: true });

  const { data: session, error: sessionErr } = await db
    .from("sessions")
    .select("id, series_id, event_id, offering_id, starts_at, status")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("event_id", ev.id)
    .maybeSingle();
  if (sessionErr) throw new Error(sessionErr.message);
  expect(session, "the schedule form created no session").not.toBeNull();
  const sn = session as { id: string; series_id: string | null; offering_id: string | null; status: string };
  expect(sn.series_id).toBeNull();
  expect(sn.offering_id, "a night with no offering cannot be sold").not.toBeNull();
  expect(sn.status).toBe("scheduled");

  const { data: pool, error: poolErr } = await db
    .from("capacity_pools")
    .select("id, units_total, pool_key")
    .eq("subject_kind", "session_tier")
    .eq("subject_id", sn.id)
    .maybeSingle();
  if (poolErr) throw new Error(poolErr.message);
  expect(pool, "the night has no seats").not.toBeNull();
  const p = pool as { id: string; units_total: number };
  expect(Number(p.units_total)).toBe(2);

  night = { eventId: ev.id, slug: ev.slug, title: TITLE, sessionId: sn.id, poolId: p.id };
});

test("two guests fill the night on the public page, and the schedule says so", async ({
  page,
}, testInfo) => {
  test.setTimeout(240_000);
  expect(night, "the night was not created").not.toBeNull();
  const n = night!;

  await takeASeat(page, n.slug, n.sessionId, `seat-one-${stamp}`);
  await takeASeat(page, n.slug, n.sessionId, `seat-two-${stamp}`);

  const seats = await seatsOf(n.poolId);
  expect(seats.total).toBe(2);
  const committed = seats.allocations.filter((a) => a.state === "committed");
  expect(committed.reduce((s, a) => s + a.units, 0), "two free tickets did not take two seats").toBe(2);

  // A THIRD GUEST IS REFUSED, by the engine, in a sentence. The picker does
  // not pre-count seats; "sold out" is the reserve's own answer when the
  // third person actually tries, which is the only count that cannot lie.
  await page.goto(`${PUBLIC_PREFIX}/events/${n.slug}`, { waitUntil: "domcontentloaded" });
  const picker = page.locator("[data-ticket-picker=root]");
  await expect(picker).toBeVisible({ timeout: 30_000 });
  await picker.locator(`input[name=night][value="${n.sessionId}"]`).check();
  await picker.locator("input[name=tier]").first().check();
  await picker.locator("input[type=email]").fill(`seat-three-${stamp}@impronta.test`);
  await picker.locator("input[autocomplete=name]").fill(`seat-three-${stamp}`);
  await picker.getByRole("button", { name: /get your ticket/i }).click();
  await expect(page.locator("[data-ticket-picker=refusal]")).toContainText(/sold out/i, {
    timeout: 45_000,
  });
  await page.screenshot({ path: testInfo.outputPath("public-sold-out.png"), fullPage: true });
  expect(
    (await seatsOf(n.poolId)).allocations.filter((a) => a.state === "committed").length,
    "the refused guest still took a seat",
  ).toBe(2);

  await signInJourneysStaff(page, `${ADMIN_PREFIX}/admin/appts?view=sessions`);
  const row = scheduleRow(page);
  await expect(row).toHaveCount(1, { timeout: 30_000 });
  // Both places sold: booked equals places, and the row says Full.
  await expect(row).toContainText("2 / 2");
  await expect(row).toContainText("Full");
  await expect(row.getByTestId("session-open-waitlist")).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("schedule-full.png"), fullPage: true });
});

test("the queue is opened from the full row, two people join it, and a place that does not exist is refused", async ({
  page,
}, testInfo) => {
  test.setTimeout(240_000);
  const n = night!;

  await signInJourneysStaff(page, `${ADMIN_PREFIX}/admin/appts?view=sessions`);
  const row = scheduleRow(page);
  await expect(row).toHaveCount(1, { timeout: 30_000 });
  await row.getByTestId("session-open-waitlist").click();

  // The door lands on THIS class's card with the form already open.
  const card = page.locator("[data-testid=waitlist-session]").filter({ hasText: TITLE });
  await expect(card).toHaveCount(1, { timeout: 30_000 });
  await expect(card).toContainText("Full");
  await expect(card.getByTestId("waitlist-nobody")).toBeVisible();
  await card.getByLabel("Their name").fill("Ana Espera");
  await card.getByTestId("waitlist-join-submit").click();
  await expect(card.getByTestId("waitlist-message")).toContainText("Ana Espera is on the list.", {
    timeout: 30_000,
  });
  await card.getByTestId("waitlist-join-open").click();
  await card.getByLabel("Their name").fill("Beto Espera");
  await card.getByTestId("waitlist-join-submit").click();
  await expect(card.getByTestId("waitlist-message")).toContainText("Beto Espera is on the list.", {
    timeout: 30_000,
  });
  await expect(card.locator("tr").filter({ hasText: "Ana Espera" })).toContainText("Next in line");
  await page.screenshot({ path: testInfo.outputPath("waitlist-two-waiting.png"), fullPage: true });

  const rows = await waitlistRows(n.sessionId);
  expect(rows.map((r) => [r.customer_name, r.status])).toEqual([
    ["Ana Espera", "waiting"],
    ["Beto Espera", "waiting"],
  ]);

  // REFUSED: the class is full, and the refusal says so in a sentence.
  await card.locator("tr").filter({ hasText: "Ana Espera" }).getByTestId("waitlist-promote").click();
  await expect(card.getByTestId("waitlist-message")).toContainText(
    "There is no free place right now",
    { timeout: 30_000 },
  );
  await page.screenshot({ path: testInfo.outputPath("promote-refused-full.png"), fullPage: true });
  const after = await waitlistRows(n.sessionId);
  expect(after.every((r) => r.status === "waiting"), "a refusal changed somebody's row").toBe(true);
});

test("a seat is freed, offered, taken, and the accepted place holds a real seat", async ({
  page,
}, testInfo) => {
  test.setTimeout(300_000);
  const n = night!;

  // ── FREE A SEAT: open one more on the night, from the Events page. The only
  // interface that gives a seat back on a $0 night is the night's own seat
  // count; a free ticket has no refund to go through.
  await signInJourneysStaff(page, `${ADMIN_PREFIX}/admin/events`);
  await page.getByRole("button", { name: TITLE }).click();
  await page.getByRole("button", { name: "Sessions", exact: true }).click();
  const seatsBox = page.getByLabel("Seats for Seat");
  await expect(seatsBox).toHaveValue("2", { timeout: 30_000 });
  await seatsBox.fill("3");
  await page.getByRole("button", { name: /^save$/i }).click();
  // The save is a server round trip; the pool is the fact, not the box.
  await expect.poll(async () => (await seatsOf(n.poolId)).total, { timeout: 30_000 }).toBe(3);
  // (The Events page prints "sold: unknown" beside this night although two
  // seats are committed; that is the Events surface's own defect, recorded in
  // the evidence README and not asserted here.)
  await page.screenshot({ path: testInfo.outputPath("seat-opened.png"), fullPage: true });

  // ── OFFER IT. The queue, from the Waitlist tab in the rail.
  await page.goto(`${ADMIN_PREFIX}/admin/appts?view=waitlist`);
  const card = page.locator("[data-testid=waitlist-session]").filter({ hasText: TITLE });
  await expect(card).toHaveCount(1, { timeout: 30_000 });
  await expect(card).toContainText("1 of 3 left");
  const ana = card.locator("tr").filter({ hasText: "Ana Espera" });
  await ana.getByTestId("waitlist-promote").click();
  await expect(card.getByTestId("waitlist-message")).toContainText(/Offered to Ana Espera, held until/i, {
    timeout: 30_000,
  });
  await expect(ana).toContainText("Offered", { timeout: 30_000 });
  let rows = await waitlistRows(n.sessionId);
  expect(rows.find((r) => r.customer_name === "Ana Espera")?.status).toBe("offered");
  expect(rows.find((r) => r.customer_name === "Ana Espera")?.offer_expires_at).not.toBeNull();

  // ── TAKEN. This is the write that used to hold nothing.
  await ana.getByTestId("waitlist-accept").click();
  await expect(card.getByTestId("waitlist-message")).toContainText(/Ana Espera/, { timeout: 30_000 });
  await expect(ana).toContainText("Took the place", { timeout: 30_000 });
  await page.screenshot({ path: testInfo.outputPath("place-taken.png"), fullPage: true });

  rows = await waitlistRows(n.sessionId);
  const accepted = rows.find((r) => r.customer_name === "Ana Espera");
  expect(accepted?.status).toBe("accepted");
  expect(accepted?.accepted_allocation_id, "an accepted place names no seat").not.toBeNull();
  let seats = await seatsOf(n.poolId);
  const hers = seats.allocations.find((a) => a.id === accepted!.accepted_allocation_id);
  expect(hers, "the seat the entry names does not exist in the pool").toBeDefined();
  expect(hers!.state).toBe("committed");
  expect(hers!.order_line_id, "a waitlist seat is upstream of money").toBeNull();
  expect(
    seats.allocations.filter((a) => a.state === "committed").reduce((s, a) => s + a.units, 0),
    "the pool does not count the accepted place",
  ).toBe(3);
  await expect(card).toContainText("Full");

  // ── AND IT HOLDS: the second person cannot be offered the same seat.
  const beto = card.locator("tr").filter({ hasText: "Beto Espera" });
  await beto.getByTestId("waitlist-promote").click();
  await expect(card.getByTestId("waitlist-message")).toContainText(
    "There is no free place right now",
    { timeout: 30_000 },
  );
  await page.screenshot({ path: testInfo.outputPath("second-refused-seat-held.png"), fullPage: true });

  // ── GIVEN BACK, and handed on. Cancelling the accepted place releases the
  // seat; only then can the next person be offered it, and take it.
  await ana.getByTestId("waitlist-cancel-seat").click();
  await expect(card.getByTestId("waitlist-message")).toContainText(/Ana Espera/, { timeout: 30_000 });
  await expect(ana).toContainText("Left the list", { timeout: 30_000 });
  seats = await seatsOf(n.poolId);
  expect(seats.allocations.some((a) => a.id === accepted!.accepted_allocation_id)).toBe(false);
  await expect(card).toContainText("1 of 3 left", { timeout: 30_000 });

  await beto.getByTestId("waitlist-promote").click();
  await expect(card.getByTestId("waitlist-message")).toContainText(/Offered to Beto Espera/i, {
    timeout: 30_000,
  });
  await beto.getByTestId("waitlist-accept").click();
  await expect(beto).toContainText("Took the place", { timeout: 30_000 });
  await page.screenshot({ path: testInfo.outputPath("second-took-the-place.png"), fullPage: true });

  rows = await waitlistRows(n.sessionId);
  const his = rows.find((r) => r.customer_name === "Beto Espera");
  expect(his?.status).toBe("accepted");
  seats = await seatsOf(n.poolId);
  const hisSeat = seats.allocations.find((a) => a.id === his!.accepted_allocation_id);
  expect(hisSeat?.state).toBe("committed");
  expect(hisSeat?.order_line_id).toBeNull();
  expect(seats.allocations.filter((a) => a.state === "committed").reduce((s, a) => s + a.units, 0)).toBe(3);
});
