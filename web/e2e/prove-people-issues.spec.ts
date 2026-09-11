/**
 * PROVE: People and Issues, in a browser, against the QA host and its database.
 *
 * Every test here starts where a person starts — signed in, on the admin shell,
 * clicking the rail — and finishes by reading the rows the journey should have
 * written. Nothing is hand-inserted that the interface could have created.
 *
 * The workspace is `qa-journeys`; the second workspace `qa-journeys-b` is only
 * used for the isolation pair, where a refusal has to be authorization rather
 * than absence.
 */

import { expect, test, type Page } from "@playwright/test";

import { signInJourneysStaff, assertNotAuthWall } from "./cases/_harness";
import { JOURNEYS_TENANT_ID, isolatedService } from "./cases/_isolated-db";

const EVIDENCE = "../docs/plans/program/evidence/prove-people-projects";

/** The fixture people, by the ids the seed gives them. */
const TALENT_PROFILE_ID = "33330003-0000-4000-8000-000000000001"; // QA Journeys Talent
const TALENT_ACCOUNT_ID = "33330001-0000-4000-8000-000000000005";
const THERAPIST_PROFILE_ID = "33330003-0000-4000-8000-000000000002"; // QA Journeys Therapist B
const VIEWER_ACCOUNT_ID = "33330001-0000-4000-8000-000000000002";

const TALENT_NAME = "QA Journeys Talent";
const THERAPIST_NAME = "QA Journeys Therapist B";
/** The offering that only exists because QA Journeys Talent is bookable. */
const TALENT_OFFERING = "Gel manicure";
/** Therapist B's own service, and the one the booking page drops with their hat. */
const THERAPIST_OFFERING = "Massage";

/**
 * The rail label for the People destination on this workspace.
 *
 * The registry gives People a preset label, so a business-shaped workspace
 * reads "Team" where a talent-shaped one reads "People". The row is the same
 * row, so the test accepts either rather than pinning the preset.
 */
const PEOPLE_RAIL = /^(People|Team)\b/;
const ISSUES_RAIL = /^Issues\b/;

async function openAdmin(page: Page, path = "/admin"): Promise<void> {
  await signInJourneysStaff(page, path);
  await assertNotAuthWall(page);
}

function rail(page: Page) {
  return page.getByRole("navigation", { name: /workspace sections/i });
}

/**
 * Click the People row in the sidebar rail and land on the People surface.
 *
 * The rail row is a BUTTON that calls `setPage`, so it does nothing at all
 * until the shell has hydrated — a click on the server-rendered markup is
 * swallowed silently. The retry below is for that, and only that: it is a wait
 * for the page to be ready to be used, not a second chance for a broken link.
 */
async function openPeopleFromTheRail(page: Page): Promise<void> {
  const row = rail(page).getByRole("button", { name: PEOPLE_RAIL }).first();
  await expect(row, "the rail must carry a People row").toBeVisible({ timeout: 60_000 });
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await row.click();
    try {
      await expect(page).toHaveURL(/\/admin\/people(\?|$)/, { timeout: 10_000 });
      break;
    } catch {
      if (attempt === 5) throw new Error("the People row in the rail never opened People");
    }
  }
  await expect(page).toHaveURL(/\/admin\/people(\?|$)/);
  await expect(
    page.getByRole("heading", { level: 1, name: "People", exact: true }),
  ).toBeVisible({ timeout: 60_000 });
}

/**
 * Select one person in the People list by their displayed name. The row's
 * name is a button; clicking it opens the person's sheet, whose heading is
 * the same name.
 */
async function selectPerson(page: Page, name: string): Promise<void> {
  await page.getByRole("button", { name: new RegExp(`^${name}`) }).first().click();
  await expect(page.getByRole("heading", { level: 2, name })).toBeVisible({ timeout: 20_000 });
}

/** One hat's block, rooted on its own heading so sibling hats cannot match. */
function hatBlock(page: Page, title: string) {
  return page
    .getByRole("heading", { level: 3, name: title, exact: true })
    .locator("xpath=../..");
}

