/**
 * C08 [representative] — modelling / talent agency.
 * Smoke stays honest. C08-CUS guest directory inquiry is a real journey on qa-journeys.
 */
import {
  test,
  expect,
  openWorkspace,
  openStorefront,
  prepareJourneysPage,
  skipUnlessFixture,
  assertNotAuthWall,
  signInJourneysStaff,
  assertWorkspaceIdentity,
  JOURNEYS_SLUG,
  JOURNEYS_TALENT_EMAIL,
} from "./_harness";
import {
  latestGuestDirectoryInquiry,
  latestAssignedDirectoryInquiry,
  latestSentDirectoryInquiry,
  latestSentOfferAwaitingTalent,
  latestOfferReadyForClientAccept,
  latestInquiryOffer,
  inquiryOfferLines,
  inquiryOfferApprovalCount,
  inquiryOfferApprovals,
  QA_JOURNEYS_TALENT_ID,
} from "./_isolated-db";
import type { Page } from "@playwright/test";

skipUnlessFixture();

test.beforeEach(async ({ page }) => {
  await prepareJourneysPage(page);
});

/**
 * Directory guest chat after the fidelity re-skin keeps a prior thread in the
 * dock. The name/email gate only appears on a first send of a NEW inquiry, so
 * a leftover draft looks like a missing form. Open a fresh thread first.
 */
async function openFreshDirectoryChat(page: Page) {
  // The shared Vercel storageState also carries `impronta_guest` from an
  // earlier inquiry. That guest already has a conversation, so the dock
  // restores the draft ("Not sent") and asks to verify email instead of
  // showing the name/email gate.
  await page.context().clearCookies({ name: "impronta_guest" });
  await page.goto("/directory?inquiry=open");
  await assertNotAuthWall(page);
  const chat = page.getByRole("dialog", { name: /message (the agency|qa journeys)/i });
  await expect(chat).toBeVisible({ timeout: 20_000 });
  const startNew = chat.getByRole("button", { name: /start a new inquiry/i });
  if (!(await startNew.isVisible().catch(() => false))) {
    const switcher = chat.getByRole("button", { name: /switch inquiry/i });
    if (await switcher.isVisible().catch(() => false)) {
      await switcher.click();
    }
  }
  if (await startNew.isVisible().catch(() => false)) {
    await startNew.click();
  } else {
    const chatTab = chat.getByRole("tab", { name: /^chat$/i });
    if (await chatTab.isVisible().catch(() => false)) {
      await chatTab.click();
    }
  }
  return chat;
}

test("C08-CUS smoke: storefront body is reachable — not a journey pass", async ({ page }) => {
  await openStorefront(page);
});

test("C08-OP smoke: operator Sales heading is reachable — not a journey pass", async ({ page }) => {
  await openWorkspace(page, "sales");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
});

test("C08-CUS inquiry: directory guest chat submits and DB agrees", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const marker = `c08-cus-${Date.now()}@impronta.test`;
  const brief = "Need two models for a catalog shoot next month.";

  const chat = await openFreshDirectoryChat(page);

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
  await chat.getByPlaceholder(/^first name$/i).fill("Cora");
  await chat.getByPlaceholder(/^last name$/i).fill("Cuevas");
  await chat.getByPlaceholder(/email/i).fill(marker);
  await chat.getByRole("button", { name: /^send message$/i }).click();

  await expect(
    page.getByText(/inquiry received|got it, we've received your message|sent[,·] awaiting|inquiry sent/i).first(),
  ).toBeVisible({ timeout: 60_000 });

  const persisted = await latestGuestDirectoryInquiry(marker);
  expect(persisted, "guest directory inquiry must exist on qa-journeys").not.toBeNull();
  expect(persisted?.contactEmail).toBe(marker);
  expect(persisted?.contactName?.toLowerCase()).toContain("cora");
  expect(persisted?.status).toMatch(/submitted|draft|coordination/);
  expect(
    `${persisted?.message ?? ""} ${persisted?.sourcePage ?? ""}`.toLowerCase(),
  ).toMatch(/catalog|directory|agency/);

  await page.screenshot({
    path: testInfo.outputPath("c08-cus-inquiry.png"),
    fullPage: true,
  });
});

