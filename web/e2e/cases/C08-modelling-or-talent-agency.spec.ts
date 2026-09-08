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
} from "./_harness";
import {
  latestGuestDirectoryInquiry,
  latestAssignedDirectoryInquiry,
  latestInquiryOffer,
  inquiryOfferLines,
  inquiryOfferApprovalCount,
  QA_JOURNEYS_TALENT_ID,
} from "./_isolated-db";

skipUnlessFixture();

test.beforeEach(async ({ page }) => {
  await prepareJourneysPage(page);
});

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

  await page.goto("/directory?inquiry=open");
  await assertNotAuthWall(page);

  const chat = page.getByRole("dialog", { name: /message the agency/i });
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
  await chat.getByPlaceholder(/^first name$/i).fill("Cora");
  await chat.getByPlaceholder(/^last name$/i).fill("Cuevas");
  await chat.getByPlaceholder(/email/i).fill(marker);
  await chat.getByRole("button", { name: /^send message$/i }).click();

  await expect(
    chat.getByText(/inquiry received|got it, we've received your message|sent, awaiting reply/i).first(),
  ).toBeVisible({ timeout: 40_000 });

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

  await page.goto("/directory?inquiry=open");
  await assertNotAuthWall(page);
  const chat = page.getByRole("dialog", { name: /message the agency/i });
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
  await chat.getByPlaceholder(/^first name$/i).fill("Cora");
  await chat.getByPlaceholder(/^last name$/i).fill("Cuevas");
  await chat.getByPlaceholder(/email/i).fill(marker);
  await chat.getByRole("button", { name: /^send message$/i }).click();
  await expect(
    chat.getByText(/inquiry received|got it, we've received your message|sent, awaiting reply/i).first(),
  ).toBeVisible({ timeout: 40_000 });

  const seed = await latestGuestDirectoryInquiry(marker);
  expect(seed, "C08-OP guest inquiry must exist before staff assign").not.toBeNull();

  await signInJourneysStaff(page, "/admin/messages");
  await assertWorkspaceIdentity(page);
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
    await page.getByRole("button", { name: /qa journeys talent/i }).click();
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

  await page.goto("/directory?inquiry=open");
  await assertNotAuthWall(page);
  const chat = page.getByRole("dialog", { name: /message the agency/i });
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
  await chat.getByPlaceholder(/^first name$/i).fill("Cora");
  await chat.getByPlaceholder(/^last name$/i).fill("Cuevas");
  await chat.getByPlaceholder(/email/i).fill(marker);
  await chat.getByRole("button", { name: /^send message$/i }).click();
  await expect(
    chat.getByText(/inquiry received|got it, we've received your message|sent, awaiting reply/i).first(),
  ).toBeVisible({ timeout: 40_000 });

  const seed = await latestGuestDirectoryInquiry(marker);
  expect(seed, "C08-OP send guest inquiry must exist before staff send").not.toBeNull();

  await signInJourneysStaff(page, "/admin/messages");
  await expect(page).toHaveURL(/\/admin\/messages/, { timeout: 30_000 });
  const inbox = page.locator("[data-tulala-inbox-scroll]");
  await expect(inbox).toBeVisible({ timeout: 40_000 });
  await assertWorkspaceIdentity(page);
  await page.keyboard.press("Escape");

  const allChip = page.getByRole("button", { name: /^all$/i });
  if (await allChip.isVisible().catch(() => false)) {
    await allChip.click();
  }
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
    await page.getByRole("button", { name: /qa journeys talent/i }).click();
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

  const editDraft = page.getByRole("button", { name: /^edit$/i });
  if (await editDraft.isVisible().catch(() => false)) {
    await editDraft.click();
  }
  await expect(page.getByRole("button", { name: /\+ add line item/i })).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole("button", { name: /\+ add line item/i }).click();

  const talentSelect = page
    .locator("select")
    .filter({ has: page.locator("option", { hasText: /qa journeys talent/i }) })
    .first();
  await expect(talentSelect).toBeVisible({ timeout: 10_000 });
  await talentSelect.selectOption({ label: "QA Journeys Talent" });
  await page.getByPlaceholder(/^rate$/i).fill("800");
  await page.getByRole("button", { name: /^save draft$/i }).click();
  await expect(page.getByText(/saved ·/i).first()).toBeVisible({ timeout: 20_000 });

  const sendOffer = page.getByRole("button", { name: /^send to client$/i });
  await expect(sendOffer).toBeEnabled({ timeout: 20_000 });
  await sendOffer.click();
  await expect(
    page.getByText(/send offer done|awaiting client and talent approval/i).first(),
  ).toBeVisible({ timeout: 30_000 });

  const persisted = await latestGuestDirectoryInquiry(marker);
  expect(persisted, "sent-offer inquiry must still exist on qa-journeys").not.toBeNull();
  const offer = await latestInquiryOffer(persisted!.inquiryId);
  expect(offer, "priced offer must exist on qa-journeys").not.toBeNull();
  expect(offer?.status, "offer must be sent on qa-journeys").toBe("sent");
  expect(offer?.sentAt, "sent_at must be stamped").not.toBeNull();
  expect(Number(offer?.totalClientPrice ?? 0)).toBeGreaterThan(0);
  const lines = await inquiryOfferLines(offer!.offerId);
  expect(lines.length, "sent offer must have a priced line").toBeGreaterThan(0);
  expect(lines.some((line) => line.talentProfileId === QA_JOURNEYS_TALENT_ID)).toBe(true);
  expect(lines.reduce((sum, line) => sum + line.totalPrice, 0)).toBeGreaterThan(0);
  expect(persisted?.status).toMatch(/offer_pending|coordination/);
  const approvals = await inquiryOfferApprovalCount(offer!.offerId);
  expect(approvals, "send must seed at least the priced talent approval").toBeGreaterThan(0);

  await page.screenshot({
    path: testInfo.outputPath("c08-op-send.png"),
    fullPage: true,
  });
});
