# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: cases/C08-modelling-or-talent-agency.spec.ts >> C08-CUS accept: claimed client approves the sent offer
- Location: e2e/cases/C08-modelling-or-talent-agency.spec.ts:390:5

# Error details

```
Error: expect(locator).toHaveCount(expected) failed

Locator:  getByRole('heading', { name: /no client account here/i })
Expected: 0
Received: 1
Timeout:  5000ms

Call log:
  - Expect "toHaveCount" with timeout 5000ms
  - waiting for getByRole('heading', { name: /no client account here/i })
    9 × locator resolved to 1 element
      - unexpected value "1"

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - generic [ref=e3]:
    - img [ref=e5]
    - heading "No client account here" [level=1] [ref=e8]
    - paragraph [ref=e9]:
      - text: You don't have a client account on
      - strong [ref=e10]: Qa Journeys
      - text: . You can ask the workspace admin to add you, or open the admin dashboard if you run this workspace.
    - generic [ref=e11]:
      - link "Open admin dashboard" [ref=e12] [cursor=pointer]:
        - /url: /qa-journeys/admin
      - link "Sign in as a client" [ref=e13] [cursor=pointer]:
        - /url: /login?next=/qa-journeys/client
  - alert [ref=e14]
```

# Test source

```ts
  312 |     "C08-OP send guest inquiry must still exist on qa-journeys",
  313 |   ).not.toBeNull();
  314 |   const sent = await latestSentDirectoryInquiry();
  315 |   expect(sent, "a sent offer must exist on qa-journeys").not.toBeNull();
  316 |   expect(sent?.offerStatus, "offer must be sent on qa-journeys").toBe("sent");
  317 |   expect(sent?.sentAt, "sent_at must be stamped").not.toBeNull();
  318 |   expect(Number(sent?.totalClientPrice ?? 0)).toBeGreaterThan(0);
  319 |   expect(sent?.contactEmail ?? "").toMatch(/c08-op-/);
  320 |   expect(sent?.inquiryStatus).toMatch(/offer_pending|coordination/);
  321 |   const lines = await inquiryOfferLines(sent!.offerId);
  322 |   expect(lines.length, "sent offer must have a priced line").toBeGreaterThan(0);
  323 |   expect(lines.some((line) => line.talentProfileId === QA_JOURNEYS_TALENT_ID)).toBe(true);
  324 |   expect(lines.reduce((sum, line) => sum + line.totalPrice, 0)).toBeGreaterThan(0);
  325 |   const approvals = await inquiryOfferApprovalCount(sent!.offerId);
  326 |   expect(approvals, "send must seed at least the priced talent approval").toBeGreaterThan(0);
  327 | 
  328 |   await page.screenshot({
  329 |     path: testInfo.outputPath("c08-op-send.png"),
  330 |     fullPage: true,
  331 |   });
  332 | });
  333 | 
  334 | test("C08-TAL accept: talent approves the sent offer", async ({ page }, testInfo) => {
  335 |   test.setTimeout(180_000);
  336 |   const awaiting = await latestSentOfferAwaitingTalent();
  337 |   expect(awaiting, "a sent offer must still wait on QA Journeys Talent").not.toBeNull();
  338 |   expect(awaiting?.offerStatus).toBe("sent");
  339 |   expect(awaiting?.inquiryStatus).toMatch(/offer_pending|coordination/);
  340 | 
  341 |   await signInJourneysStaff(page, `/talent/inbox/${awaiting!.inquiryId}`, JOURNEYS_TALENT_EMAIL);
  342 |   await expect(page).toHaveURL(/\/talent\/inbox/, { timeout: 40_000 });
  343 |   await expect(page.getByRole("heading", { name: /this page is no longer here/i })).toHaveCount(0);
  344 |   await expect(page.getByText(/host not registered/i)).toHaveCount(0);
  345 |   await expect(page.getByRole("heading", { name: /^(sign in|log in|iniciar sesión)$/i })).toHaveCount(0);
  346 |   await expect(page.getByPlaceholder(/search jobs/i)).toBeVisible({ timeout: 40_000 });
  347 | 
  348 |   const approve = page.getByRole("button", { name: /approve offer/i });
  349 |   if (!(await approve.isVisible().catch(() => false))) {
  350 |     await page.goto("/talent/inbox");
  351 |     await expect(page.getByPlaceholder(/search jobs/i)).toBeVisible({ timeout: 40_000 });
  352 |     const allChip = page.getByRole("button", { name: /^all$/i });
  353 |     if (await allChip.isVisible().catch(() => false)) {
  354 |       await allChip.click();
  355 |     }
  356 |     const row = page
  357 |       .locator("[data-tulala-inbox-row]")
  358 |       .filter({ hasText: /cora cuevas/i })
  359 |       .first();
  360 |     await expect(row).toBeVisible({ timeout: 40_000 });
  361 |     await row.click();
  362 |   }
  363 |   await expect(approve).toBeVisible({ timeout: 40_000 });
  364 |   await approve.click();
  365 |   await expect(
  366 |     page.getByText(/offer approved|waiting on client|awaiting client/i).first(),
  367 |   ).toBeVisible({ timeout: 30_000 });
  368 | 
  369 |   const approvals = await inquiryOfferApprovals(awaiting!.offerId);
  370 |   const talent = approvals.find(
  371 |     (row) => row.talentProfileId === QA_JOURNEYS_TALENT_ID,
  372 |   );
  373 |   const client = approvals.find((row) => row.role === "client");
  374 |   expect(talent?.status, "talent approval must be accepted").toBe("accepted");
  375 |   expect(client?.status, "client approval must still be pending").toBe("pending");
  376 | 
  377 |   const after = await latestSentDirectoryInquiry();
  378 |   expect(after?.inquiryId).toBe(awaiting!.inquiryId);
  379 |   expect(after?.offerStatus, "offer stays sent until the client also accepts").toBe("sent");
  380 |   expect(after?.inquiryStatus, "inquiry stays offer_pending until the client accepts").toMatch(
  381 |     /offer_pending|coordination/,
  382 |   );
  383 | 
  384 |   await page.screenshot({
  385 |     path: testInfo.outputPath("c08-tal-accept.png"),
  386 |     fullPage: true,
  387 |   });
  388 | });
  389 | 
  390 | test("C08-CUS accept: claimed client approves the sent offer", async ({ page }, testInfo) => {
  391 |   test.setTimeout(180_000);
  392 |   const ready = await latestOfferReadyForClientAccept();
  393 |   expect(ready, "a sent offer must wait on the claimed client after talent approve").not.toBeNull();
  394 |   expect(ready?.contactEmail, "claimed client email must exist").toMatch(/@impronta\.test$/);
  395 |   expect(ready?.offerStatus).toBe("sent");
  396 |   expect(ready?.inquiryStatus).toMatch(/offer_pending|coordination/);
  397 | 
  398 |   const messagesPath = `/${JOURNEYS_SLUG}/client/messages?inquiry=${ready!.inquiryId}&tab=offer`;
  399 |   await signInJourneysStaff(page, messagesPath, ready!.contactEmail!);
  400 |   if (/\/onboarding\/role/.test(page.url())) {
  401 |     const chooseClient = page.getByRole("button", { name: /i'm a client/i });
  402 |     await expect(chooseClient).toBeVisible();
  403 |     await chooseClient.click();
  404 |     await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
  405 |     await expect(page).not.toHaveURL(/\/onboarding\/role/, { timeout: 30_000 });
  406 |     await page.goto(messagesPath);
  407 |   }
  408 |   await expect(page).toHaveURL(
  409 |     new RegExp(`(?:/${JOURNEYS_SLUG})?/client/messages`),
  410 |     { timeout: 40_000 },
  411 |   );
> 412 |   await expect(page.getByRole("heading", { name: /no client account here/i })).toHaveCount(0);
      |                                                                                ^ Error: expect(locator).toHaveCount(expected) failed
  413 |   await expect(page.getByRole("heading", { name: /this page is no longer here/i })).toHaveCount(0);
  414 |   await expect(page.getByText(/host not registered/i)).toHaveCount(0);
  415 | 
  416 |   const offerTab = page.getByRole("tab", { name: /^offer$/i });
  417 |   if (await offerTab.isVisible().catch(() => false)) {
  418 |     await offerTab.click();
  419 |   }
  420 |   const approve = page.getByRole("button", { name: /approve & lock/i });
  421 |   await expect(approve.first()).toBeVisible({ timeout: 40_000 });
  422 |   await approve.first().click();
  423 |   await expect(approve.nth(1)).toBeVisible({ timeout: 15_000 });
  424 |   await approve.nth(1).click();
  425 |   await expect(
  426 |     page.getByText(
  427 |       /you approved this offer|you approved · awaiting others|offer approved|approved, booking soon|all approvals are complete/i,
  428 |     ).first(),
  429 |   ).toBeVisible({ timeout: 30_000 });
  430 | 
  431 |   const approvals = await inquiryOfferApprovals(ready!.offerId);
  432 |   const talent = approvals.find((row) => row.talentProfileId === QA_JOURNEYS_TALENT_ID);
  433 |   const client = approvals.find((row) => row.role === "client");
  434 |   expect(talent?.status, "talent approval must stay accepted").toBe("accepted");
  435 |   expect(client?.status, "client approval must be accepted").toBe("accepted");
  436 | 
  437 |   const offer = await latestInquiryOffer(ready!.inquiryId);
  438 |   expect(offer?.status, "all parties accepted so the offer must flip to accepted").toBe("accepted");
  439 |   const persisted = await latestGuestDirectoryInquiry(ready!.contactEmail!);
  440 |   expect(persisted?.status, "inquiry must be approved once every party accepts").toBe("approved");
  441 | 
  442 |   await page.screenshot({
  443 |     path: testInfo.outputPath("c08-cus-accept.png"),
  444 |     fullPage: true,
  445 |   });
  446 | });
  447 | 
```