/**
 * The booking page's offering picker, one `<option>` per offering the engine
 * gate lets through. An option is never "visible" to Playwright even when the
 * select is, so presence is counted rather than seen.
 */
function offeredOnBookingPage(page: Page, title: string) {
  return page.locator("option").filter({ hasText: new RegExp(`^${title}$`) });
}

test.describe.configure({ mode: "serial" });

// A dev-server first compile of a route can take most of a minute; these are
// journeys through a dozen of them.
// The host this ran on was a dev server sharing a machine with four other
// journeys (a server action took 31 s and its refresh 28 s under that load),
// so every wait after a write is long. A wait is not a weaker assertion: each
// one still ends in the row or the sentence it names.
test.setTimeout(480_000);

// ── People ────────────────────────────────────────────────────────────

test("People: the sidebar rail opens the People surface", async ({ page }) => {
  await openAdmin(page);
  await openPeopleFromTheRail(page);
  // The four filters over ONE record set. Their presence is what says this is
  // the People surface and not the roster grid that used to answer this click.
  // Scoped to the surface's own tab strip: the rail carries a child row with
  // the same label, and an unscoped lookup resolves to both.
  // The boards' words (W27): Everyone, then Talent · N, Bookable · N and
  // Access · N, each count the reader's own.
  const tabs = page.getByRole("navigation", { name: "People", exact: true });
  for (const tab of [/^Everyone$/, /^Talent · \d+$/, /^Bookable · \d+$/, /^Access · \d+$/]) {
    await expect(tabs.getByRole("button", { name: tab })).toBeVisible();
  }
  await page.screenshot({ path: `${EVIDENCE}/01-people-from-the-rail.png`, fullPage: true });
});

test("People: the public profile hat still opens the existing profile drawer", async ({ page }) => {
  await openAdmin(page, "/admin/people");
  await selectPerson(page, TALENT_NAME);
  const publicHat = hatBlock(page, "Public profile");
  await expect(publicHat.getByText("On", { exact: true })).toBeVisible();
  await publicHat.getByRole("button", { name: "Open the profile editor" }).click();
  // The EXISTING drawer, unchanged: the same editor the roster already opens.
  await expect(page.getByRole("dialog")).toBeVisible({ timeout: 90_000 });
  await page.screenshot({ path: `${EVIDENCE}/02-public-profile-drawer.png`, fullPage: true });
});

