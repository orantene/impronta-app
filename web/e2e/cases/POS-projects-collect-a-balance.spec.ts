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
  JOURNEYS_SLUG,
  JOURNEYS_TALENT_EMAIL,
} from "./_harness";
import {
  isolatedService,
  JOURNEYS_TENANT_ID,
  QA_JOURNEYS_TALENT_ID,
  inquiryOfferApprovals,
  latestInquiryOffer,
  latestOfferReadyForClientAccept,
  latestSentOfferAwaitingTalent,
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

  // 1 — an existing project owing money?
  const { data: bookings } = await sb
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

  // 2 — talent approves the newest sent offer waiting on them.
  let ready = await latestOfferReadyForClientAccept();
  if (!ready) {
    const awaiting = await latestSentOfferAwaitingTalent();
    expect(awaiting, "the fixture needs a sent offer waiting on QA Journeys Talent").not.toBeNull();
    await signInJourneysStaff(page, `/talent/inbox/${awaiting!.inquiryId}`, JOURNEYS_TALENT_EMAIL);
    await expect(page).toHaveURL(/\/talent\/inbox/, { timeout: 40_000 });
    await expect(page.getByPlaceholder(/search jobs/i)).toBeVisible({ timeout: 40_000 });
    const approve = page.getByRole("button", { name: /approve offer/i });
    if (!(await approve.isVisible().catch(() => false))) {
      await page.goto("/talent/inbox");
      await expect(page.getByPlaceholder(/search jobs/i)).toBeVisible({ timeout: 40_000 });
      const allChip = page.getByRole("button", { name: /^all$/i });
      if (await allChip.isVisible().catch(() => false)) await allChip.click();
      const row = page
        .locator("[data-tulala-inbox-row]")
        .filter({ hasText: new RegExp(awaiting!.contactName ?? "cora cuevas", "i") })
        .first();
      await expect(row).toBeVisible({ timeout: 40_000 });
      await row.click();
    }
    await expect(approve).toBeVisible({ timeout: 40_000 });
    await approve.click();
    await expect(
      page.getByText(/offer approved|waiting on client|awaiting client/i).first(),
    ).toBeVisible({ timeout: 30_000 });
    annotate("seed", `talent approved offer ${awaiting!.offerId} on inquiry ${awaiting!.inquiryId}`);
    ready = await latestOfferReadyForClientAccept();
  }
  expect(ready, "after talent approval a sent offer must wait on the client").not.toBeNull();

  // 3 — the client approves it from their messages.
  const messagesPath = `/${JOURNEYS_SLUG}/client/messages?inquiry=${ready!.inquiryId}&tab=offer`;
  await signInJourneysStaff(page, messagesPath, ready!.contactEmail!);
  if (/\/onboarding\/role/.test(page.url())) {
    const chooseClient = page.getByRole("button", { name: /i'm a client/i });
    await expect(chooseClient).toBeVisible();
    await chooseClient.click();
    await expect(page).not.toHaveURL(/\/onboarding\/role/, { timeout: 30_000 });
    await page.goto(messagesPath);
  }
  await expect(page).toHaveURL(new RegExp(`(?:/${JOURNEYS_SLUG})?/client/messages`), { timeout: 40_000 });
  const offerTab = page.getByRole("tab", { name: /^offer$/i });
  if (await offerTab.isVisible().catch(() => false)) await offerTab.click();
  const approveLock = page.getByRole("button", { name: /approve & lock/i });
  await expect(approveLock.first()).toBeVisible({ timeout: 40_000 });
  await approveLock.first().click();
  await expect(approveLock.nth(1)).toBeVisible({ timeout: 15_000 });
  await approveLock.nth(1).click();
  await expect(
    page
      .getByText(/you approved this offer|you approved · awaiting others|offer approved|approved, booking soon|all approvals are complete/i)
      .first(),
  ).toBeVisible({ timeout: 30_000 });
  const approvals = await inquiryOfferApprovals(ready!.offerId);
  expect(approvals.find((r) => r.talentProfileId === QA_JOURNEYS_TALENT_ID)?.status).toBe("accepted");
  expect(approvals.find((r) => r.role === "client")?.status).toBe("accepted");
  const offer = await latestInquiryOffer(ready!.inquiryId);
  expect(offer?.status, "every party accepted, so the offer is accepted").toBe("accepted");
  annotate("seed", `client ${ready!.contactEmail} approved offer ${ready!.offerId}`);

  // 4 — staff press Create booking on the conversation.
  await signInJourneysStaff(page, `/admin/work/${ready!.inquiryId}`);
  const before = await ordersOnInquiry(ready!.inquiryId);
  const createBooking = page.getByRole("button", { name: /create booking/i });
  await expect(createBooking, "an approved inquiry offers Create booking").toBeVisible({ timeout: 30_000 });
  await createBooking.click();
  await expect
    .poll(async () => (await ordersOnInquiry(ready!.inquiryId)).length, {
      message: "Create booking must mint the order from the accepted offer",
      timeout: 60_000,
    })
    .toBeGreaterThan(before.length);
  const booking = await bookingOnInquiry(ready!.inquiryId);
  expect(booking, "Create booking must open a project on this conversation").toBeTruthy();
  annotate("seed", `Create booking minted the order; project ${booking!.id}`);
  return { inquiryId: ready!.inquiryId, projectId: booking!.id, clientName: ready!.contactName ?? "" };
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
  // 1 — THE MODE, from the point of sale's own rail.
  // ────────────────────────────────────────────────────────────────────
  await signInJourneysStaff(page, "/admin/pos?mode=projects");
  await assertWorkspaceIdentity(page);
  const rail = page.getByRole("navigation", { name: /^(projects|proyectos|projets)$/i });
  await expect(rail, "the Projects mode renders its own rail").toBeVisible({ timeout: 30_000 });
  await expect(rail.getByRole("button", { name: /^collect$/i })).toHaveAttribute("aria-current", "page");
  await expect(rail.getByRole("button", { name: /^projects$/i })).toBeVisible();
  await expect(rail.getByRole("button", { name: /^receipts$/i })).toBeVisible();
  await shot("01-projects-mode-landing");

  // ────────────────────────────────────────────────────────────────────
  // 2 — FIND the project by the client's name; the row's Owed is the rule.
  // ────────────────────────────────────────────────────────────────────
  const attachedBefore = await ordersOnInquiry(inquiryId);
  const dueBefore = attachedBefore.reduce((s, o) => s + owedCents(o), 0);
  const currency = attachedBefore[0]!.currency;
  expect(dueBefore, "the seeded project must owe money").toBeGreaterThan(0);

  const needle = seed.clientName.split(" ")[0] ?? seed.clientName;
  await page.getByLabel(/client or project/i).fill(needle);
  const row = page.locator(`[data-pos-project-row="${projectId}"]`);
  await expect(row, "typing the client's name finds the project").toBeVisible({ timeout: 30_000 });
  await expect(row.locator("[data-pos-project-owed]"), "the row's Owed is the desk's rule").toHaveText(
    money(dueBefore, currency),
  );
  await shot("02-find-by-client-name");
  await row.getByRole("button", { name: /^open$/i }).click();

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
    page.locator("[data-pos-projects-collect]").getByText("Amount due").locator("xpath=following-sibling::span[1]"),
    "the sheet's amount is the deposit, not the balance",
  ).toHaveText(money(depositCents, currency));
  await shot("04-collect-a-deposit");
  await page.getByRole("button", { name: /confirm cash/i }).click();
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
  const collectedOrder = attachedAfter.find((o) => o.collectedCents > 0);
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
  await expect(page.locator("[data-pos-projects-collected-total]")).toHaveText(money(depositCents, currency));
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
  expect(wrong, "the wrong rule would count it").toBe(dueAfter + 20000);

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
  await expect(figureValue(page, "Collected")).toHaveText(money(depositCents, currency));
  await shot("08-receipt-by-code");
  // A code nobody minted is refused in a sentence.
  await page.getByLabel(/receipt code/i).fill("zzzzzzzzzzzzzzzzzzzz");
  await page.getByRole("button", { name: /find the receipt/i }).click();
  await expect(page.locator('[data-pos-projects-receipt-refusal="not_found"]')).toBeVisible({ timeout: 30_000 });
  await shot("08b-receipt-unknown-code");
  // And the public page itself opens.
  const receiptPage = await page.context().newPage();
  await receiptPage.goto(`/r/${receiptCode}`);
  await expect(receiptPage.locator("body")).toContainText(money(depositCents, currency), { timeout: 30_000 });
  await receiptPage.screenshot({ path: testInfo.outputPath("09-public-receipt.png"), fullPage: true });
  await receiptPage.close();

  // ────────────────────────────────────────────────────────────────────
  // 8 — THE PROJECTS BOARD: every project with its one next action, and a
  //     project's milestones and deliverables.
  // ────────────────────────────────────────────────────────────────────
  await rail.getByRole("button", { name: /^projects$/i }).click();
  await expect(page.locator("[data-pos-projects-list]")).toBeVisible({ timeout: 30_000 });
  await shot("10-projects-board");
  await page.locator(`[data-pos-project-row="${projectId}"]`).getByRole("button", { name: /^open$/i }).click();
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