test("C08-OP assign: staff adds talent and drafts offer", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const marker = `c08-op-${Date.now()}@impronta.test`;
  const brief = "Need two models for a catalog shoot next month.";

  const chat = await openFreshDirectoryChat(page);
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
  await chat.getByPlaceholder(/^first name$/i).fill("Cora");
  await chat.getByPlaceholder(/^last name$/i).fill("Cuevas");
  await chat.getByPlaceholder(/email/i).fill(marker);
  await chat.getByRole("button", { name: /^send message$/i }).click();
  await expect(
    page.getByText(/inquiry received|got it, we've received your message|sent[,·] awaiting|inquiry sent/i).first(),
  ).toBeVisible({ timeout: 60_000 });

  const seed = await latestGuestDirectoryInquiry(marker);
  expect(seed, "C08-OP guest inquiry must exist before staff assign").not.toBeNull();

  await signInJourneysStaff(page, "/admin/messages");
  await assertNotAuthWall(page);
  await page.keyboard.press("Escape");

  const allChip = page.getByRole("button", { name: /^all$/i });
  if (await allChip.isVisible().catch(() => false)) {
    await allChip.click();
  }
  const inbox = page.locator("[data-tulala-inbox-scroll]");
  const row = inbox.getByRole("button", { name: /cora cuevas/i }).first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.click();

  await page.getByRole("tab", { name: /^lineup$/i }).click();
  await expect(page.locator("[data-live-lineup-loading]")).toHaveCount(0, {
    timeout: 20_000,
  });
  const manage = page.getByText(/^manage$/i);
  if (await manage.isVisible().catch(() => false)) {
    await manage.click();
  }
  const alreadyOnLineup = page.getByText(/qa journeys talent/i);
  if (!(await alreadyOnLineup.isVisible().catch(() => false))) {
    const addTalent = page.getByRole("button", { name: /^add talent$/i });
    await expect(addTalent).toBeVisible({ timeout: 20_000 });
    await addTalent.click();
    const rosterSearch = page.getByPlaceholder(/search roster/i);
    await expect(rosterSearch).toBeVisible({ timeout: 10_000 });
    await rosterSearch.fill("QA Journeys");
    await page.getByRole("button", { name: "QA Journeys Talent", exact: true }).click();
    await expect(page.getByText(/invited|added to lineup/i).first()).toBeVisible({
      timeout: 20_000,
    });
  }

  await page.getByRole("tab", { name: /^offer$/i }).click();
  const startOffer = page.getByRole("button", { name: /start drafting offer/i });
  if (await startOffer.isVisible().catch(() => false)) {
    await startOffer.click();
    await expect(page.getByText(/offer draft created/i)).toBeVisible({
      timeout: 20_000,
    });
  } else {
    await expect(page.getByText(/draft|line item|save draft/i).first()).toBeVisible({
      timeout: 20_000,
    });
  }

  const assigned = await latestAssignedDirectoryInquiry();
  expect(assigned, "staff assign must persist a talent lineup on qa-journeys").not.toBeNull();
  expect(assigned?.talentIds).toContain(QA_JOURNEYS_TALENT_ID);
  expect(assigned?.offerStatus, "draft offer must exist on qa-journeys").toMatch(
    /draft|pending|sent/,
  );

  await page.screenshot({
    path: testInfo.outputPath("c08-op-assign.png"),
    fullPage: true,
  });
});