test("People: the bookable hat sets booking, and the booking page follows", async ({ page }) => {
  const db = isolatedService();

  // THE FIXTURE'S SHAPE DECIDES WHO THIS JOURNEY CAN BE WALKED WITH. The
  // workspace-level switch (`appointments.allowTalentDirectBooking`) is ON for
  // qa-journeys, and the engine's agency gate is `workspaceAllow OR
  // roster.direct_booking_enabled`, so the per-person column alone cannot turn
  // anyone off here. The hat can still come off through the person's own half,
  // which the workspace may only answer for a person with no sign-in of their
  // own. Therapist B is that person; Talent (who holds an account) is the
  // refusal case, proven below.
  const agency = await db
    .from("agencies")
    .select("settings")
    .eq("id", JOURNEYS_TENANT_ID)
    .maybeSingle();
  const appts = (agency.data?.settings as { appointments?: { allowTalentDirectBooking?: boolean } })
    ?.appointments;
  expect(appts?.allowTalentDirectBooking, "the fixture's workspace-level switch is on").toBe(true);

  const readTherapist = async () => {
    const roster = await db
      .from("agency_talent_roster")
      .select("direct_booking_enabled")
      .eq("tenant_id", JOURNEYS_TENANT_ID)
      .eq("talent_profile_id", THERAPIST_PROFILE_ID)
      .maybeSingle();
    const profile = await db
      .from("talent_profiles")
      .select("booking_terms")
      .eq("id", THERAPIST_PROFILE_ID)
      .maybeSingle();
    return {
      agencyHalf: roster.data?.direct_booking_enabled ?? null,
      personHalf:
        (profile.data?.booking_terms as { directBookingOptIn?: boolean } | null)
          ?.directBookingOptIn ?? null,
    };
  };

  // A run killed between "Turn off" and "Turn on" leaves this person off. Put
  // the fixture back the way a person would, through the same control this
  // journey ends on, rather than with SQL.
  if ((await readTherapist()).agencyHalf !== true) {
    await openAdmin(page, "/admin/people");
    await selectPerson(page, THERAPIST_NAME);
    await hatBlock(page, "Bookable").getByRole("button", { name: "Turn on" }).click();
    await expect
      .poll(async () => await readTherapist(), { message: "leftover off state restored", timeout: 90_000 })
      .toEqual({ agencyHalf: true, personHalf: true });
  }
  const before = await readTherapist();
  expect(before, "fixture starts bookable on both halves").toEqual({
    agencyHalf: true,
    personHalf: true,
  });

  // The booking page offers this person's service while the hat is on.
  await page.goto("/book");
  await expect(offeredOnBookingPage(page, THERAPIST_OFFERING)).toHaveCount(1, { timeout: 90_000 });

  await openAdmin(page, "/admin/people");
  await selectPerson(page, THERAPIST_NAME);
  const bookable = hatBlock(page, "Bookable");
  await expect(bookable.getByText("On", { exact: true })).toBeVisible();
  await bookable.getByRole("button", { name: "Turn off" }).click();
  await expect(page.getByText("Saved.", { exact: true })).toBeVisible({ timeout: 90_000 });

  const off = await readTherapist();
  expect(off, "the hat wrote both halves, because the workspace answers for this person").toEqual({
    agencyHalf: false,
    personHalf: false,
  });

  await expect(hatBlock(page, "Bookable").getByText("Off", { exact: true })).toBeVisible({
    timeout: 90_000,
  });
  // Off, AND SAID WHY: the person's half is the leg that is now off.
  await expect(
    hatBlock(page, "Bookable").getByText(/this workspace answers for them/i).first(),
  ).toBeVisible();
  await page.screenshot({ path: `${EVIDENCE}/03-bookable-off.png`, fullPage: true });

  // THE BOOKING PAGE REFLECTS IT. Not a second copy of the rule: the public
  // page asks the same engine gate the hat writes into.
  await page.goto("/book");
  await expect(offeredOnBookingPage(page, TALENT_OFFERING), "the page still works").toHaveCount(1, {
    timeout: 90_000,
  });
  await expect(offeredOnBookingPage(page, THERAPIST_OFFERING)).toHaveCount(0);
  await page.screenshot({ path: `${EVIDENCE}/04-booking-page-without-them.png`, fullPage: true });

  // Put it back, and prove the booking page comes back with it.
  await openAdmin(page, "/admin/people");
  await selectPerson(page, THERAPIST_NAME);
  await hatBlock(page, "Bookable").getByRole("button", { name: "Turn on" }).click();
  await expect(page.getByText("Saved.", { exact: true })).toBeVisible({ timeout: 90_000 });
  const on = await readTherapist();
  expect(on).toEqual({ agencyHalf: true, personHalf: true });
  await expect(hatBlock(page, "Bookable").getByText("On", { exact: true })).toBeVisible({
    timeout: 90_000,
  });
  await page.goto("/book");
  await expect(offeredOnBookingPage(page, THERAPIST_OFFERING)).toHaveCount(1, { timeout: 90_000 });
});

