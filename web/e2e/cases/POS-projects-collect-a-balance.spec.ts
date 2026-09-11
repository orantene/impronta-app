/**
 * POS PROJECTS — a manager collects a balance on a project from the point of
 * sale, and every figure traces to its rows.
 *
 * WHAT THIS PROVES. The Projects mode is reached from the point of sale's own
 * rail; a client or project is found by name; what is owed is the projects
 * reader's figure under the orders desk's rule (a query restates it here and
 * the WRONG rule is computed on purpose so agreement is not a tautology); a
 * cash deposit is collected through the counter's engine and the balance after
 * is read back through the reader; a cancelled order attached afterwards moves
 * nothing; the receipt opens by its public code; and Collect is refused in a
 * sentence while a version of the agreement is waiting on the client.
 *
 * WHAT IT SEEDS, AND HOW. The project is made through the real interface: the
 * fixture's talent approves a sent offer from their inbox, the client approves
 * it from their messages, and staff press Create booking on the conversation,
 * which mints the order from the accepted offer (`bookings_write_order`). Two
 * rows are NOT made through an interface, because none exists, and each is
 * named in the annotations: the cancelled order attached to a booked project
 * (nothing on the platform mints a second order on a booked inquiry) and the
 * agreement version waiting on the client (an amendment is drafted on the
 * conversation's offer composer, which this spec does not drive). Both are
 * inserted on the isolated database only and the second is reverted.
 */
import { type Page } from "@playwright/test";
import {
  test,
  expect,
  prepareJourneysPage,
  signInJourneysStaff,
  skipUnlessFixture,
  assertWorkspaceIdentity,
  assertNotAuthWall,
  JOURNEYS_SLUG,
  JOURNEYS_TALENT_EMAIL,
} from "./_harness";
import {
  isolatedService,
  JOURNEYS_TENANT_ID,
  QA_JOURNEYS_TALENT_ID,
  inquiryOfferApprovals,
  latestGuestDirectoryInquiry,
  latestInquiryOffer,
} from "./_isolated-db";
import { bookingOnInquiry, money, ordersOnInquiry, owedCents, type OrderFact } from "./_money-db";

skipUnlessFixture();

/** The wrong rule, on purpose: what a screen shows if it forgets the status half. */
function naiveOwed(rows: readonly OrderFact[]): number {
  return rows.reduce((sum, r) => sum + Math.max(0, r.totalCents - r.collectedCents), 0);
}

function figureValue(page: Page, label: string) {
  return page.locator("dt", { hasText: label }).first().locator("xpath=following-sibling::dd[1]");
}

test.beforeEach(async ({ page }) => {
  await prepareJourneysPage(page);
});

/**
 * A project with a real balance, made through the interface.
 *
 * Prefers a project that already owes money (a previous run's leftover) so a
 * re-run does not consume another sent offer; otherwise walks the fixture's
 * next sent offer through talent approval, client approval and Create booking.
 * Returns the inquiry the project hangs off.
 */