test("C08-OP send: staff prices a line and sends the offer", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const marker = `c08-op-${Date.now()}@impronta.test`;
  const brief = "Need two models for a catalog shoot next month.";

  const chat = await openFreshDirectoryChat(page);
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
  await chat.getByPlaceholder(/^first name$/i).fill("Cora");
  await chat.getByPlaceholder(/^last name$/i).fill("Cuevas");
  await chat.getByPlaceholder(/email/i).fill(marker);
  await chat.getByRole("button", { name: /^send message$/i }).click();
  await expect(
    page.getByText(/inquiry received|got it, we've received your message|sent[,·] awaiting|inquiry sent/i).first(),
  ).toBeVisible({ timeout: 60_000 });

  const seed = await latestGuestDirectoryInquiry(marker);
  expect(seed, "C08-OP send guest inquiry must exist before staff send").not.toBeNull();

  await signInJourneysStaff(page, "/admin/messages");
  await expect(page).toHaveURL(/\/admin\/messages/, { timeout: 30_000 });
  const inbox = page.locator("[data-tulala-inbox-scroll]");
  await expect(inbox).toBeVisible({ timeout: 40_000 });
  // Messages after the fidelity pass keeps the h1 in the tree but hidden;
  // the inbox is the identity check for this screen.
  await assertNotAuthWall(page);
  await page.keyboard.press("Escape");

  const allChip = page.getByRole("button", { name: /^all$/i });
  if (await allChip.isVisible().catch(() => false)) {
    await allChip.click();
  }
  const row = inbox
    .getByRole("button", { name: /cora cuevas/i })
    .filter({ hasText: /shortlist empty/i })
    .first();
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.click();

  await page.getByRole("tab", { name: /^lineup$/i }).click();
  await expect(page.locator("[data-live-lineup-loading]")).toHaveCount(0, {
    timeout: 20_000,
  });
  const manage = page.getByText(/^manage$/i);
  if (await manage.isVisible().catch(() => false)) {
    await manage.click();
  }
  const alreadyOnLineup = page.getByText(/qa journeys talent/i);
  if (!(await alreadyOnLineup.isVisible().catch(() => false))) {
    const addTalent = page.getByRole("button", { name: /^add talent$/i });
    await expect(addTalent).toBeVisible({ timeout: 20_000 });
    await addTalent.click();
    const rosterSearch = page.getByPlaceholder(/search roster/i);
    await expect(rosterSearch).toBeVisible({ timeout: 10_000 });
    await rosterSearch.fill("QA Journeys");
    await page.getByRole("button", { name: "QA Journeys Talent", exact: true }).click();
    await expect(page.getByText(/invited|added to lineup/i).first()).toBeVisible({
      timeout: 20_000,
    });
  }

  await page.getByRole("tab", { name: /^offer$/i }).click();
  const startOffer = page.getByRole("button", { name: /start drafting offer/i });
  if (await startOffer.isVisible().catch(() => false)) {
    await startOffer.click();
    await expect(page.getByText(/offer draft created/i)).toBeVisible({
      timeout: 20_000,
    });
  }
  // Fidelity keeps the draft editor collapsed ("1 line item · total $0").
  const editDraft = page.getByRole("button", { name: /^edit$/i });
  if (await editDraft.first().isVisible().catch(() => false)) {
    await editDraft.first().click();
  }

  const addLine = page.getByRole("button", { name: /add line item/i });
  const talentSelect = page
    .locator("select")
    .filter({ has: page.locator("option", { hasText: /qa journeys talent/i }) });
  if ((await talentSelect.count()) === 0) {
    await expect(addLine).toBeVisible({ timeout: 20_000 });
    await addLine.click();
  }
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

  expect(
    await latestGuestDirectoryInquiry(marker),
    "C08-OP send guest inquiry must still exist on qa-journeys",
  ).not.toBeNull();
  const sent = await latestSentDirectoryInquiry();
  expect(sent, "a sent offer must exist on qa-journeys").not.toBeNull();
  expect(sent?.offerStatus, "offer must be sent on qa-journeys").toBe("sent");
  expect(sent?.sentAt, "sent_at must be stamped").not.toBeNull();
  expect(Number(sent?.totalClientPrice ?? 0)).toBeGreaterThan(0);
  expect(sent?.contactEmail ?? "").toMatch(/c08-op-/);
  expect(sent?.inquiryStatus).toMatch(/offer_pending|coordination/);
  const lines = await inquiryOfferLines(sent!.offerId);
  expect(lines.length, "sent offer must have a priced line").toBeGreaterThan(0);
  expect(lines.some((line) => line.talentProfileId === QA_JOURNEYS_TALENT_ID)).toBe(true);
  expect(lines.reduce((sum, line) => sum + line.totalPrice, 0)).toBeGreaterThan(0);
  const approvals = await inquiryOfferApprovalCount(sent!.offerId);
  expect(approvals, "send must seed at least the priced talent approval").toBeGreaterThan(0);

  await page.screenshot({
    path: testInfo.outputPath("c08-op-send.png"),
    fullPage: true,
  });
});