test("People: a person who holds their own sign-in cannot be switched off under a blanket allow, and is told so", async ({
  page,
}) => {
  const db = isolatedService();
  const before = await db
    .from("agency_talent_roster")
    .select("direct_booking_enabled")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("talent_profile_id", TALENT_PROFILE_ID)
    .maybeSingle();
  expect(before.data?.direct_booking_enabled).toBe(true);

  await openAdmin(page, "/admin/people");
  await selectPerson(page, TALENT_NAME);
  const bookable = hatBlock(page, "Bookable");
  await expect(bookable.getByText("On", { exact: true })).toBeVisible();
  // THE DEFECT, CLOSED. This button used to be here. It wrote
  // `direct_booking_enabled = false`, the panel said "Saved.", and the hat
  // stayed On because the workspace-level switch ORs over it.
  await expect(bookable.getByRole("button", { name: "Turn off" })).toHaveCount(0);
  await expect(
    bookable.getByText(/cannot be switched off one at a time/i),
    "the refusal is a sentence that names the switch that governs",
  ).toBeVisible();
  await expect(bookable.getByText(/Offer bookings on this workspace site/)).toBeVisible();
  await page.screenshot({ path: `${EVIDENCE}/03b-bookable-blanket-refusal.png`, fullPage: true });

  const after = await db
    .from("agency_talent_roster")
    .select("direct_booking_enabled")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("talent_profile_id", TALENT_PROFILE_ID)
    .maybeSingle();
  expect(after.data?.direct_booking_enabled, "nothing was written").toBe(true);
});

test("People: the access hat grants sign-in, sets the role, and takes it away", async ({ page }) => {
  const db = isolatedService();
  const LIVE = ["active", "invited", "pending_acceptance", "suspended"];

  /** The live membership this person holds here, or null. Removed rows stay behind by design. */
  const liveMembership = async () => {
    const { data } = await db
      .from("agency_memberships")
      .select("id, role, status")
      .eq("tenant_id", JOURNEYS_TENANT_ID)
      .eq("profile_id", TALENT_ACCOUNT_ID)
      .in("status", LIVE)
      .maybeSingle();
    return (data as { id: string; role: string; status: string } | null) ?? null;
  };

  await openAdmin(page, "/admin/people");
  await selectPerson(page, TALENT_NAME);

  // A run that was killed between "Give access" and "Take access away" leaves
  // this person WITH access. Put the fixture back the way a person would,
  // through the same control this test ends on, rather than with SQL.
  if ((await liveMembership()) !== null) {
    await hatBlock(page, "Access").getByRole("button", { name: "Take access away" }).click();
    await expect
      .poll(async () => await liveMembership(), { message: "leftover access removed", timeout: 90_000 })
      .toBeNull();
    await expect(hatBlock(page, "Access").getByText("Off", { exact: true })).toBeVisible({
      timeout: 90_000,
    });
  }
  expect(await liveMembership(), "this person starts with no sign-in here").toBeNull();

  const access = hatBlock(page, "Access");
  await expect(access.getByText("Off", { exact: true })).toBeVisible();
  // A hat that is off says WHY, as a sentence.
  await expect(access.getByText(/no sign-in for this workspace/i)).toBeVisible();

  // THE CONTROL THAT CLAIMS TO GRANT ACCESS MUST GRANT IT.
  await access.getByRole("button", { name: "Give access" }).click();
  // The database is the referee, and the write is asynchronous: wait for the
  // row rather than for a spinner that this panel does not render.
  await expect
    .poll(async () => (await liveMembership())?.status ?? null, {
      message: "the click wrote a membership",
      timeout: 90_000,
    })
    .toBe("active");
  expect((await liveMembership())?.role).toBe("viewer");

  await expect(hatBlock(page, "Access").getByText("On", { exact: true })).toBeVisible({
    timeout: 90_000,
  });
  await page.screenshot({ path: `${EVIDENCE}/05-access-granted.png`, fullPage: true });

  // NOT ENTERED TWICE. This human now has a roster row AND a membership row,
  // the exact pair the old Roster list and Team drawer showed as two people.
  const rows = page.getByRole("button", { name: new RegExp(`^${TALENT_NAME}`) });
  await expect(rows).toHaveCount(1);

  // The role control writes the role.
  await hatBlock(page, "Access").getByRole("combobox").selectOption("manager");
  await expect
    .poll(async () => (await liveMembership())?.role ?? null, {
      message: "the role control wrote the role",
      timeout: 90_000,
    })
    .toBe("manager");
  await expect(hatBlock(page, "Access").getByText("Role: Manager", { exact: true })).toBeVisible({
    timeout: 90_000,
  });
  await page.screenshot({ path: `${EVIDENCE}/05b-access-role-manager.png`, fullPage: true });

  // And taking it away leaves the other two hats alone.
  await hatBlock(page, "Access").getByRole("button", { name: "Take access away" }).click();
  await expect
    .poll(async () => await liveMembership(), { message: "access is gone", timeout: 90_000 })
    .toBeNull();
  await expect(hatBlock(page, "Access").getByText("Off", { exact: true })).toBeVisible({
    timeout: 90_000,
  });
  const stillOnRoster = await db
    .from("agency_talent_roster")
    .select("status")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("talent_profile_id", TALENT_PROFILE_ID)
    .maybeSingle();
  expect(stillOnRoster.data?.status, "the person is still on the roster").toBe("active");
  await expect(hatBlock(page, "Public profile").getByText("On", { exact: true })).toBeVisible();
  await expect(hatBlock(page, "Bookable").getByText("On", { exact: true })).toBeVisible();
  // Still ONE row for this human after the whole round trip.
  await expect(page.getByRole("button", { name: new RegExp(`^${TALENT_NAME}`) })).toHaveCount(1);
  await page.screenshot({ path: `${EVIDENCE}/05c-access-revoked.png`, fullPage: true });
});

