/**
 * Proposed booking hours, from publish to the public page.
 *
 * THE CLAIM. A talent publishes a bookable service and nothing invents their
 * week: a PROPOSAL is written, the public booking page says in words that no
 * hours exist, the workspace's Appointments board shows the proposal and says
 * who may accept it, the person accepts it in their own Calendar in their own
 * time zone, and only then does the public page offer times.
 *
 * WHO ACCEPTS. `hours-edit-policy` lets workspace staff write hours only for a
 * resource or an unclaimed person; a claimed talent decides their own. The
 * fixture person here is claimed, so the board must say so rather than offer
 * a button that refuses on the click.
 *
 * FIXTURE. The two seeded talents already have hours, so a third one is
 * provisioned here with the service client (an auth user, its `profiles` row,
 * a `talent_profiles` row and a roster row), exactly the shape
 * `scripts/seed-journeys-program.mjs` and `seed_journeys_program.sql` give the
 * first talent. That person is fixture; the proposal, the hours row and the
 * slots are what is proven, and every one of those is written by a screen.
 *
 * Serial: the publish in the first test is the proposal accepted in the second.
 */
import { test, expect } from "@playwright/test";

import { prepareJourneysPage, signInJourneysStaff } from "../cases/_harness";
import { isolatedService, JOURNEYS_TENANT_ID } from "../cases/_isolated-db";

test.describe.configure({ mode: "serial" });

const ADMIN_PREFIX = process.env.JOURNEYS_ADMIN_PREFIX ?? "";
const PUBLIC_PREFIX = process.env.JOURNEYS_PUBLIC_PREFIX ?? "";
const VENUE_ZONE = "America/Mexico_City";

const stamp = Date.now();
const TALENT_EMAIL = `qa-journeys-talent-c-${stamp}@impronta.test`;
const TALENT_NAME = `QA Stylist C ${stamp}`;
const SERVICE = `Blowout ${stamp}`;
let talentProfileId: string | null = null;

test.beforeEach(async ({ page }) => {
  await prepareJourneysPage(page);
});

