/**
 * The Appointments and Classes journey, walked from the sidebar.
 *
 * WHAT THIS FILE IS FOR. Every screen under Operate → Appointments existed and
 * almost none of it had been clicked. These tests do the clicking: a guest
 * books a real slot on the public page, an operator finds it on the day's
 * board, moves it and reads the confirmation, is refused when the screen is
 * stale and when the room is full. The class side of the same destination
 * (the night, the queue, the seat an acceptance takes) is walked in
 * `classes-and-waitlist.spec.ts`, and proposed hours in
 * `booking-hours-proposal.spec.ts`.
 *
 * NOTHING IS HAND-INSERTED. Every row these tests assert on was written by the
 * interface itself — the public booking page, the "Schedule a night" form, the
 * waitlist card. The database reads are checks on what the browser did, never
 * setup for what it is about to do.
 *
 * Serial, because the journey is one story: the appointment booked in the
 * first test is the one moved in the second.
 */
import { test, expect, type Page } from "@playwright/test";

import { prepareJourneysPage, signInJourneysStaff } from "../cases/_harness";
import { isolatedService, JOURNEYS_TENANT_ID } from "../cases/_isolated-db";

test.describe.configure({ mode: "serial" });

/** The workspace's own clock. Every wall time an operator types is in this zone. */
const VENUE_ZONE = "America/Mexico_City";

/**
 * Where this workspace's pages live on the host under test.
 *
 * On its own subdomain (the deployed QA host) the storefront is `/book` and
 * the workspace is `/admin/...`. On a shared app host — a local dev server on
 * `localhost`, where a same-origin page is the only one Next will hydrate —
 * the same surfaces are path-tenanted. The journey is identical either way, so
 * the prefixes are read rather than the spec being forked.
 */
const PUBLIC_PREFIX = process.env.JOURNEYS_PUBLIC_PREFIX ?? "";
const ADMIN_PREFIX = process.env.JOURNEYS_ADMIN_PREFIX ?? "";

/**
 * A local dev host has no DNS entry, so the browser is told where it lives
 * rather than /etc/hosts being edited. Harmless against a real host: nothing
 * ever asks for that name there.
 */
test.use({
  launchOptions: {
    args: ["--host-resolver-rules=MAP qa-journeys.local 127.0.0.1,MAP qa-journeys-b.local 127.0.0.1"],
  },
});

test.beforeEach(async ({ page }) => {
  await prepareJourneysPage(page);
});

type BookedAppointment = {
  readonly orderId: string;
  readonly bookingId: string;
  readonly startsAt: string | null;
  readonly endsAt: string | null;
  readonly slotLabel: string;
};

/**
 * Book one appointment the way a customer does: pick the service, pick a time
 * on the public page, leave a name, confirm.
 *
 * `slotIndex` picks which of the offered times to take, so two appointments in
 * one test are two different times rather than a collision by accident.
 */
