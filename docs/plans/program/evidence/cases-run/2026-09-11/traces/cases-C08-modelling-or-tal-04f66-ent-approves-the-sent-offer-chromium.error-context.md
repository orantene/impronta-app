# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: cases/C08-modelling-or-talent-agency.spec.ts >> C08-CUS accept: claimed client approves the sent offer
- Location: e2e/cases/C08-modelling-or-talent-agency.spec.ts:413:5

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
  335 |   await page.screenshot({
  336 |     path: testInfo.outputPath("c08-op-send.png"),
  337 |     fullPage: true,
  338 |   });
  339 | });
  340 | 
  341 | test("C08-TAL accept: talent approves the sent offer", async ({ page }, testInfo) => {
  342 |   test.setTimeout(180_000);
  343 |   const awaiting = await latestSentOfferAwaitingTalent();
  344 |   expect(awaiting, "a sent offer must still wait on QA Journeys Talent").not.toBeNull();
  345 |   expect(awaiting?.offerStatus).toBe("sent");
  346 |   expect(awaiting?.inquiryStatus).toMatch(/offer_pending|coordination/);
  347 | 
  348 |   await signInJourneysStaff(page, `/talent/inbox/${awaiting!.inquiryId}`, JOURNEYS_TALENT_EMAIL);
  349 |   await expect(page).toHaveURL(/\/talent\/inbox/, { timeout: 40_000 });
  350 |   await expect(page.getByRole("heading", { name: /this page is no longer here/i })).toHaveCount(0);
  351 |   await expect(page.getByText(/host not registered/i)).toHaveCount(0);
  352 |   await expect(page.getByRole("heading", { name: /^(sign in|log in|iniciar sesión)$/i })).toHaveCount(0);
  353 |   await expect(page.getByPlaceholder(/search jobs/i)).toBeVisible({ timeout: 40_000 });
  354 | 
  355 |   const offerTab = page.getByRole("tab", { name: /^offer$/i });
  356 |   if (await offerTab.isVisible().catch(() => false)) {
  357 |     await offerTab.click();
  358 |   }
  359 |   const approve = page.getByRole("button", { name: /approve offer/i });
  360 |   const acceptInvite = page.getByRole("button", { name: /^(accept|show next action: accept)$/i });
  361 |   if (!(await approve.isVisible().catch(() => false))) {
  362 |     if (await acceptInvite.first().isVisible().catch(() => false)) {
  363 |       await acceptInvite.first().click();
  364 |     }
  365 |   }
  366 |   if (!(await approve.isVisible().catch(() => false))) {
  367 |     await page.goto("/talent/inbox");
  368 |     await expect(page.getByPlaceholder(/search jobs/i)).toBeVisible({ timeout: 40_000 });
  369 |     const allChip = page.getByRole("button", { name: /^all$/i });
  370 |     if (await allChip.isVisible().catch(() => false)) {
  371 |       await allChip.click();
  372 |     }
  373 |     const row = page
  374 |       .locator("[data-tulala-inbox-row]")
  375 |       .filter({ hasText: /cora cuevas/i })
  376 |       .filter({ hasText: /offer sla/i })
  377 |       .first();
  378 |     await expect(row).toBeVisible({ timeout: 40_000 });
  379 |     await row.click();
  380 |     if (await offerTab.isVisible().catch(() => false)) {
  381 |       await offerTab.click();
  382 |     }
  383 |   }
  384 |   await expect(approve).toBeVisible({ timeout: 40_000 });
  385 |   await approve.click();
  386 |   await expect(
  387 |     page.getByText(
  388 |       /offer approved|you've approved|approved the offer|waiting on client|you approved/i,
  389 |     ).first(),
  390 |   ).toBeVisible({ timeout: 30_000 });
  391 | 
  392 |   const approvals = await inquiryOfferApprovals(awaiting!.offerId);
  393 |   const talent = approvals.find(
  394 |     (row) => row.talentProfileId === QA_JOURNEYS_TALENT_ID,
  395 |   );
  396 |   const client = approvals.find((row) => row.role === "client");
  397 |   expect(talent?.status, "talent approval must be accepted").toBe("accepted");
  398 |   expect(client?.status, "client approval must still be pending").toBe("pending");
  399 | 
  400 |   const after = await latestSentDirectoryInquiry();
  401 |   expect(after?.inquiryId).toBe(awaiting!.inquiryId);
  402 |   expect(after?.offerStatus, "offer stays sent until the client also accepts").toBe("sent");
  403 |   expect(after?.inquiryStatus, "inquiry stays offer_pending until the client accepts").toMatch(
  404 |     /offer_pending|coordination/,
  405 |   );
  406 | 
  407 |   await page.screenshot({
  408 |     path: testInfo.outputPath("c08-tal-accept.png"),
  409 |     fullPage: true,
  410 |   });
  411 | });
  412 | 
  413 | test("C08-CUS accept: claimed client approves the sent offer", async ({ page }, testInfo) => {
  414 |   test.setTimeout(180_000);
  415 |   const ready = await latestOfferReadyForClientAccept();
  416 |   expect(ready, "a sent offer must wait on the claimed client after talent approve").not.toBeNull();
  417 |   expect(ready?.contactEmail, "claimed client email must exist").toMatch(/@impronta\.test$/);
  418 |   expect(ready?.offerStatus).toBe("sent");
  419 |   expect(ready?.inquiryStatus).toMatch(/offer_pending|coordination/);
  420 | 
  421 |   const messagesPath = `/${JOURNEYS_SLUG}/client/messages?inquiry=${ready!.inquiryId}&tab=offer`;
  422 |   await signInJourneysStaff(page, messagesPath, ready!.contactEmail!);
  423 |   if (/\/onboarding\/role/.test(page.url())) {
  424 |     const chooseClient = page.getByRole("button", { name: /i'm a client/i });
  425 |     await expect(chooseClient).toBeVisible();
  426 |     await chooseClient.click();
  427 |     await expect(page.getByText(/something went wrong/i)).toHaveCount(0);
  428 |     await expect(page).not.toHaveURL(/\/onboarding\/role/, { timeout: 30_000 });
  429 |     await page.goto(messagesPath);
  430 |   }
  431 |   await expect(page).toHaveURL(
  432 |     new RegExp(`(?:/${JOURNEYS_SLUG})?/client/messages`),
  433 |     { timeout: 40_000 },
  434 |   );
> 435 |   await expect(page.getByRole("heading", { name: /no client account here/i })).toHaveCount(0);
      |                                                                                ^ Error: expect(locator).toHaveCount(expected) failed
  436 |   await expect(page.getByRole("heading", { name: /this page is no longer here/i })).toHaveCount(0);
  437 |   await expect(page.getByText(/host not registered/i)).toHaveCount(0);
  438 | 
  439 |   const offerTab = page.getByRole("tab", { name: /^offer$/i });
  440 |   if (await offerTab.isVisible().catch(() => false)) {
  441 |     await offerTab.click();
  442 |   }
  443 |   const approve = page.getByRole("button", { name: /approve & lock/i });
  444 |   await expect(approve.first()).toBeVisible({ timeout: 40_000 });
  445 |   await approve.first().click();
  446 |   await expect(approve.nth(1)).toBeVisible({ timeout: 15_000 });
  447 |   await approve.nth(1).click();
  448 |   await expect(
  449 |     page.getByText(
  450 |       /you approved this offer|you approved · awaiting others|offer approved|approved, booking soon|all approvals are complete/i,
  451 |     ).first(),
  452 |   ).toBeVisible({ timeout: 30_000 });
  453 | 
  454 |   const approvals = await inquiryOfferApprovals(ready!.offerId);
  455 |   const talent = approvals.find((row) => row.talentProfileId === QA_JOURNEYS_TALENT_ID);
  456 |   const client = approvals.find((row) => row.role === "client");
  457 |   expect(talent?.status, "talent approval must stay accepted").toBe("accepted");
  458 |   expect(client?.status, "client approval must be accepted").toBe("accepted");
  459 | 
  460 |   const offer = await latestInquiryOffer(ready!.inquiryId);
  461 |   expect(offer?.status, "all parties accepted so the offer must flip to accepted").toBe("accepted");
  462 |   const persisted = await latestGuestDirectoryInquiry(ready!.contactEmail!);
  463 |   expect(persisted?.status, "inquiry must be approved once every party accepts").toBe("approved");
  464 | 
  465 |   await page.screenshot({
  466 |     path: testInfo.outputPath("c08-cus-accept.png"),
  467 |     fullPage: true,
  468 |   });
  469 | });
  470 | 
```