test.beforeAll(async () => {
  const db = isolatedService();
  const created = await db.auth.admin.createUser({
    email: TALENT_EMAIL,
    password: `fixture-${stamp}-${Math.random().toString(36).slice(2)}`,
    email_confirm: true,
    user_metadata: { full_name: TALENT_NAME },
  });
  if (created.error || !created.data.user) throw new Error(created.error?.message ?? "no user");
  const userId = created.data.user.id;
  const { error: profileErr } = await db.from("profiles").upsert({
    id: userId,
    display_name: TALENT_NAME,
    app_role: "talent",
    account_status: "active",
    onboarding_completed_at: new Date().toISOString(),
  });
  if (profileErr) throw new Error(profileErr.message);
  const { data: tp, error: tpErr } = await db
    .from("talent_profiles")
    .insert({
      user_id: userId,
      profile_code: `QA-JNY-C${String(stamp).slice(-6)}`,
      display_name: TALENT_NAME,
      created_by_agency_id: JOURNEYS_TENANT_ID,
      profile_kind: "person",
      booking_terms: { directBookingOptIn: true },
      visibility: "public",
      workflow_status: "published",
      is_test_account: true,
      claimed_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (tpErr || !tp) throw new Error(tpErr?.message ?? "no talent profile");
  talentProfileId = (tp as { id: string }).id;
  const { error: rosterErr } = await db.from("agency_talent_roster").insert({
    tenant_id: JOURNEYS_TENANT_ID,
    talent_profile_id: talentProfileId,
    status: "active",
    agency_visibility: "site_visible",
    is_primary: true,
    source_type: "agency_created",
    hub_visibility_status: "not_submitted",
    direct_booking_enabled: true,
  });
  if (rosterErr) throw new Error(rosterErr.message);
});

async function hoursAndProposals(profileId: string) {
  const db = isolatedService();
  const [{ data: hours, error: hErr }, { data: proposals, error: pErr }] = await Promise.all([
    db.from("talent_booking_hours").select("timezone, weekly").eq("talent_profile_id", profileId),
    db
      .from("talent_booking_hours_proposals")
      .select("status, source, timezone")
      .eq("talent_profile_id", profileId),
  ]);
  if (hErr) throw new Error(hErr.message);
  if (pErr) throw new Error(pErr.message);
  return {
    hours: (hours ?? []) as Array<{ timezone: string; weekly: unknown }>,
    proposals: (proposals ?? []) as Array<{
      status: string;
      source: string;
      timezone: string | null;
    }>,
  };
}

test("publishing a bookable service writes a proposal, not hours, and the public page says so", async ({
  page,
}, testInfo) => {
  test.setTimeout(240_000);
  const profileId = talentProfileId!;
  const before = await hoursAndProposals(profileId);
  expect(before.hours).toHaveLength(0);
  expect(before.proposals).toHaveLength(0);

  // The talent, in their own services editor.
  await signInJourneysStaff(page, "/talent/services", TALENT_EMAIL);
  const manager = page.getByTestId("talent-offerings-manager");
  await expect(manager).toBeVisible({ timeout: 30_000 });
  // A talent with nothing yet is offered "+ Add your first service".
  await manager.getByRole("button", { name: /\+ add (a|your first) service/i }).click();
  await manager.getByPlaceholder(/60-min massage/i).fill(SERVICE);
  await manager.getByRole("button", { name: /^fixed$/i }).click();
  await manager.getByRole("spinbutton").first().fill("40");
  await manager.getByRole("button", { name: /direct booking/i }).click();
  await manager.getByRole("button", { name: /\+ add details/i }).click();
  await manager.getByPlaceholder("e.g. 60", { exact: true }).fill("45");
  await manager.getByRole("button", { name: /save — add to my services|save - add to my services/i }).click();
  await expect(manager.getByText(SERVICE)).toBeVisible({ timeout: 30_000 });
  await page.screenshot({ path: testInfo.outputPath("service-published.png"), fullPage: true });

  // A PROPOSAL, AND NO HOURS. This is the whole T1-07 rule.
  const after = await hoursAndProposals(profileId);
  expect(after.hours, "publishing invented hours nobody agreed to").toHaveLength(0);
  expect(after.proposals).toHaveLength(1);
  expect(after.proposals[0]!.status).toBe("proposed");
  expect(after.proposals[0]!.source).toBe("publish_default");

  // The public booking page, as a guest: the honest sentence, not "try later".
  await page.context().clearCookies();
  await page.goto(`${PUBLIC_PREFIX}/book`, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible({ timeout: 30_000 });
  await page.getByRole("combobox").first().selectOption({ label: SERVICE });
  const empty = page.getByTestId("slot-picker-empty");
  await expect(empty).toBeVisible({ timeout: 30_000 });
  await expect(empty).toHaveAttribute("data-reason", "no_booking_hours");
  await expect(empty).toContainText(/nobody has set booking hours/i);
  await expect(page.locator("[data-testid=slot-picker] button")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("public-no-hours.png"), fullPage: true });
});

test("the board names who may accept, the person accepts in their own calendar with their time zone, and the public page offers times", async ({
  page,
}, testInfo) => {
  test.setTimeout(240_000);
  const profileId = talentProfileId!;

  // ── THE WORKSPACE BOARD says the proposal exists and who decides it. A
  // claimed person sets their own hours (`hours-edit-policy`), so the board
  // must not offer an "Accept" that refuses on the click; it did, and the
  // refusal read "This person sets their own hours." only after the press.
  await signInJourneysStaff(page, `${ADMIN_PREFIX}/admin/appts`);
  const banner = page.getByTestId("booking-hours-proposals-banner");
  await expect(banner).toBeVisible({ timeout: 30_000 });
  const row = banner.locator("div").filter({ hasText: TALENT_NAME }).last();
  await expect(row).toContainText(/written when an offering was published/i);
  await expect(row.getByTestId("booking-hours-proposal-self-managed")).toContainText(
    /sets their own hours/i,
  );
  await expect(row.getByTestId("booking-hours-proposal-accept")).toHaveCount(0);
  await page.screenshot({ path: testInfo.outputPath("board-proposal-self-managed.png"), fullPage: true });

  // ── THE PERSON ACCEPTS, in their own Calendar, in their own time zone.
  await page.context().clearCookies();
  await signInJourneysStaff(page, "/talent/calendar", TALENT_EMAIL);
  const card = page.getByTestId("booking-hours-card");
  await expect(card).toBeVisible({ timeout: 30_000 });
  const proposalBanner = card.getByTestId("booking-hours-proposal-banner");
  await expect(proposalBanner).toBeVisible({ timeout: 30_000 });
  const zone = proposalBanner.locator("input");
  await zone.fill(VENUE_ZONE);
  await proposalBanner.getByRole("button", { name: /accept proposed hours/i }).click();
  // The proposal leaves the card once it is a calendar, and the editor now
  // opens on the zone that was accepted. ("Hours accepted" flashes for two
  // seconds and is not what is asserted.)
  await expect(proposalBanner).toHaveCount(0, { timeout: 30_000 });
  await expect(card.getByRole("textbox", { name: /default time zone/i })).toHaveValue(VENUE_ZONE);
  await page.screenshot({ path: testInfo.outputPath("proposal-accepted.png"), fullPage: true });

  const after = await hoursAndProposals(profileId);
  expect(after.hours).toHaveLength(1);
  expect(after.hours[0]!.timezone).toBe(VENUE_ZONE);
  expect(after.proposals).toHaveLength(1);
  expect(after.proposals[0]!.status).toBe("accepted");
  expect(after.proposals[0]!.timezone).toBe(VENUE_ZONE);

  // ── The board no longer lists it once the calendar exists.
  await page.context().clearCookies();
  await signInJourneysStaff(page, `${ADMIN_PREFIX}/admin/appts`);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/appointments/i);
  await expect(page.getByTestId("booking-hours-proposals-banner")).toHaveCount(0);

  // ── And the public page offers times now.
  await page.context().clearCookies();
  await page.goto(`${PUBLIC_PREFIX}/book`, { waitUntil: "domcontentloaded" });
  await page.getByRole("combobox").first().selectOption({ label: SERVICE });
  await expect(page.locator("[data-testid=slot-picker] button").first()).toBeVisible({
    timeout: 30_000,
  });
  await page.screenshot({ path: testInfo.outputPath("public-hours-open.png"), fullPage: true });
});