test("People: a person with no email is told so, instead of shown a box that cannot work", async ({
  page,
}) => {
  const db = isolatedService();
  const row = await db
    .from("talent_profiles")
    .select("invitation_email, user_id")
    .eq("id", THERAPIST_PROFILE_ID)
    .maybeSingle();
  expect(row.data?.invitation_email, "the fixture holds no address for them").toBeNull();
  expect(row.data?.user_id, "and they have never signed up").toBeNull();

  await openAdmin(page, "/admin/people");
  await selectPerson(page, THERAPIST_NAME);
  const access = hatBlock(page, "Access");
  await expect(access.getByText(/no email address for this person/i)).toBeVisible();
  // NO free-text box inside one named person's record.
  await expect(access.getByRole("textbox")).toHaveCount(0);
  await expect(access.getByRole("button", { name: "Send invitation" })).toHaveCount(0);
  await page.screenshot({ path: `${EVIDENCE}/06-no-email-refusal.png`, fullPage: true });
});

test("People: a person with no display name is never shown as a raw identifier", async ({ page }) => {
  // THE FIXTURE STATE, and where it comes from. A member whose `profiles.
  // display_name` is empty is what sign-up produces for a person who never
  // typed a name. The fixture has no such person, so the Viewer's name is
  // blanked for the length of this test and put back in `finally`. This is
  // a STATE the interface produces, not the row whose creation is proven;
  // the read under test is the People list's.
  const db = isolatedService();
  const before = await db
    .from("profiles")
    .select("display_name")
    .eq("id", VIEWER_ACCOUNT_ID)
    .maybeSingle();
  const original = before.data?.display_name ?? null;
  expect(original, "the fixture viewer starts with a name").toBeTruthy();

  const blanked = await db.from("profiles").update({ display_name: null }).eq("id", VIEWER_ACCOUNT_ID);
  expect(blanked.error).toBeNull();
  try {
    await openAdmin(page, "/admin/people");
    const rows = page.getByRole("button", { name: /^Unnamed person/ });
    await expect(rows, "an absent name is said in words").toHaveCount(1, { timeout: 90_000 });
    // The defect this closes: eight characters of the auth user id were once
    // substituted for the name at the reader, so no screen could tell.
    await expect(page.getByText(VIEWER_ACCOUNT_ID.slice(0, 8))).toHaveCount(0);
    await expect(page.getByText(VIEWER_ACCOUNT_ID)).toHaveCount(0);
    await rows.first().click();
    await expect(page.getByRole("heading", { level: 2, name: "Unnamed person" })).toBeVisible({
      timeout: 90_000,
    });
    await page.screenshot({ path: `${EVIDENCE}/06b-unnamed-person.png`, fullPage: true });
  } finally {
    const restored = await db
      .from("profiles")
      .update({ display_name: original })
      .eq("id", VIEWER_ACCOUNT_ID);
    expect(restored.error).toBeNull();
  }
});

