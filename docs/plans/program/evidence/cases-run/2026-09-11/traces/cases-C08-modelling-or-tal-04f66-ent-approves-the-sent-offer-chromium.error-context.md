# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: cases/C08-modelling-or-talent-agency.spec.ts >> C08-CUS accept: claimed client approves the sent offer
- Location: e2e/cases/C08-modelling-or-talent-agency.spec.ts:402:5

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
  324 |   ).not.toBeNull();
  325 |   const sent = await latestSentDirectoryInquiry();
  326 |   expect(sent, "a sent offer must exist on qa-journeys").not.toBeNull();
  327 |   expect(sent?.offerStatus, "offer must be sent on qa-journeys").toBe("sent");
  328 |   expect(sent?.sentAt, "sent_at must be stamped").not.toBeNull();
  329 |   expect(Number(sent?.totalClientPrice ?? 0)).toBeGreaterThan(0);
  330 |   expect(sent?.contactEmail ?? "").toMatch(/c08-op-/);
  331 |   expect(sent?.inquiryStatus).toMatch(/offer_pending|coordination/);
  332 |   const lines = await inquiryOfferLines(sent!.offerId);
  333 |   expect(lines.length, "sent offer must have a priced line").toBeGreaterThan(0);
  334 |   expect(lines.some((line) => line.talentProfileId === QA_JOURNEYS_TALENT_ID)).toBe(true);
  335 |   expect(lines.reduce((sum, line) => sum + line.totalPrice, 0)).toBeGreaterThan(0);
  336 |   const approvals = await inquiryOfferApprovalCount(sent!.offerId);
  337 |   expect(approvals, "send must seed at least the priced talent approval").toBeGreaterThan(0);
  338 | 
  339 |   await page.screenshot({
  340 |     path: testInfo.outputPath("c08-op-send.png"),
  341 |     fullPage: true,
  342 |   });
  343 | });
  344 | 
  345 | test("C08-TAL accept: talent approves the sent offer", async ({ page }, testInfo) => {
  346 |   test.setTimeout(180_000);
  347 |   const awaiting = await latestSentOfferAwaitingTalent();
  348 |   expect(awaiting, "a sent offer must still wait on QA Journeys Talent").not.toBeNull();
  349 |   expect(awaiting?.offerStatus).toBe("sent");
  350 |   expect(awaiting?.inquiryStatus).toMatch(/offer_pending|coordination/);
  351 |   expect(awaiting?.contactEmail ?? "", "talent must open the just-sent C08 offer").toMatch(
  352 |     /c08-op-/,
  353 |   );
  354 | 
  355 |   await signInJourneysStaff(page, `/talent/inbox/${awaiting!.inquiryId}`, JOURNEYS_TALENT_EMAIL);
  356 |   await expect(page).toHaveURL(/\/talent\/inbox/, { timeout: 40_000 });
  357 |   await expect(page.getByRole("heading", { name: /this page is no longer here/i })).toHaveCount(0);
  358 |   await expect(page.getByText(/host not registered/i)).toHaveCount(0);
  359 |   await expect(page.getByRole("heading", { name: /^(sign in|log in|iniciar sesión)$/i })).toHaveCount(0);
  360 |   await expect(page.getByPlaceholder(/search jobs/i)).toBeVisible({ timeout: 40_000 });
  361 | 
  362 |   // Fresh send still shows Inquiry SLA until talent accepts the invite.
  363 |   const acceptInvite = page.getByRole("button", { name: /accept$/i });
  364 |   const approve = page.getByRole("button", { name: /approve offer/i });
  365 |   if (!(await approve.isVisible().catch(() => false))) {
  366 |     await expect(acceptInvite.first()).toBeVisible({ timeout: 20_000 });
  367 |     await acceptInvite.first().click();
  368 |   }
  369 |   const offerTab = page.getByRole("tab", { name: /^offer$/i });
  370 |   if (await offerTab.isVisible().catch(() => false)) {
  371 |     await offerTab.click();
  372 |   }
  373 |   await expect(approve).toBeVisible({ timeout: 40_000 });
  374 |   await approve.click();
  375 |   await expect(
  376 |     page.getByText(
  377 |       /offer approved|you've approved|approved the offer|waiting on client|you approved/i,
  378 |     ).first(),
  379 |   ).toBeVisible({ timeout: 30_000 });
  380 | 
  381 |   const approvals = await inquiryOfferApprovals(awaiting!.offerId);
  382 |   const talent = approvals.find(
  383 |     (row) => row.talentProfileId === QA_JOURNEYS_TALENT_ID,
  384 |   );
  385 |   const client = approvals.find((row) => row.role === "client");
  386 |   expect(talent?.status, "talent approval must be accepted").toBe("accepted");
  387 |   expect(client?.status, "client approval must still be pending").toBe("pending");
  388 | 
  389 |   const after = await latestSentDirectoryInquiry();
  390 |   expect(after?.inquiryId).toBe(awaiting!.inquiryId);
  391 |   expect(after?.offerStatus, "offer stays sent until the client also accepts").toBe("sent");
  392 |   expect(after?.inquiryStatus, "inquiry stays offer_pending until the client accepts").toMatch(
  393 |     /offer_pending|coordination/,
  394 |   );
  395 | 
  396 |   await page.screenshot({
  397 |     path: testInfo.outputPath("c08-tal-accept.png"),
  398 |     fullPage: true,
  399 |   });
  400 | });
  401 | 
  402 | test("C08-CUS accept: claimed client approves the sent offer", async ({ page }, testInfo) => {
  403 |   test.setTimeout(180_000);
  404 |   const ready = await latestOfferReadyForClientAccept();
  405 |   expect(ready, "a sent offer must wait on the claimed client after talent approve").not.toBeNull();
  406 |   expect(ready?.contactEmail, "claimed client email must exist").toMatch(/@impronta\.test$/);
  407 |   expect(ready?.offerStatus).toBe("sent");
  408 |   expect(ready?.inquiryStatus).toMatch(/offer_pending|coordination/);
  409 | 
  410 |   const messagesPath = `/${JOURNEYS_SLUG}/client/messages?inquiry=${ready!.inquiryId}&tab=offer`;
  411 |   await signInJourneysStaff(page, messagesPath, ready!.contactEmail!);
  412 |   if (/\/onboarding\/role/.test(page.url())) {
  413 |     const chooseClient = page.getByRole("button", { name: /i'm a client/i });
  414 |     await expect(chooseClient).toBeVisible();
  415 |     await chooseClient.click();
  416 |     await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
  417 |     await expect(page).not.toHaveURL(/\/onboarding\/role/, { timeout: 30_000 });
  418 |     await page.goto(messagesPath);
  419 |   }
  420 |   await expect(page).toHaveURL(
  421 |     new RegExp(`(?:/${JOURNEYS_SLUG})?/client/messages`),
  422 |     { timeout: 40_000 },
  423 |   );
> 424 |   await expect(page.getByRole("heading", { name: /no client account here/i })).toHaveCount(0);
      |                                                                                ^ Error: expect(locator).toHaveCount(expected) failed
  425 |   await expect(page.getByRole("heading", { name: /this page is no longer here/i })).toHaveCount(0);
  426 |   await expect(page.getByText(/host not registered/i)).toHaveCount(0);
  427 | 
  428 |   const offerTab = page.getByRole("tab", { name: /^offer$/i });
  429 |   if (await offerTab.isVisible().catch(() => false)) {
  430 |     await offerTab.click();
  431 |   }
  432 |   const approve = page.getByRole("button", { name: /approve & lock/i });
  433 |   await expect(approve.first()).toBeVisible({ timeout: 40_000 });
  434 |   await approve.first().click();
  435 |   await expect(approve.nth(1)).toBeVisible({ timeout: 15_000 });
  436 |   await approve.nth(1).click();
  437 |   await expect(
  438 |     page.getByText(
  439 |       /you approved this offer|you approved · awaiting others|offer approved|approved, booking soon|all approvals are complete/i,
  440 |     ).first(),
  441 |   ).toBeVisible({ timeout: 30_000 });
  442 | 
  443 |   const approvals = await inquiryOfferApprovals(ready!.offerId);
  444 |   const talent = approvals.find((row) => row.talentProfileId === QA_JOURNEYS_TALENT_ID);
  445 |   const client = approvals.find((row) => row.role === "client");
  446 |   expect(talent?.status, "talent approval must stay accepted").toBe("accepted");
  447 |   expect(client?.status, "client approval must be accepted").toBe("accepted");
  448 | 
  449 |   const offer = await latestInquiryOffer(ready!.inquiryId);
  450 |   expect(offer?.status, "all parties accepted so the offer must flip to accepted").toBe("accepted");
  451 |   const persisted = await latestGuestDirectoryInquiry(ready!.contactEmail!);
  452 |   expect(persisted?.status, "inquiry must be approved once every party accepts").toBe("approved");
  453 | 
  454 |   await page.screenshot({
  455 |     path: testInfo.outputPath("c08-cus-accept.png"),
  456 |     fullPage: true,
  457 |   });
  458 | });
  459 | 
```