async function projectWithBalance(page: Page, annotate: (type: string, description: string) => void): Promise<{
  inquiryId: string;
  projectId: string;
  clientName: string;
}> {
  const sb = isolatedService();

  // 1 — an existing project owing money? (`POS_PROJECTS_FRESH_SEED=1` walks
  //     the whole chain again even when one exists.)
  const { data: bookings } = process.env.POS_PROJECTS_FRESH_SEED === "1" ? { data: [] } : await sb
    .from("agency_bookings")
    .select("id, source_inquiry_id, contact_name, client_account_name, status")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .not("source_inquiry_id", "is", null)
    .in("status", ["confirmed", "in_progress", "tentative", "draft"])
    .order("created_at", { ascending: false })
    .limit(20);
  for (const b of (bookings ?? []) as Array<{ id: string; source_inquiry_id: string; contact_name: string | null; client_account_name: string | null }>) {
    const attached = await ordersOnInquiry(b.source_inquiry_id);
    const owed = attached.reduce((s, o) => s + owedCents(o), 0);
    const { data: live } = await sb
      .from("inquiry_offers")
      .select("status")
      .eq("inquiry_id", b.source_inquiry_id)
      .in("status", ["draft", "sent"]);
    if (owed > 0 && (live ?? []).length === 0) {
      annotate("seed", `reused project ${b.id} on inquiry ${b.source_inquiry_id}, already owing ${owed}`);
      return {
        inquiryId: b.source_inquiry_id,
        projectId: b.id,
        clientName: b.client_account_name ?? b.contact_name ?? "",
      };
    }
  }

  // 2 — A NEW conversation, made through the interface end to end, the
  //     way C08 walks it: a guest asks the agency from the storefront; staff
  //     put QA Journeys Talent on the lineup, price a line at 800 and send
  //     the offer; the talent approves it from their inbox; the client
  //     claims the account the inquiry was provisioned for ("I'm a client")
  //     and approves; staff press Create booking. The fixture's leftover
  //     sent offers cannot be used: their clients were never claimed and an
  //     onboarded client with no relationship has no way into this
  //     workspace's client surface.
  const stamp = Date.now();
  const contactEmail = `pos-projects-${stamp}@impronta.test`;
  const contactName = "Nadia Varela";
  const brief = "A brand shoot with one model, to be collected at the desk.";

  await page.goto("/directory?inquiry=open");
  await assertNotAuthWall(page);
  const chat = page.getByRole("dialog", { name: /message (the agency|qa journeys)/i });
  await expect(chat).toBeVisible({ timeout: 20_000 });
  const start = chat.getByRole("button", { name: /start a new inquiry/i });
  if (await start.isVisible().catch(() => false)) {
    await start.click();
  } else {
    await chat.getByRole("tab", { name: /^chat$/i }).click();
  }
  const composer = chat.getByPlaceholder(/type your message|write a reply|type a message/i);
  await expect(composer).toBeVisible({ timeout: 30_000 });
  await composer.fill(brief);
  const sendLine = chat.getByRole("button", { name: /send message/i }).first();
  if (await sendLine.isVisible().catch(() => false)) {
    await sendLine.click();
  } else {
    await chat.getByRole("button", { name: /send to agency/i }).click();
  }
  await expect(chat.getByPlaceholder(/^first name$/i)).toBeVisible({ timeout: 20_000 });
  await chat.getByPlaceholder(/^first name$/i).fill("Nadia");
  await chat.getByPlaceholder(/^last name$/i).fill("Varela");
  await chat.getByPlaceholder(/email/i).fill(contactEmail);
  await chat.getByRole("button", { name: /^send message$/i }).click();
  await expect(
    chat.getByText(/inquiry received|got it, we've received your message|sent, awaiting reply/i).first(),
  ).toBeVisible({ timeout: 40_000 });
  const guest = await latestGuestDirectoryInquiry(contactEmail);
  expect(guest, "the guest inquiry must exist").not.toBeNull();
  const inquiryId = guest!.inquiryId;
  annotate("seed", `guest inquiry ${inquiryId} from ${contactEmail}`);

  // 3a — staff: lineup, price, send. Classic Messages is the one place the
  //      lineup is edited; the inbox is filtered by the client's name, which
  //      only this conversation carries.
  await signInJourneysStaff(page, "/admin/messages");
  await expect(page).toHaveURL(/\/admin\/messages/, { timeout: 30_000 });
  const inbox = page.locator("[data-tulala-inbox-scroll]");
  await expect(inbox).toBeVisible({ timeout: 40_000 });
  await page.keyboard.press("Escape");
  const allChip = page.getByRole("button", { name: /^all$/i });
  if (await allChip.isVisible().catch(() => false)) await allChip.click();
  const searchPill = page.getByPlaceholder(/search clients, briefs/i);
  await expect(searchPill).toBeVisible({ timeout: 20_000 });
  await searchPill.fill(contactName);
  const row = inbox.getByRole("button", { name: new RegExp(contactName, "i") }).first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.click();
  await page.getByRole("tab", { name: /^lineup$/i }).click();
  await expect(page.locator("[data-live-lineup-loading]")).toHaveCount(0, { timeout: 20_000 });
  const manage = page.getByText(/^manage$/i);
  if (await manage.isVisible().catch(() => false)) await manage.click();
  if (!(await page.getByText(/qa journeys talent/i).first().isVisible().catch(() => false))) {
    const addTalent = page.getByRole("button", { name: /^add talent$/i });
    await expect(addTalent).toBeVisible({ timeout: 20_000 });
    await addTalent.click();
    const rosterSearch = page.getByPlaceholder(/search roster/i);
    await expect(rosterSearch).toBeVisible({ timeout: 10_000 });
    await rosterSearch.fill("QA Journeys");
    await page.getByRole("button", { name: /qa journeys talent/i }).click();
    await expect(page.getByText(/invited|added to lineup/i).first()).toBeVisible({ timeout: 20_000 });
  }
  await page.getByRole("tab", { name: /^offer$/i }).click();
  const startOffer = page.getByRole("button", { name: /start drafting offer/i });
  if (await startOffer.isVisible().catch(() => false)) {
    await startOffer.click();
    await expect(page.getByText(/offer draft created/i)).toBeVisible({ timeout: 20_000 });
  }
  const addLine = page.getByRole("button", { name: /\+ add line item/i });
  // A draft that already exists shows a collapsed "Draft editor" card with
  // an Edit button; a fresh one opens expanded.
  if (!(await addLine.waitFor({ state: "visible", timeout: 5_000 }).then(() => true, () => false))) {
    await page.getByRole("button", { name: /^edit$/i }).first().click();
  }
  await expect(addLine).toBeVisible({ timeout: 20_000 });
  const talentSelect = page
    .locator("select")
    .filter({ has: page.locator("option", { hasText: /qa journeys talent/i }) });
  if ((await talentSelect.count()) === 0) await addLine.click();
  await expect(talentSelect.first()).toBeVisible({ timeout: 10_000 });
  await talentSelect.first().selectOption({ label: "QA Journeys Talent" });
  const rate = page.locator('input[placeholder="rate"]').first();
  await expect(rate).toBeVisible({ timeout: 10_000 });
  await rate.fill("800");
  await page.getByRole("button", { name: /^save draft$/i }).click();
  await expect(page.getByText(/saved ·/i).first()).toBeVisible({ timeout: 20_000 });
  const sendOffer = page.getByRole("button", { name: /^send to client$/i });
  await expect(sendOffer).toBeEnabled({ timeout: 20_000 });
  await sendOffer.click();
  await expect(
    page.getByText(/send offer done|awaiting client and talent approval/i).first(),
  ).toBeVisible({ timeout: 30_000 });
  const sentOffer = await latestInquiryOffer(inquiryId);
  expect(sentOffer?.status, "the offer is out").toBe("sent");
  const offerId = sentOffer!.offerId;
  annotate("seed", `staff sent offer ${offerId} at 800 on ${inquiryId}`);

  // 3b — the talent approves it from their inbox, if they have not.
  let approvals = await inquiryOfferApprovals(offerId);
  if (approvals.find((r) => r.talentProfileId === QA_JOURNEYS_TALENT_ID)?.status !== "accepted") {
    await signInJourneysStaff(page, `/talent/inbox/${inquiryId}`, JOURNEYS_TALENT_EMAIL);
    await expect(page).toHaveURL(/\/talent\/inbox/, { timeout: 40_000 });
    await expect(page.getByPlaceholder(/search jobs/i)).toBeVisible({ timeout: 40_000 });
    const approve = page.getByRole("button", { name: /approve offer/i });
    // The deep link selects the conversation; give it a real wait before
    // falling back to the list, where the fixture has MANY rows for the same
    // client and only the ones at the Offer stage carry the button.
    if (!(await approve.waitFor({ state: "visible", timeout: 20_000 }).then(() => true, () => false))) {
      await page.goto("/talent/inbox");
      await expect(page.getByPlaceholder(/search jobs/i)).toBeVisible({ timeout: 40_000 });
      const allChip = page.getByRole("button", { name: /^all( jobs)?$/i });
      if (await allChip.isVisible().catch(() => false)) await allChip.click();
      const row = page
        .locator("[data-tulala-inbox-row]")
        .filter({ hasText: new RegExp(contactName || "cora cuevas", "i") })
        .filter({ hasText: /offer/i })
        .filter({ hasText: /awaiting you/i })
        .first();
      await expect(row).toBeVisible({ timeout: 40_000 });
      await row.click();
    }
    await expect(approve).toBeVisible({ timeout: 40_000 });
    await approve.click();
    // The inbox re-renders (and sometimes re-navigates) after the approval;
    // the row is the fact, so it is what is waited on.
    await expect
      .poll(
        async () =>
          (await inquiryOfferApprovals(offerId)).find((r) => r.talentProfileId === QA_JOURNEYS_TALENT_ID)?.status,
        { message: "the talent's approval must be recorded", timeout: 30_000 },
      )
      .toBe("accepted");
    approvals = await inquiryOfferApprovals(offerId);
    annotate("seed", `talent approved offer ${offerId}`);
  }

  // 3c — the client approves it from their messages, if they have not.
  if (approvals.some((r) => r.role === "client" && r.status !== "accepted") || !approvals.some((r) => r.role === "client")) {
    const messagesPath = `/${JOURNEYS_SLUG}/client/messages?inquiry=${inquiryId}&tab=offer`;
    // A guest has NO account until they sign up or open the claim email;
    // there is no mailbox here, so the account is provisioned with the auth
    // admin API, confirmed, the way the fixture's own accounts were. The
    // claim of THIS workspace ("I'm a client" on /onboarding/role, which
    // records the relationship the client surface gates on) and the
    // approval itself go through the interface.
    const { error: createErr } = await sb.auth.admin.createUser({ email: contactEmail, email_confirm: true });
    expect(createErr, "the client account must be provisioned").toBeNull();
    annotate("provisioned", `auth account for ${contactEmail} (confirmed) via the admin API; no mailbox exists here`);
    await signInJourneysStaff(page, `/onboarding/role?next=${encodeURIComponent(messagesPath)}`, contactEmail);
    if (/\/onboarding\/role/.test(page.url())) {
      const chooseClient = page.getByRole("button", { name: /i'm a client/i });
      await expect(chooseClient).toBeVisible({ timeout: 30_000 });
      await chooseClient.click();
      await expect(page).not.toHaveURL(/\/onboarding\/role/, { timeout: 30_000 });
      annotate("seed", `client ${contactEmail} claimed their account on this workspace`);
    }
    // "I'm a client" runs `complete_client_onboarding()` as the user. Until
    // 20260911022138 the BEFORE UPDATE guard on profiles reverted the
    // status the RPC set and this spec corrected it with the service role;
    // the guard now honours the onboarding RPCs, so the row is READ here and
    // asserted, never written: the interface is the only path.
    const { data: claimedUser } = await sb.auth.admin.listUsers({ perPage: 1000 });
    const claimedId = claimedUser?.users.find((u) => u.email === contactEmail)?.id ?? null;
    expect(claimedId, "the claimed account").toBeTruthy();
    const { data: profileRow } = await sb
      .from("profiles")
      .select("account_status, onboarding_completed_at")
      .eq("id", claimedId!)
      .maybeSingle();
    const claimedProfile = profileRow as { account_status?: string; onboarding_completed_at?: string | null } | null;
    expect(
      claimedProfile?.account_status,
      "\"I'm a client\" must leave profiles.account_status = 'active' through the RPC alone (20260911022138)",
    ).toBe("active");
    expect(claimedProfile?.onboarding_completed_at, "onboarding_completed_at must be stamped by the RPC").toBeTruthy();
    annotate("proof", `profiles.account_status = active for ${contactEmail} through complete_client_onboarding, no service-role write`);
    await page.goto(messagesPath);
    await expect(page).toHaveURL(new RegExp(`(?:/${JOURNEYS_SLUG})?/client/messages`), { timeout: 40_000 });
    const offerTab = page.getByRole("tab", { name: /^offer$/i });
    if (await offerTab.isVisible().catch(() => false)) await offerTab.click();
    const approveLock = page.getByRole("button", { name: /approve & lock/i });
    const accepted = page
      .getByText(/you approved this offer|you approved · awaiting others|offer approved|offer accepted|approved, booking soon|all approvals are complete/i)
      .first();
    await expect(approveLock.first().or(accepted)).toBeVisible({ timeout: 40_000 });
    if (await approveLock.first().isVisible().catch(() => false)) {
      await approveLock.first().click();
      await expect(approveLock.nth(1)).toBeVisible({ timeout: 15_000 });
      await approveLock.nth(1).click();
      await expect(accepted).toBeVisible({ timeout: 30_000 });
    } else {
      // A guest-made inquiry has no client participant at send time, so the
      // offer needs only the talent's approval and the client's screen
      // already reads accepted. Their view is still opened here so the
      // claim path is exercised.
      annotate("seed", "the client's screen already read accepted: a guest inquiry seeds no client approval");
    }
    const clientApproval = approvals.find((r) => r.role === "client");
    if (clientApproval) expect(clientApproval.status).toBe("accepted");
    annotate("seed", `client ${contactEmail} saw offer ${offerId} accepted`);
  }
  const offer = await latestInquiryOffer(inquiryId);
  expect(offer?.status, "every party accepted, so the offer is accepted").toBe("accepted");
  const ready = { inquiryId, contactName };

  // 4 — staff press Create booking on the conversation.
  await signInJourneysStaff(page, `/admin/work/${ready.inquiryId}`);
  const before = await ordersOnInquiry(ready.inquiryId);
  const createBooking = page.getByRole("button", { name: /create booking/i });
  await expect(createBooking, "an approved inquiry offers Create booking").toBeVisible({ timeout: 30_000 });
  await createBooking.click();
  await expect
    .poll(async () => (await ordersOnInquiry(ready.inquiryId)).length, {
      message: "Create booking must mint the order from the accepted offer",
      timeout: 60_000,
    })
    .toBeGreaterThan(before.length);
  const booking = await bookingOnInquiry(ready.inquiryId);
  expect(booking, "Create booking must open a project on this conversation").toBeTruthy();
  annotate("seed", `Create booking minted the order; project ${booking!.id}`);
  return { inquiryId: ready.inquiryId, projectId: booking!.id, clientName: ready.contactName };
}

test("POS PROJECTS: find a project, see what is owed with its rows, collect a deposit, and a cancelled order moves nothing", async ({
  page,
}, testInfo) => {
  test.setTimeout(600_000);
  const shot = async (name: string) => {
    await page.screenshot({ path: testInfo.outputPath(`${name}.png`), fullPage: true });
  };
  const annotate = (type: string, description: string) => testInfo.annotations.push({ type, description });
  const sb = isolatedService();

  const seed = await projectWithBalance(page, annotate);
  const { inquiryId, projectId } = seed;

  // ────────────────────────────────────────────────────────────────────
  // 0 — SETTINGS: the Collect mode is switched on for this workspace, and
  //     the counter with it (the fixture's settings are shared with every
  //     other proof on this database, so neither is assumed on).
  // ────────────────────────────────────────────────────────────────────
  await signInJourneysStaff(page, "/admin/settings");
  const posSection = page.locator('[data-settings-section="pos"]');
  for (let attempt = 0; attempt < 5 && !(await posSection.isVisible()); attempt += 1) {
    await page.getByRole("button", { name: /^(point of sale|punto de venta|point de vente)/i }).click();
    await page.waitForTimeout(1_000);
  }
  await expect(posSection).toBeVisible({ timeout: 30_000 });
  const card = page.getByTestId("pos-modes-card");
  await expect(card).toBeVisible({ timeout: 30_000 });
  for (const name of [/^(collect|cobrar|encaisser)/i, /^(counter|mostrador|comptoir)/i]) {
    const modeSwitch = card.getByRole("switch", { name });
    await expect(modeSwitch, "a built mode's switch must be usable").toBeEnabled({ timeout: 30_000 });
    if ((await modeSwitch.getAttribute("aria-checked")) !== "true") {
      await modeSwitch.click();
      await expect(modeSwitch).toHaveAttribute("aria-checked", "true", { timeout: 30_000 });
    }
  }
  await shot("00-settings-collect-on");
  const { data: agency } = await sb.from("agencies").select("settings").eq("id", JOURNEYS_TENANT_ID).maybeSingle();
  const storedModes = (agency as { settings?: { pos?: { locations?: { default?: { modes?: string[] } } } } } | null)
    ?.settings?.pos?.locations?.default?.modes;
  expect(storedModes, "the settings card persists the mode under its one id").toContain("projects");

  // ────────────────────────────────────────────────────────────────────
  // 1 — THE MODE, from the top bar's own switch, then its rail.
  // ────────────────────────────────────────────────────────────────────
  await page.goto("/admin");
  const control = page.getByRole("group", { name: /workspace or point of sale/i });
  await expect(control, "the top bar switch is the desktop door into the till").toBeVisible({ timeout: 30_000 });
  // The switch is client state; a click that lands before hydration is a
  // click on nothing, so it is repeated until the menu (several modes are
  // on) or the mode's address appears.
  const menu = page.getByRole("menu");
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await control.getByRole("button").nth(1).click();
    if (await menu.waitFor({ state: "visible", timeout: 3_000 }).then(() => true, () => false)) {
      await menu.getByRole("menuitem", { name: /^(collect|cobrar|encaisser)$/i }).click();
      break;
    }
    if (/\/admin\/pos\?mode=projects/.test(page.url())) break;
  }
  await expect(page).toHaveURL(/\/admin\/pos\?mode=projects/, { timeout: 30_000 });
  await assertWorkspaceIdentity(page);
  await expect(page.locator("[data-tulala-app-sidebar]")).toHaveCount(0);
  const rail = page.getByRole("navigation", { name: /^(collect|cobrar|encaisser)$/i });
  await expect(rail, "the Collect mode renders its own rail").toBeVisible({ timeout: 30_000 });
  await expect(rail.getByRole("button", { name: /^collect$/i })).toHaveAttribute("aria-current", "page");
  await expect(rail.getByRole("button", { name: /^projects$/i })).toBeVisible();
  await expect(rail.getByRole("button", { name: /^receipts$/i })).toBeVisible();
  await expect(rail.getByRole("button", { name: /^links$/i })).toBeVisible();
  await shot("01-projects-mode-landing");

  // ────────────────────────────────────────────────────────────────────
  // 2 — FIND the project by the client's name; the row's Owed is the rule.
  // ────────────────────────────────────────────────────────────────────
  const attachedBefore = await ordersOnInquiry(inquiryId);
  const dueBefore = attachedBefore.reduce((s, o) => s + owedCents(o), 0);
  const currency = attachedBefore[0]!.currency;
  const orderTotalCents = attachedBefore.find((o) => owedCents(o) > 0)!.totalCents;
  const collectedBefore = attachedBefore.reduce((s, o) => s + o.collectedCents, 0);
  expect(dueBefore, "the seeded project must owe money").toBeGreaterThan(0);

  const needle = seed.clientName.split(" ")[0] ?? seed.clientName;
  await page.getByLabel(/client or project/i).fill(needle);
  const row = page.locator(`[data-pos-project-row="${projectId}"]`);
  await expect(row, "typing the client's name finds the project").toBeVisible({ timeout: 30_000 });
  await expect(row.locator("[data-pos-project-owed]"), "the row's Owed is the desk's rule").toHaveText(
    money(dueBefore, currency),
  );
  await shot("02-find-by-client-name");
  // The row itself is the tap target (O07): no separate Open button.
  await row.click();

  // ────────────────────────────────────────────────────────────────────
  // 3 — WHAT IS OWED, and the rows it comes from.
  // ────────────────────────────────────────────────────────────────────
  const detail = page.locator(`[data-pos-projects-detail="${projectId}"]`);
  await expect(detail).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("[data-pos-projects-due]")).toHaveText(money(dueBefore, currency));
  for (const o of attachedBefore) {
    await expect(page.locator(`[data-pos-projects-row="${o.id}"]`), `row for order ${o.id}`).toBeVisible();
  }
  await expect(page.locator("[data-pos-projects-next-action]")).toHaveText("Collect the balance");
  const openCollect = page.locator("[data-pos-projects-open-collect]");
  await expect(openCollect).toHaveText(`Collect ${money(dueBefore, currency)}`);
  await shot("03-project-owed-with-rows");

  // ────────────────────────────────────────────────────────────────────
  // 4 — COLLECT A DEPOSIT in cash, through the counter's engine.
  // ────────────────────────────────────────────────────────────────────
  const depositCents = Math.min(30000, Math.floor(dueBefore / 2));
  await openCollect.click();
  await expect(page.locator("[data-pos-projects-collect]")).toBeVisible();
  await page.getByRole("button", { name: /^a deposit$/i }).click();
  await page.getByLabel(/deposit amount/i).fill(String(depositCents / 100));
  await expect(
    page.locator("[data-pos-projects-collect]").locator("[data-pos-amount-due]"),
    "the sheet's amount is the deposit, not the balance",
  ).toHaveText(money(depositCents, currency));
  await shot("04-collect-a-deposit");
  await page.locator("[data-pos-confirm-cash]").click();
  const collectedPanel = page.locator("[data-pos-projects-collected]");
  await expect(collectedPanel, "the money lands and the screen says so").toBeVisible({ timeout: 60_000 });
  await expect(page.locator("[data-pos-projects-collected-amount]")).toHaveText(money(depositCents, currency));
  await expect(page.locator("[data-pos-projects-collected-remaining]")).toHaveText(
    money(dueBefore - depositCents, currency),
  );
  const receiptLink = page.locator("[data-pos-receipt-link]").first();
  await expect(receiptLink, "a receipt code was issued").toBeVisible();
  const receiptHref = (await receiptLink.getAttribute("href")) ?? "";
  const receiptCode = receiptHref.split("/r/")[1] ?? "";
  expect(receiptCode.length, "the receipt link carries a public code").toBeGreaterThanOrEqual(16);
  await shot("05-collected");

  // The rows: one PAID transaction of exactly the deposit, order still owed.
  const attachedAfter = await ordersOnInquiry(inquiryId);
  const dueAfter = attachedAfter.reduce((s, o) => s + owedCents(o), 0);
  expect(dueAfter, "the desk's rule after the deposit").toBe(dueBefore - depositCents);
  const collectedOrder = attachedAfter.find((o) => o.status === "pending_payment" && o.collectedCents > 0);
  expect(collectedOrder?.status, "a deposit does not settle the order").toBe("pending_payment");

  // ────────────────────────────────────────────────────────────────────
  // 5 — THE BALANCE AFTER, read back through the reader.
  // ────────────────────────────────────────────────────────────────────
  await page.getByRole("button", { name: /back to the project/i }).click();
  await page.reload();
  await expect(page.locator("[data-pos-projects-due]"), "the balance after is the reader's figure").toHaveText(
    money(dueAfter, currency),
    { timeout: 30_000 },
  );
  // Collected on the project is everything PAID across its records, so a
  // re-run on a project that already took a deposit reads both.
  await expect(page.locator("[data-pos-projects-collected-total]")).toHaveText(
    money(collectedBefore + depositCents, currency),
  );
  await expect(page.locator("[data-pos-projects-open-collect]")).toHaveText(`Collect ${money(dueAfter, currency)}`);
  await shot("06-balance-after");

  // ────────────────────────────────────────────────────────────────────
  // 6 — A CANCELLED ORDER attached to the project moves nothing.
  //
  // No interface mints a second order on a booked inquiry, so the row is
  // inserted here, in the shape `bookings_write_order` produces, already
  // cancelled. It stays in the fixture and is named in the annotations.
  // ────────────────────────────────────────────────────────────────────
  const customerId = attachedAfter[0]!.customerId;
  const { data: inserted, error: insErr } = await sb
    .from("orders")
    .insert({
      tenant_id: JOURNEYS_TENANT_ID,
      customer_id: customerId,
      inquiry_id: inquiryId,
      status: "cancelled",
      currency,
      subtotal_cents: 20000,
      discount_cents: 0,
      tax_cents: 0,
      total_cents: 20000,
      source_channel: "offer",
      payout_release_rule: "immediate",
    })
    .select("id")
    .single();
  expect(insErr, "the cancelled order must insert").toBeNull();
  const cancelledId = String((inserted as { id: string }).id);
  annotate("inserted", `cancelled order ${cancelledId} (20000 ${currency}) attached to inquiry ${inquiryId}`);

  const attachedWithCancelled = await ordersOnInquiry(inquiryId);
  const dueWithCancelled = attachedWithCancelled.reduce((s, o) => s + owedCents(o), 0);
  expect(dueWithCancelled, "the desk's rule ignores the cancelled order").toBe(dueAfter);
  const wrong = naiveOwed(attachedWithCancelled);
  expect(wrong, "the wrong rule would count it").toBe(naiveOwed(attachedAfter) + 20000);
  expect(wrong, "and the two rules disagree on this project").toBeGreaterThan(dueWithCancelled);

  await page.reload();
  await expect(page.locator("[data-pos-projects-due]"), "the cancelled order moved nothing").toHaveText(
    money(dueAfter, currency),
    { timeout: 30_000 },
  );
  const cancelledRow = page.locator(`[data-pos-projects-row="${cancelledId}"]`);
  await expect(cancelledRow, "and it is shown, not hidden").toBeVisible();
  await expect(cancelledRow).toContainText("Cancelled");
  await expect(cancelledRow.locator("[data-pos-projects-row-outstanding]")).toContainText(money(0, currency));
  await expect(page.locator("[data-pos-projects-money]")).not.toContainText(money(wrong, currency));
  await shot("07-cancelled-order-moves-nothing");

  // ────────────────────────────────────────────────────────────────────
  // 7 — THE RECEIPT, by its public code, from the rail.
  // ────────────────────────────────────────────────────────────────────
  await rail.getByRole("button", { name: /^receipts$/i }).click();
  await page.getByLabel(/receipt code/i).fill(receiptCode);
  await page.getByRole("button", { name: /find the receipt/i }).click();
  await expect(page.locator(`[data-pos-projects-receipt="${receiptCode}"]`)).toBeVisible({ timeout: 30_000 });
  const collectedOnOrder = attachedAfter.find((o) => o.id === collectedOrder!.id)!.collectedCents;
  await expect(figureValue(page, "Collected")).toHaveText(money(collectedOnOrder, currency));
  await shot("08-receipt-by-code");
  // A code nobody minted is refused in a sentence.
  await page.getByLabel(/receipt code/i).fill("zzzzzzzzzzzzzzzzzzzz");
  await page.getByRole("button", { name: /find the receipt/i }).click();
  await expect(page.locator('[data-pos-projects-receipt-refusal="not_found"]')).toBeVisible({ timeout: 30_000 });
  await shot("08b-receipt-unknown-code");
  // And the public page itself opens.
  const receiptPage = await page.context().newPage();
  await receiptPage.goto(`/r/${receiptCode}`);
  // The public receipt is the ORDER's: it lists what was bought and the
  // order's total. It says nothing about a deposit or what is still owed
  // (a finding for the receipt's owner, recorded in the README); the
  // desk's own Receipts screen above is where the collected figure reads.
  await expect(receiptPage.locator("body")).toContainText(money(orderTotalCents, currency), { timeout: 30_000 });
  await expect(receiptPage.locator("body")).toContainText(/receipt/i);
  await receiptPage.screenshot({ path: testInfo.outputPath("09-public-receipt.png"), fullPage: true });
  await receiptPage.close();

  // ────────────────────────────────────────────────────────────────────
  // 8 — THE PROJECTS BOARD: every project with its one next action, and a
  //     project's milestones and deliverables.
  // ────────────────────────────────────────────────────────────────────
  await rail.getByRole("button", { name: /^projects$/i }).click();
  await expect(page.locator("[data-pos-projects-list]")).toBeVisible({ timeout: 30_000 });
  await shot("10-projects-board");
  await page.locator(`[data-pos-project-row="${projectId}"]`).click();
  await expect(page.locator("[data-pos-projects-milestones]")).toBeVisible({ timeout: 30_000 });
  await expect(page.locator("[data-pos-projects-next-action]")).toHaveText("Collect the balance");
  await shot("11-project-milestones");

  // ────────────────────────────────────────────────────────────────────
  // 9 — COLLECT IS NEVER OFFERED while a version of the agreement is
  //     waiting on the client. The amendment is drafted on the conversation's
  //     offer composer, which this spec does not drive; the state is made on
  //     the isolated database (accepted version superseded, a sent copy on
  //     top) and reverted in `finally`.
  // ────────────────────────────────────────────────────────────────────
  const { data: acceptedRow } = await sb
    .from("inquiry_offers")
    .select("id, version, tenant_id, currency_code, total_client_price, coordinator_fee")
    .eq("inquiry_id", inquiryId)
    .eq("status", "accepted")
    .maybeSingle();
  expect(acceptedRow, "the project's accepted version").toBeTruthy();
  const accepted = acceptedRow as { id: string; version: number; tenant_id: string; currency_code: string | null; total_client_price: number | null; coordinator_fee: number | null };
  let sentId: string | null = null;
  try {
    const { error: supErr } = await sb.from("inquiry_offers").update({ status: "superseded" }).eq("id", accepted.id);
    expect(supErr).toBeNull();
    const { data: sentRow, error: sentErr } = await sb
      .from("inquiry_offers")
      .insert({
        inquiry_id: inquiryId,
        tenant_id: accepted.tenant_id,
        version: accepted.version + 1,
        status: "sent",
        currency_code: accepted.currency_code ?? currency,
        total_client_price: accepted.total_client_price,
        coordinator_fee: accepted.coordinator_fee,
        sent_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    expect(sentErr, "a sent version on top must insert").toBeNull();
    sentId = String((sentRow as { id: string }).id);
    annotate("mutated", `offer ${accepted.id} superseded and sent v${accepted.version + 1} ${sentId} inserted, then reverted`);

    await page.reload();
    await expect(page.locator(`[data-pos-projects-detail="${projectId}"]`)).toBeVisible({ timeout: 30_000 });
    await expect(page.locator("[data-pos-projects-open-collect]"), "no Collect button").toHaveCount(0);
    await expect(page.locator('[data-pos-projects-collect-refused="agreement_awaiting"]')).toContainText(
      "Collect is not offered while a version of the agreement is waiting on the client",
    );
    await shot("12-collect-refused-agreement-awaiting");
  } finally {
    if (sentId) await sb.from("inquiry_offers").delete().eq("id", sentId);
    await sb.from("inquiry_offers").update({ status: "accepted" }).eq("id", accepted.id);
  }
  const restored = await latestInquiryOffer(inquiryId);
  expect(restored?.status, "the accepted version is back").toBe("accepted");
  await page.reload();
  await expect(page.locator("[data-pos-projects-open-collect]"), "Collect is back once the terms are settled").toHaveText(
    `Collect ${money(dueAfter, currency)}`,
    { timeout: 30_000 },
  );
});