// ── Cross-workspace isolation, for the People record set ──────────────
//
// THE PAIR IS THE POINT. Workspace B holds a person of its own. A's operator
// must not see them, and B's owner must — without the second leg, the first is
// satisfied by a broken page, and without a record that really exists, both are
// satisfied by an empty database.

const B_ORIGIN = process.env.JOURNEYS_B_ORIGIN ?? "http://qa-journeys-b.local:3104";
const B_TENANT_ID = "33333333-3333-4333-8333-333333333334";
const B_TALENT_PROFILE_ID = "33330003-0000-4000-8000-0000000000b1";
const B_PERSON_NAME = "QA Journeys B Technician";
const B_OWNER_EMAIL = process.env.JOURNEYS_B_OWNER_EMAIL ?? "qa-journeys-b-owner@impronta.test";

/** Sign in on B's origin. `signInJourneysStaff` mints against the base URL, which is A. */
async function signInAsBOwner(page: Page, next: string): Promise<void> {
  const params = new URLSearchParams({ email: B_OWNER_EMAIL, next });
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const res = await page.request.get(`${B_ORIGIN}/api/dev/signin?${params.toString()}`, {
      maxRedirects: 0,
    });
    if (res.status() === 307) return;
    if (res.status() !== 404 && res.status() !== 502 && res.status() !== 503) {
      expect(res.status(), `dev sign-in refused: ${await res.text()}`).toBe(307);
    }
    await page.waitForTimeout(250 * attempt);
  }
  expect(false, "dev sign-in must mint a session for B's owner").toBe(true);
}

test("isolation: B's person really exists, so a refusal cannot be absence", async () => {
  const db = isolatedService();
  const { data } = await db
    .from("agency_talent_roster")
    .select("talent_profile_id, tenant_id, status")
    .eq("tenant_id", B_TENANT_ID)
    .eq("talent_profile_id", B_TALENT_PROFILE_ID)
    .maybeSingle();
  expect(data, "workspace B must hold its own person").not.toBeNull();
  expect(data?.status).toBe("active");
});

test("isolation: A's People surface does not carry B's person", async ({ page }) => {
  await openAdmin(page, "/admin/people");
  await expect(page.getByRole("heading", { level: 1, name: "People", exact: true })).toBeVisible();
  // Not a crash: a broken page also shows nothing, and that would not be
  // authorization. The surface has to still be the People surface.
  await expect(page.getByText(/application error|something went wrong/i)).toHaveCount(0);
  await expect(
    page.getByText(B_PERSON_NAME),
    "workspace B's person must not appear in workspace A's People list",
  ).toHaveCount(0);
  await page.screenshot({ path: `${EVIDENCE}/07-isolation-a-cannot-see-b.png`, fullPage: true });
});

test("isolation: B's own owner sees that same person, which is what makes it authorization", async ({
  page,
}) => {
  await signInAsBOwner(page, "/admin/people");
  await page.goto(`${B_ORIGIN}/admin/people`);
  await assertNotAuthWall(page);
  await expect(page.getByRole("heading", { level: 1, name: "People", exact: true })).toBeVisible({
    timeout: 90_000,
  });
  await expect(
    page.getByText(B_PERSON_NAME).first(),
    "B's owner must see B's own person, or the refusal above is unreachability rather than a decision",
  ).toBeVisible({ timeout: 90_000 });
  await page.screenshot({ path: `${EVIDENCE}/08-isolation-b-owner-can.png`, fullPage: true });
});

// ── Issues ────────────────────────────────────────────────────────────
//
// THE REAL PROBLEM. The inbox on qa-journeys holds paid ticket orders whose
// admissions were never minted: their capacity holds lapsed before the
// payment landed (every line's allocation is `released`), which is exactly
// the "buyer has a receipt and no ticket" case the inbox ranks critical. They
// were produced by the ticket-purchase journeys on 2026-09-08/09, not
// inserted for this test, and `seat_lost` is the answer the engine has for
// them. The card-collection problem the brief names cannot be started here:
// the counter refuses "Payment link" in a sentence because no provider is
// configured on this database, which the evidence README records.