async function bookOnThePublicPage(
  page: Page,
  service: string,
  marker: string,
  slotIndex = 0,
): Promise<BookedAppointment> {
  await page.goto(`${PUBLIC_PREFIX}/book`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 30_000 });
  const chooser = page.getByRole("combobox").first();
  if (await chooser.count()) await chooser.selectOption({ label: service });
  await expect(page.getByText(service).first()).toBeVisible({ timeout: 30_000 });

  const slots = page.locator("[data-testid=slot-picker] button");
  await expect(slots.first()).toBeVisible({ timeout: 30_000 });
  // A negative index counts from the end of the offered list, so a booking
  // that needs a companion and a room can be placed on a day nothing else in
  // this file has touched. The picker lists a person's own free times only;
  // it does not know the companion's calendar, so an early slot can be one
  // the companion already holds from a sibling test (see the README).
  const total = await slots.count();
  const slot = slots.nth(slotIndex < 0 ? total + slotIndex : slotIndex);
  await expect(slot).toBeVisible({ timeout: 30_000 });
  const slotLabel = (await slot.innerText()).trim();
  await slot.click();

  await page.getByRole("textbox", { name: /your name/i }).fill(marker);
  await page.getByRole("textbox", { name: /your email/i }).fill(`${marker}@impronta.test`);
  await page.getByRole("button", { name: /confirm this time/i }).click();
  await expect(page).toHaveURL(
    /checkout\/(success|cancel)|checkout\.stripe\.com|instant_booked/i,
    { timeout: 60_000 },
  );

  const db = isolatedService();
  const { data: customer, error: customerErr } = await db
    .from("customers")
    .select("id")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("email", `${marker}@impronta.test`)
    .maybeSingle();
  if (customerErr) throw new Error(customerErr.message);
  expect(customer, "the public booking page created no customer").not.toBeNull();

  const { data: order, error: orderErr } = await db
    .from("orders")
    .select("id")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("customer_id", (customer as { id: string }).id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (orderErr) throw new Error(orderErr.message);
  expect(order, "the public booking page created no order").not.toBeNull();

  const { data: booking, error: bookingErr } = await db
    .from("agency_bookings")
    .select("id, starts_at, ends_at")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("order_id", (order as { id: string }).id)
    .maybeSingle();
  if (bookingErr) throw new Error(bookingErr.message);
  expect(
    booking,
    "a confirmed appointment exists as an order with no booking, so no board can show it",
  ).not.toBeNull();

  const row = booking as { id: string; starts_at: string | null; ends_at: string | null };
  return {
    orderId: (order as { id: string }).id,
    bookingId: row.id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    slotLabel,
  };
}