test("C08-TAL accept: talent approves the sent offer", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const awaiting = await latestSentOfferAwaitingTalent();
  expect(awaiting, "a sent offer must still wait on QA Journeys Talent").not.toBeNull();
  expect(awaiting?.offerStatus).toBe("sent");
  expect(awaiting?.inquiryStatus).toMatch(/offer_pending|coordination/);

  await signInJourneysStaff(page, `/talent/inbox/${awaiting!.inquiryId}`, JOURNEYS_TALENT_EMAIL);
  await expect(page).toHaveURL(/\/talent\/inbox/, { timeout: 40_000 });
  await expect(page.getByRole("heading", { name: /this page is no longer here/i })).toHaveCount(0);
  await expect(page.getByText(/host not registered/i)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /^(sign in|log in|iniciar sesión)$/i })).toHaveCount(0);
  await expect(page.getByPlaceholder(/search jobs/i)).toBeVisible({ timeout: 40_000 });

  const offerTab = page.getByRole("tab", { name: /^offer$/i });
  if (await offerTab.isVisible().catch(() => false)) {
    await offerTab.click();
  }
  const approve = page.getByRole("button", { name: /approve offer/i });
  const acceptInvite = page.getByRole("button", { name: /^(accept|show next action: accept)$/i });
  if (!(await approve.isVisible().catch(() => false))) {
    if (await acceptInvite.first().isVisible().catch(() => false)) {
      await acceptInvite.first().click();
    }
  }
  if (!(await approve.isVisible().catch(() => false))) {
    await page.goto("/talent/inbox");
    await expect(page.getByPlaceholder(/search jobs/i)).toBeVisible({ timeout: 40_000 });
    const allChip = page.getByRole("button", { name: /^all$/i });
    if (await allChip.isVisible().catch(() => false)) {
      await allChip.click();
    }
    const row = page
      .locator("[data-tulala-inbox-row]")
      .filter({ hasText: /cora cuevas/i })
      .filter({ hasText: /offer sla/i })
      .first();
    await expect(row).toBeVisible({ timeout: 40_000 });
    await row.click();
    if (await offerTab.isVisible().catch(() => false)) {
      await offerTab.click();
    }
  }
  await expect(approve).toBeVisible({ timeout: 40_000 });
  await approve.click();
  await expect(
    page.getByText(
      /offer approved|you've approved|approved the offer|waiting on client|you approved/i,
    ).first(),
  ).toBeVisible({ timeout: 30_000 });

  const approvals = await inquiryOfferApprovals(awaiting!.offerId);
  const talent = approvals.find(
    (row) => row.talentProfileId === QA_JOURNEYS_TALENT_ID,
  );
  const client = approvals.find((row) => row.role === "client");
  expect(talent?.status, "talent approval must be accepted").toBe("accepted");
  expect(client?.status, "client approval must still be pending").toBe("pending");

  const after = await latestSentDirectoryInquiry();
  expect(after?.inquiryId).toBe(awaiting!.inquiryId);
  expect(after?.offerStatus, "offer stays sent until the client also accepts").toBe("sent");
  expect(after?.inquiryStatus, "inquiry stays offer_pending until the client accepts").toMatch(
    /offer_pending|coordination/,
  );

  await page.screenshot({
    path: testInfo.outputPath("c08-tal-accept.png"),
    fullPage: true,
  });
});

test("C08-CUS accept: claimed client approves the sent offer", async ({ page }, testInfo) => {
  test.setTimeout(180_000);
  const ready = await latestOfferReadyForClientAccept();
  expect(ready, "a sent offer must wait on the claimed client after talent approve").not.toBeNull();
  expect(ready?.contactEmail, "claimed client email must exist").toMatch(/@impronta\.test$/);
  expect(ready?.offerStatus).toBe("sent");
  expect(ready?.inquiryStatus).toMatch(/offer_pending|coordination/);

  const messagesPath = `/${JOURNEYS_SLUG}/client/messages?inquiry=${ready!.inquiryId}&tab=offer`;
  await signInJourneysStaff(page, messagesPath, ready!.contactEmail!);
  if (/\/onboarding\/role/.test(page.url())) {
    const chooseClient = page.getByRole("button", { name: /i'm a client/i });
    await expect(chooseClient).toBeVisible();
    await chooseClient.click();
    await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
    await expect(page).not.toHaveURL(/\/onboarding\/role/, { timeout: 30_000 });
    await page.goto(messagesPath);
  }
  await expect(page).toHaveURL(
    new RegExp(`(?:/${JOURNEYS_SLUG})?/client/messages`),
    { timeout: 40_000 },
  );
  await expect(page.getByRole("heading", { name: /no client account here/i })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: /this page is no longer here/i })).toHaveCount(0);
  await expect(page.getByText(/host not registered/i)).toHaveCount(0);

  const offerTab = page.getByRole("tab", { name: /^offer$/i });
  if (await offerTab.isVisible().catch(() => false)) {
    await offerTab.click();
  }
  const approve = page.getByRole("button", { name: /approve & lock/i });
  await expect(approve.first()).toBeVisible({ timeout: 40_000 });
  await approve.first().click();
  await expect(approve.nth(1)).toBeVisible({ timeout: 15_000 });
  await approve.nth(1).click();
  await expect(
    page.getByText(
      /you approved this offer|you approved · awaiting others|offer approved|approved, booking soon|all approvals are complete/i,
    ).first(),
  ).toBeVisible({ timeout: 30_000 });

  const approvals = await inquiryOfferApprovals(ready!.offerId);
  const talent = approvals.find((row) => row.talentProfileId === QA_JOURNEYS_TALENT_ID);
  const client = approvals.find((row) => row.role === "client");
  expect(talent?.status, "talent approval must stay accepted").toBe("accepted");
  expect(client?.status, "client approval must be accepted").toBe("accepted");

  const offer = await latestInquiryOffer(ready!.inquiryId);
  expect(offer?.status, "all parties accepted so the offer must flip to accepted").toBe("accepted");
  const persisted = await latestGuestDirectoryInquiry(ready!.contactEmail!);
  expect(persisted?.status, "inquiry must be approved once every party accepts").toBe("approved");

  await page.screenshot({
    path: testInfo.outputPath("c08-cus-accept.png"),
    fullPage: true,
  });
});