const SHORTFALL_TITLE = /^1 ticket sold and never issued$/;
const SHORTFALL_ACTION = "Issue the missing tickets";
const REFUND_TITLE = /^Refund owed and not sent$/;
const B_ORDER_ID = "33330031-0000-4000-8000-0000000000b1";

/** The inbox row whose "Open" link names this order. */
function issueRowFor(page: Page, orderId: string) {
  return page.locator("li").filter({ has: page.locator(`a[href*="${orderId}"]`) });
}

/** The oldest shortfall line nobody has decided on yet, straight from the view. */
async function oldestUndecidedShortfall(): Promise<{ orderLineId: string; orderId: string }> {
  const db = isolatedService();
  const { data: lines } = await db
    .from("admissions_mint_shortfall")
    .select("order_line_id, order_id, order_updated_at")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .order("order_updated_at", { ascending: true });
  const { data: intents } = await db
    .from("ticket_refund_intents")
    .select("order_line_id")
    .eq("tenant_id", JOURNEYS_TENANT_ID);
  const decided = new Set((intents ?? []).map((r) => String(r.order_line_id)));
  const first = (lines ?? []).find((l) => !decided.has(String(l.order_line_id)));
  expect(first, "the fixture holds at least one undecided shortfall line").toBeTruthy();
  return { orderLineId: String(first!.order_line_id), orderId: String(first!.order_id) };
}

test("Issues: the sidebar rail opens the inbox, and a real problem is there in plain words with an action", async ({
  page,
}) => {
  const target = await oldestUndecidedShortfall();
  // Not hand-inserted: the seat this line paid for was already gone.
  const db = isolatedService();
  const { data: allocs } = await db
    .from("capacity_allocations")
    .select("state")
    .eq("order_line_id", target.orderLineId);
  expect((allocs ?? []).map((a) => a.state), "the hold lapsed before the payment landed").toEqual([
    "released",
  ]);

  await openAdmin(page);
  const row = rail(page).getByRole("button", { name: ISSUES_RAIL }).first();
  await expect(row, "the rail must carry an Issues row").toBeVisible({ timeout: 60_000 });
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await row.click();
    try {
      await expect(page).toHaveURL(/\/admin\/(issues|exceptions)(\?|$)/, { timeout: 10_000 });
      break;
    } catch {
      if (attempt === 5) throw new Error("the Issues row in the rail never opened Issues");
    }
  }
  await expect(page.getByRole("heading", { level: 1, name: /needs? a person/i })).toBeVisible({
    timeout: 90_000,
  });

  const issue = issueRowFor(page, target.orderId);
  await expect(issue).toHaveCount(1);
  await expect(issue.getByText(SHORTFALL_TITLE)).toBeVisible();
  // PLAIN WORDS. The sentence a door person can act on, not a table name.
  await expect(
    issue.getByText("Paid for 1, issued 0. The buyer has a receipt and no ticket."),
  ).toBeVisible();
  await expect(issue.getByText("Critical", { exact: true })).toBeVisible();
  await expect(issue.getByRole("button", { name: SHORTFALL_ACTION })).toBeVisible();
  await page.screenshot({ path: `${EVIDENCE}/10-issues-from-the-rail.png`, fullPage: true });
});