/** The booking row as the database has it right now. */
async function readBooking(bookingId: string) {
  const db = isolatedService();
  const { data, error } = await db
    .from("agency_bookings")
    .select("id, status, starts_at, ends_at, order_id")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("id", bookingId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as {
    id: string;
    status: string;
    starts_at: string | null;
    ends_at: string | null;
    order_id: string | null;
  } | null;
}

/**
 * The person legs of an order: the `talent_holds` rows the purchase placed
 * under its own key. This is the talent's calendar; the booking row is the
 * operator's board. Both have to say the same time or one of them is lying.
 */
async function readOrderHolds(orderId: string) {
  const db = isolatedService();
  const { data, error } = await db
    .from("talent_holds")
    .select("id, talent_profile_id, starts_at, ends_at, expires_at, hold_strength")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("operation_key", `order:${orderId}:reserve`)
    .order("talent_profile_id", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<{
    id: string;
    talent_profile_id: string;
    starts_at: string;
    ends_at: string;
    expires_at: string | null;
    hold_strength: string;
  }>;
}

/** "Sat, Sep 12" for an instant, the way the board prints a day in the venue's zone. */
function venueDayLabel(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: VENUE_ZONE,
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}

/** What a `datetime-local` box needs for an instant, read on the venue's clock. */
function venueLocalValue(iso: string, minutesLater = 0): string {
  const at = new Date(Date.parse(iso) + minutesLater * 60_000);
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

/** The board row for one booking, found by the name the customer left. */
function appointmentRow(page: Page, marker: string) {
  return page.locator("tr").filter({ hasText: marker });
}

test("a booking made on the public page is on the day's board, with its own time and state", async ({
  page,
}, testInfo) => {
  test.setTimeout(180_000);
  const marker = `appt-board-${Date.now()}`;
  const booked = await bookOnThePublicPage(page, "Massage", marker);

  // THE TIME THE CUSTOMER CHOSE IS ON THE BOOKING. Without it every instant
  // booking landed in "No date agreed yet" and the destination named for the
  // day's appointments could not show one of them.
  expect(
    booked.startsAt,
    `the customer booked ${booked.slotLabel} and the booking carries no time`,
  ).not.toBeNull();
  expect(booked.endsAt).not.toBeNull();

  // THE PERSON IS KEPT, NOT MERELY HELD. "Massage" is a $0 free-reserve
  // service settled in person, so the purchase settles on creation and the
  // talent's hold must have lost the fifteen-minute expiry it was reserved
  // with. With it, the calendar re-offered this exact time twenty minutes
  // after the confirmation. (A deposit service such as Gel manicure keeps its
  // TTL until the card clears, on purpose: an abandoned checkout must free
  // the person.)
  const holds = await readOrderHolds(booked.orderId);
  expect(holds.length, "the booking took no time on anybody's calendar").toBeGreaterThan(0);
  for (const hold of holds) {
    expect(hold.hold_strength).toBe("firm");
    expect(
      hold.expires_at,
      "a settled appointment's hold still carries an expiry, so the person will be resold",
    ).toBeNull();
    expect(Date.parse(hold.starts_at)).toBe(Date.parse(booked.startsAt!));
  }

  await signInJourneysStaff(page, `${ADMIN_PREFIX}/admin/appts`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/appointments/i);

  const row = appointmentRow(page, marker);
  await expect(row).toHaveCount(1, { timeout: 30_000 });
  await expect(row.locator("[data-testid=appointment-state]")).toHaveText("Confirmed");
  await expect(row.getByText(/no time agreed yet/i)).toHaveCount(0);
  await expect(row.getByRole("button", { name: /move it/i })).toBeVisible();

  // The bucket it is filed under is a fact about the row, not a heading that
  // happens to be on the page: an appointment with a time must not sit under
  // "No date agreed yet".
  const undatedGroup = page
    .locator("div")
    .filter({ hasText: /^No date agreed yet/ })
    .last();
  await expect(undatedGroup.filter({ hasText: marker })).toHaveCount(0);

  await page.screenshot({ path: testInfo.outputPath("board.png"), fullPage: true });
});

test("a move that worked says so, and the database agrees", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const marker = `appt-move-${Date.now()}`;
  const booked = await bookOnThePublicPage(page, "Massage", marker);
  expect(booked.startsAt).not.toBeNull();

  await signInJourneysStaff(page, `${ADMIN_PREFIX}/admin/appts`);
  const row = appointmentRow(page, marker);
  await expect(row).toHaveCount(1, { timeout: 30_000 });
  await row.getByRole("button", { name: /move it/i }).click();

  const panel = page.locator("[data-testid=appointment-reschedule]");
  await expect(panel).toBeVisible();
  // Two days on, same clock time: a window nothing else in the fixture holds.
  const target = new Date(Date.parse(booked.startsAt!) + 2 * 24 * 60 * 60_000).toISOString();
  await panel.locator("input[type=datetime-local]").fill(venueLocalValue(target));
  await panel.getByRole("button", { name: /^move it$/i }).click();

  const message = page.locator("[data-testid=appointment-reschedule-message]");
  await expect(message).toHaveAttribute("data-outcome", "done", { timeout: 30_000 });
  await expect(message).toContainText(/moved to/i);
  // The list behind the panel re-reads after a move. A confirmation over a
  // row that still shows the old day is two answers on one screen.
  await expect(row).toContainText(venueDayLabel(target), { timeout: 30_000 });
  await page.screenshot({ path: testInfo.outputPath("moved.png"), fullPage: true });

  const after = await readBooking(booked.bookingId);
  expect(after?.starts_at, "the confirmation said moved and the row did not").not.toBeNull();
  expect(Date.parse(after!.starts_at!)).toBe(Date.parse(target));
  // The window keeps its length: a move is not an edit of how long the job is.
  expect(Date.parse(after!.ends_at!) - Date.parse(after!.starts_at!)).toBe(
    Date.parse(booked.endsAt!) - Date.parse(booked.startsAt!),
  );

  // THE PERSON MOVED WITH IT. The panel says "the person, the room and the
  // booking move together, or none of them do". Before this was checked, the
  // booking row moved to Saturday and the manicurist stayed held on Thursday:
  // busy at a time nobody was coming, free at the time somebody was.
  const holdsAfter = await readOrderHolds(booked.orderId);
  expect(holdsAfter.length).toBeGreaterThan(0);
  for (const hold of holdsAfter) {
    expect(
      Date.parse(hold.starts_at),
      `${hold.talent_profile_id} is still held at the old time`,
    ).toBe(Date.parse(target));
    expect(hold.expires_at, "the move gave the person's hold an expiry back").toBeNull();
  }

  // The room the booking holds moved with it, or the appointment is in one
  // place and its resources in another.
  const db = isolatedService();
  const { data: lines } = await db
    .from("order_lines")
    .select("id")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("order_id", booked.orderId);
  const lineIds = ((lines ?? []) as Array<{ id: string }>).map((l) => l.id);
  if (lineIds.length > 0) {
    const { data: allocs } = await db
      .from("capacity_allocations")
      .select("id, starts_at, state")
      .eq("tenant_id", JOURNEYS_TENANT_ID)
      .in("order_line_id", lineIds)
      .neq("state", "released");
    for (const alloc of (allocs ?? []) as Array<{ starts_at: string | null }>) {
      if (alloc.starts_at === null) continue;
      expect(
        Date.parse(alloc.starts_at),
        "an allocation stayed where the booking used to be",
      ).toBe(Date.parse(target));
    }
  }
});

test("a taken time is refused, and the refusal names who is busy", async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const stamp = Date.now();
  // Two massages with the same person, at two different times.
  const first = await bookOnThePublicPage(page, "Massage", `busy-a-${stamp}`, 0);
  const second = await bookOnThePublicPage(page, "Massage", `busy-b-${stamp}`, 1);
  expect(first.startsAt).not.toBeNull();
  expect(second.startsAt).not.toBeNull();
  expect(Date.parse(first.startsAt!)).not.toBe(Date.parse(second.startsAt!));
  const person = await readOrderHolds(first.orderId);
  expect(person.length).toBe(1);

  await signInJourneysStaff(page, `${ADMIN_PREFIX}/admin/appts`);
  const row = appointmentRow(page, `busy-b-${stamp}`);
  await expect(row).toHaveCount(1, { timeout: 30_000 });
  await row.getByRole("button", { name: /move it/i }).click();

  const panel = page.locator("[data-testid=appointment-reschedule]");
  await expect(panel).toBeVisible();
  // Onto the first appointment's time: the same person, already booked.
  await panel.locator("input[type=datetime-local]").fill(venueLocalValue(first.startsAt!));
  await panel.getByRole("button", { name: /^move it$/i }).click();

  const refusal = page.locator("[data-testid=appointment-reschedule-message]");
  await expect(refusal).toHaveAttribute("data-outcome", "refused", { timeout: 30_000 });
  // NAMED. An operator told "that time was just taken" cannot tell whom to
  // ask; told who is busy, they can move the other one or pick someone else.
  const db = isolatedService();
  const { data: profile } = await db
    .from("talent_profiles")
    .select("display_name")
    .eq("id", person[0]!.talent_profile_id)
    .maybeSingle();
  const personName = (profile as { display_name: string } | null)?.display_name ?? "";
  expect(personName.length).toBeGreaterThan(0);
  await expect(refusal).toContainText(personName);
  await expect(refusal).toContainText(/already booked at that time/i);
  await page.screenshot({ path: testInfo.outputPath("person-busy.png"), fullPage: true });

  // Refused means nothing moved: not the booking, not the person.
  const after = await readBooking(second.bookingId);
  expect(Date.parse(after!.starts_at!)).toBe(Date.parse(second.startsAt!));
  const holdsAfter = await readOrderHolds(second.orderId);
  expect(holdsAfter.length).toBe(1);
  expect(Date.parse(holdsAfter[0]!.starts_at)).toBe(Date.parse(second.startsAt!));
});

test("a screen that went stale is refused rather than overwriting somebody else's move", async ({
  browser,
}, testInfo) => {
  test.setTimeout(240_000);
  const marker = `appt-stale-${Date.now()}`;

  const deskOne = await browser.newPage();
  await prepareJourneysPage(deskOne);
  const booked = await bookOnThePublicPage(deskOne, "Massage", marker);
  expect(booked.startsAt).not.toBeNull();

  await signInJourneysStaff(deskOne, `${ADMIN_PREFIX}/admin/appts`);
  const rowOne = appointmentRow(deskOne, marker);
  await expect(rowOne).toHaveCount(1, { timeout: 30_000 });
  await rowOne.getByRole("button", { name: /move it/i }).click();
  const panelOne = deskOne.locator("[data-testid=appointment-reschedule]");
  await expect(panelOne).toBeVisible();

  // A COLLEAGUE MOVES IT FIRST, through the same screen. Not a hand-written
  // UPDATE: the point is that two desks working one list cannot silently
  // overwrite each other, and only the interface can prove that.
  const deskTwo = await browser.newPage();
  await prepareJourneysPage(deskTwo);
  await signInJourneysStaff(deskTwo, `${ADMIN_PREFIX}/admin/appts`);
  const rowTwo = appointmentRow(deskTwo, marker);
  await expect(rowTwo).toHaveCount(1, { timeout: 30_000 });
  await rowTwo.getByRole("button", { name: /move it/i }).click();
  const panelTwo = deskTwo.locator("[data-testid=appointment-reschedule]");
  const colleaguesTime = new Date(
    Date.parse(booked.startsAt!) + 3 * 24 * 60 * 60_000,
  ).toISOString();
  await panelTwo.locator("input[type=datetime-local]").fill(venueLocalValue(colleaguesTime));
  await panelTwo.getByRole("button", { name: /^move it$/i }).click();
  await expect(deskTwo.locator("[data-testid=appointment-reschedule-message]")).toHaveAttribute(
    "data-outcome",
    "done",
    { timeout: 30_000 },
  );

  // The first desk is now looking at a window that is no longer the stored one.
  const myTime = new Date(Date.parse(booked.startsAt!) + 4 * 24 * 60 * 60_000).toISOString();
  await panelOne.locator("input[type=datetime-local]").fill(venueLocalValue(myTime));
  await panelOne.getByRole("button", { name: /^move it$/i }).click();
  const refusal = deskOne.locator("[data-testid=appointment-reschedule-message]");
  await expect(refusal).toHaveAttribute("data-outcome", "refused", { timeout: 30_000 });
  await expect(refusal).toContainText(/changed since you opened it/i);
  await deskOne.screenshot({ path: testInfo.outputPath("stale-refused.png"), fullPage: true });

  // The colleague's move stands. A refusal that still wrote would be worse
  // than no guard at all.
  const after = await readBooking(booked.bookingId);
  expect(Date.parse(after!.starts_at!)).toBe(Date.parse(colleaguesTime));
  expect(Date.parse(after!.starts_at!)).not.toBe(Date.parse(myTime));

  await deskOne.close();
  await deskTwo.close();
});

test("a full room is refused, and the refusal names the room", async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const stamp = Date.now();
  // Couples massage is the offering that takes Room A, and Room A holds one.
  const first = await bookOnThePublicPage(page, "Couples massage", `room-a-${stamp}`, -1);
  const second = await bookOnThePublicPage(page, "Couples massage", `room-b-${stamp}`, -7);
  expect(first.startsAt).not.toBeNull();
  expect(second.startsAt).not.toBeNull();
  expect(Date.parse(first.startsAt!)).not.toBe(Date.parse(second.startsAt!));

  await signInJourneysStaff(page, `${ADMIN_PREFIX}/admin/appts`);
  const row = appointmentRow(page, `room-b-${stamp}`);
  await expect(row).toHaveCount(1, { timeout: 30_000 });
  await row.getByRole("button", { name: /move it/i }).click();

  const panel = page.locator("[data-testid=appointment-reschedule]");
  await expect(panel).toBeVisible();
  await panel.locator("input[type=datetime-local]").fill(venueLocalValue(first.startsAt!));
  await panel.getByRole("button", { name: /^move it$/i }).click();

  const refusal = page.locator("[data-testid=appointment-reschedule-message]");
  await expect(refusal).toHaveAttribute("data-outcome", "refused", { timeout: 30_000 });
  // NAMED. "That space is full" tells an operator nothing they can act on.
  await expect(refusal).toContainText(/Room A/);
  await page.screenshot({ path: testInfo.outputPath("room-full.png"), fullPage: true });

  // Refused means nothing moved.
  const after = await readBooking(second.bookingId);
  expect(Date.parse(after!.starts_at!)).toBe(Date.parse(second.startsAt!));
});