test("Issues: the action answers truthfully, writes the refund it promises, and the row clears", async ({
  page,
}) => {
  const db = isolatedService();
  const target = await oldestUndecidedShortfall();

  await openAdmin(page, "/admin/exceptions");
  const heading = page.getByRole("heading", { level: 1, name: /needs? a person/i });
  await expect(heading).toBeVisible({ timeout: 90_000 });
  const before = Number((await heading.innerText()).match(/^(\d+)/)?.[1] ?? "0");

  const issue = issueRowFor(page, target.orderId);
  await expect(issue.getByText(SHORTFALL_TITLE)).toBeVisible();
  await issue.getByRole("button", { name: SHORTFALL_ACTION }).click();

  // THE ANSWER IS A DECISION, SAID AS A SENTENCE. It used to be "Already
  // handled - nothing to do." while a refund appeared elsewhere with nobody
  // told. The keyed answer also exists in Spanish and French
  // (`outcome-copy.static.test.ts`).
  await expect(issue.getByRole("status")).toHaveText(
    /This seat was lost after the buyer paid.*A refund is owed instead/,
    { timeout: 90_000 },
  );
  await page.screenshot({ path: `${EVIDENCE}/11-issues-action-answer.png`, fullPage: true });

  // THE DATABASE AGREES: the refund it promised exists, and no ticket was
  // conjured for a seat that is gone.
  const intent = await db
    .from("ticket_refund_intents")
    .select("id, reason, executed_at, order_id")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .eq("order_line_id", target.orderLineId)
    .maybeSingle();
  expect(intent.data?.reason).toBe("seat_lost_after_payment");
  expect(intent.data?.executed_at).toBeNull();
  expect(intent.data?.order_id).toBe(target.orderId);
  const minted = await db
    .from("admissions")
    .select("id")
    .eq("order_line_id", target.orderLineId);
  expect(minted.data ?? []).toHaveLength(0);

  // THE ROW CLEARS. Reloaded, the critical row is gone and the same order now
  // sits in the list ONCE, as the refund the door person was told about.
  await page.reload();
  await expect(heading).toBeVisible({ timeout: 90_000 });
  const after = issueRowFor(page, target.orderId);
  await expect(after).toHaveCount(1, { timeout: 90_000 });
  await expect(after.getByText(REFUND_TITLE)).toBeVisible();
  await expect(after.getByText(SHORTFALL_TITLE)).toHaveCount(0);
  const afterCount = Number((await heading.innerText()).match(/^(\d+)/)?.[1] ?? "0");
  expect(afterCount, "one problem, one row: the count does not grow").toBe(before);
  await page.screenshot({ path: `${EVIDENCE}/12-issues-row-cleared.png`, fullPage: true });
});

// ── Cross-workspace isolation, for the records Issues points at ───────

test("isolation: B's order really exists, and A's inbox does not carry it", async ({ page }) => {
  const db = isolatedService();
  const { data: order } = await db
    .from("orders")
    .select("id, tenant_id, status")
    .eq("id", B_ORDER_ID)
    .maybeSingle();
  expect(order?.tenant_id, "workspace B must hold its own order").toBe(B_TENANT_ID);

  await openAdmin(page, "/admin/exceptions");
  await expect(page.getByRole("heading", { level: 1, name: /needs? a person/i })).toBeVisible({
    timeout: 90_000,
  });
  await expect(page.locator(`a[href*="${B_ORDER_ID}"]`)).toHaveCount(0);

  // THE RECORD ITSELF, by the address the inbox's "Open" link uses. On A's
  // host, as A's owner, B's order is not there, and the desk is still a desk.
  await page.goto(`/admin/orders?q=${B_ORDER_ID}`);
  await expect(page.getByRole("heading", { level: 1, name: "Orders" })).toBeVisible({
    timeout: 90_000,
  });
  await expect(page.getByText(/application error|something went wrong/i)).toHaveCount(0);
  await expect(page.getByText(B_ORDER_ID.slice(0, 8).toUpperCase())).toHaveCount(0);
  await page.screenshot({ path: `${EVIDENCE}/13-isolation-a-cannot-open-b-order.png`, fullPage: true });
});

test("isolation: B's own owner opens that same order, which is what makes A's refusal authorization", async ({
  page,
}) => {
  await signInAsBOwner(page, `/admin/orders?q=${B_ORDER_ID}`);
  await page.goto(`${B_ORIGIN}/admin/orders?q=${B_ORDER_ID}`);
  await assertNotAuthWall(page);
  await expect(page.getByRole("heading", { level: 1, name: "Orders" })).toBeVisible({
    timeout: 90_000,
  });
  await expect(
    page.getByText(B_ORDER_ID.slice(0, 8).toUpperCase()).first(),
    "B's owner must reach B's own order by the same address A was refused",
  ).toBeVisible({ timeout: 90_000 });
  await page.screenshot({ path: `${EVIDENCE}/14-isolation-b-owner-opens-order.png`, fullPage: true });
});
