# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: cases/C08-modelling-or-talent-agency.spec.ts >> C08-CUS inquiry: directory guest chat submits and DB agrees
- Location: e2e/cases/C08-modelling-or-talent-agency.spec.ts:75:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('dialog', { name: /message (the agency|qa journeys)/i }).getByPlaceholder(/^first name$/i)
Expected: visible
Timeout: 20000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 20000ms
  - waiting for getByRole('dialog', { name: /message (the agency|qa journeys)/i }).getByPlaceholder(/^first name$/i)

```

# Page snapshot

```yaml
- generic [ref=e1]:
  - generic [ref=e2]:
    - banner [ref=e3]:
      - generic [ref=e4]:
        - generic [ref=e5]:
          - link "Search talent" [ref=e6] [cursor=pointer]:
            - /url: /directory
            - img
          - link "QA Journeys" [ref=e8] [cursor=pointer]:
            - /url: /
            - generic [ref=e9]: QA Journeys
        - generic [ref=e10]:
          - link "Book now" [ref=e11] [cursor=pointer]:
            - /url: "?inquiry=open"
          - group "Language" [ref=e12]:
            - link "English" [ref=e14] [cursor=pointer]:
              - /url: /directory
              - text: EN
            - generic [ref=e15]:
              - generic [ref=e16]: "|"
              - link "Español" [ref=e17] [cursor=pointer]:
                - /url: /es/directory
                - text: ES
          - generic [ref=e18]:
            - button "Open shortlist and inquiry" [ref=e19] [cursor=pointer]:
              - img
            - button "Start an inquiry" [ref=e20] [cursor=pointer]:
              - img
          - link "Log in or sign up" [ref=e21] [cursor=pointer]:
            - /url: /login
            - img
    - generic [ref=e24]:
      - generic [ref=e25]:
        - generic [ref=e26]: Roster
        - heading "Talent" [level=2] [ref=e27]
        - paragraph [ref=e28]: Browse the roster. Filter by discipline, refine with natural language.
      - generic [ref=e31]:
        - img
        - textbox "Search directory" [ref=e32]:
          - /placeholder: e.g. a bilingual host in Milan available next month
        - button "Find Talent" [ref=e33] [cursor=pointer]:
          - generic [ref=e34]: Find Talent
      - paragraph [ref=e36]: No one matches yet. Broaden the filters, or check back as the roster grows.
    - contentinfo [ref=e37]
    - button "Inquiry sent" [expanded] [ref=e39] [cursor=pointer]:
      - img [ref=e40]
      - generic [ref=e43]: Close
    - dialog "Message QA Journeys" [ref=e44]:
      - generic [ref=e45]:
        - generic [ref=e46]:
          - generic [ref=e47]:
            - generic [ref=e48]: Q
            - generic [ref=e49]: QA Journeys
          - 'button "Switch inquiry. Currently: New inquiry" [ref=e50] [cursor=pointer]':
            - generic [ref=e51]: New inquiry
            - img [ref=e52]
        - button "Event details" [ref=e54] [cursor=pointer]:
          - img [ref=e55]
          - text: Add details
        - button "Expand panel" [ref=e56] [cursor=pointer]:
          - img [ref=e57]
        - button "Close" [ref=e62] [cursor=pointer]:
          - img [ref=e63]
      - generic [ref=e67]:
        - generic [ref=e68]:
          - generic [ref=e69]: Need two models for a catalog shoot next month.
          - generic [ref=e70]: Not sent. Restored to the box.
        - status [ref=e71]:
          - generic [ref=e72]: Verify your email to start more conversations
          - generic [ref=e73]: You have 1 conversation going. Verify your email and you can start more. It only takes a tap on the link we send you.
      - alert [ref=e74]: You have a conversation going — verify your email to start more.
      - generic [ref=e75]:
        - textbox [ref=e76]
        - textbox "Type your message…" [active] [ref=e77]: Need two models for a catalog shoot next month.
        - button "Send message" [ref=e78] [cursor=pointer]:
          - img [ref=e79]
      - generic [ref=e82]:
        - button "Send to agency" [ref=e83] [cursor=pointer]
        - paragraph [ref=e84]: No payment now. Sending starts a conversation, not a booking.
      - tablist "Panel navigation" [ref=e85]:
        - tab "Home" [ref=e86] [cursor=pointer]:
          - img [ref=e88]
          - generic [ref=e91]: Home
        - tab "Chat" [selected] [ref=e92]:
          - img [ref=e94]
          - generic [ref=e96]: Chat
        - tab "Lineup" [ref=e97] [cursor=pointer]:
          - img [ref=e99]
          - generic [ref=e104]: Lineup
        - tab "Inquiries" [ref=e105] [cursor=pointer]:
          - generic [ref=e106]:
            - img [ref=e107]
            - generic [ref=e110]: "1"
          - generic [ref=e111]: Inquiries
  - alert [ref=e112]
```

# Test source

```ts
  1   | /**
  2   |  * C08 [representative] — modelling / talent agency.
  3   |  * Smoke stays honest. C08-CUS guest directory inquiry is a real journey on qa-journeys.
  4   |  */
  5   | import {
  6   |   test,
  7   |   expect,
  8   |   openWorkspace,
  9   |   openStorefront,
  10  |   prepareJourneysPage,
  11  |   skipUnlessFixture,
  12  |   assertNotAuthWall,
  13  |   signInJourneysStaff,
  14  |   assertWorkspaceIdentity,
  15  |   JOURNEYS_SLUG,
  16  |   JOURNEYS_TALENT_EMAIL,
  17  | } from "./_harness";
  18  | import {
  19  |   latestGuestDirectoryInquiry,
  20  |   latestAssignedDirectoryInquiry,
  21  |   latestSentDirectoryInquiry,
  22  |   latestSentOfferAwaitingTalent,
  23  |   latestOfferReadyForClientAccept,
  24  |   latestInquiryOffer,
  25  |   inquiryOfferLines,
  26  |   inquiryOfferApprovalCount,
  27  |   inquiryOfferApprovals,
  28  |   QA_JOURNEYS_TALENT_ID,
  29  | } from "./_isolated-db";
  30  | import type { Page } from "@playwright/test";
  31  | 
  32  | skipUnlessFixture();
  33  | 
  34  | test.beforeEach(async ({ page }) => {
  35  |   await prepareJourneysPage(page);
  36  | });
  37  | 
  38  | /**
  39  |  * Directory guest chat after the fidelity re-skin keeps a prior thread in the
  40  |  * dock. The name/email gate only appears on a first send of a NEW inquiry, so
  41  |  * a leftover draft looks like a missing form. Open a fresh thread first.
  42  |  */
  43  | async function openFreshDirectoryChat(page: Page) {
  44  |   await page.goto("/directory?inquiry=open");
  45  |   await assertNotAuthWall(page);
  46  |   const chat = page.getByRole("dialog", { name: /message (the agency|qa journeys)/i });
  47  |   await expect(chat).toBeVisible({ timeout: 20_000 });
  48  |   const startNew = chat.getByRole("button", { name: /start a new inquiry/i });
  49  |   if (!(await startNew.isVisible().catch(() => false))) {
  50  |     const switcher = chat.getByRole("button", { name: /switch inquiry/i });
  51  |     if (await switcher.isVisible().catch(() => false)) {
  52  |       await switcher.click();
  53  |     }
  54  |   }
  55  |   if (await startNew.isVisible().catch(() => false)) {
  56  |     await startNew.click();
  57  |   } else {
  58  |     const chatTab = chat.getByRole("tab", { name: /^chat$/i });
  59  |     if (await chatTab.isVisible().catch(() => false)) {
  60  |       await chatTab.click();
  61  |     }
  62  |   }
  63  |   return chat;
  64  | }
  65  | 
  66  | test("C08-CUS smoke: storefront body is reachable — not a journey pass", async ({ page }) => {
  67  |   await openStorefront(page);
  68  | });
  69  | 
  70  | test("C08-OP smoke: operator Sales heading is reachable — not a journey pass", async ({ page }) => {
  71  |   await openWorkspace(page, "sales");
  72  |   await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  73  | });
  74  | 
  75  | test("C08-CUS inquiry: directory guest chat submits and DB agrees", async ({ page }, testInfo) => {
  76  |   test.setTimeout(180_000);
  77  |   const marker = `c08-cus-${Date.now()}@impronta.test`;
  78  |   const brief = "Need two models for a catalog shoot next month.";
  79  | 
  80  |   const chat = await openFreshDirectoryChat(page);
  81  | 
  82  |   const composer = chat.getByPlaceholder(/type your message|write a reply|type a message/i);
  83  |   await expect(composer).toBeVisible({ timeout: 30_000 });
  84  |   await composer.fill(brief);
  85  | 
  86  |   const sendLine = chat.getByRole("button", { name: /send message/i }).first();
  87  |   if (await sendLine.isVisible().catch(() => false)) {
  88  |     await sendLine.click();
  89  |   } else {
  90  |     await chat.getByRole("button", { name: /send to agency/i }).click();
  91  |   }
  92  | 
> 93  |   await expect(chat.getByPlaceholder(/^first name$/i)).toBeVisible({ timeout: 20_000 });
      |                                                        ^ Error: expect(locator).toBeVisible() failed
  94  |   await chat.getByPlaceholder(/^first name$/i).fill("Cora");
  95  |   await chat.getByPlaceholder(/^last name$/i).fill("Cuevas");
  96  |   await chat.getByPlaceholder(/email/i).fill(marker);
  97  |   await chat.getByRole("button", { name: /^send message$/i }).click();
  98  | 
  99  |   await expect(
  100 |     chat.getByText(/inquiry received|got it, we've received your message|sent, awaiting reply/i).first(),
  101 |   ).toBeVisible({ timeout: 40_000 });
  102 | 
  103 |   const persisted = await latestGuestDirectoryInquiry(marker);
  104 |   expect(persisted, "guest directory inquiry must exist on qa-journeys").not.toBeNull();
  105 |   expect(persisted?.contactEmail).toBe(marker);
  106 |   expect(persisted?.contactName?.toLowerCase()).toContain("cora");
  107 |   expect(persisted?.status).toMatch(/submitted|draft|coordination/);
  108 |   expect(
  109 |     `${persisted?.message ?? ""} ${persisted?.sourcePage ?? ""}`.toLowerCase(),
  110 |   ).toMatch(/catalog|directory|agency/);
  111 | 
  112 |   await page.screenshot({
  113 |     path: testInfo.outputPath("c08-cus-inquiry.png"),
  114 |     fullPage: true,
  115 |   });
  116 | });
  117 | 
  118 | test("C08-OP assign: staff adds talent and drafts offer", async ({ page }, testInfo) => {
  119 |   test.setTimeout(180_000);
  120 |   const marker = `c08-op-${Date.now()}@impronta.test`;
  121 |   const brief = "Need two models for a catalog shoot next month.";
  122 | 
  123 |   const chat = await openFreshDirectoryChat(page);
  124 |   const composer = chat.getByPlaceholder(/type your message|write a reply|type a message/i);
  125 |   await expect(composer).toBeVisible({ timeout: 30_000 });
  126 |   await composer.fill(brief);
  127 |   const sendLine = chat.getByRole("button", { name: /send message/i }).first();
  128 |   if (await sendLine.isVisible().catch(() => false)) {
  129 |     await sendLine.click();
  130 |   } else {
  131 |     await chat.getByRole("button", { name: /send to agency/i }).click();
  132 |   }
  133 |   await expect(chat.getByPlaceholder(/^first name$/i)).toBeVisible({ timeout: 20_000 });
  134 |   await chat.getByPlaceholder(/^first name$/i).fill("Cora");
  135 |   await chat.getByPlaceholder(/^last name$/i).fill("Cuevas");
  136 |   await chat.getByPlaceholder(/email/i).fill(marker);
  137 |   await chat.getByRole("button", { name: /^send message$/i }).click();
  138 |   await expect(
  139 |     chat.getByText(/inquiry received|got it, we've received your message|sent, awaiting reply/i).first(),
  140 |   ).toBeVisible({ timeout: 40_000 });
  141 | 
  142 |   const seed = await latestGuestDirectoryInquiry(marker);
  143 |   expect(seed, "C08-OP guest inquiry must exist before staff assign").not.toBeNull();
  144 | 
  145 |   await signInJourneysStaff(page, "/admin/messages");
  146 |   await assertWorkspaceIdentity(page);
  147 |   await page.keyboard.press("Escape");
  148 | 
  149 |   const allChip = page.getByRole("button", { name: /^all$/i });
  150 |   if (await allChip.isVisible().catch(() => false)) {
  151 |     await allChip.click();
  152 |   }
  153 |   const inbox = page.locator("[data-tulala-inbox-scroll]");
  154 |   const row = inbox.getByRole("button", { name: /cora cuevas/i }).first();
  155 |   await expect(row).toBeVisible({ timeout: 30_000 });
  156 |   await row.click();
  157 | 
  158 |   await page.getByRole("tab", { name: /^lineup$/i }).click();
  159 |   await expect(page.locator("[data-live-lineup-loading]")).toHaveCount(0, {
  160 |     timeout: 20_000,
  161 |   });
  162 |   const manage = page.getByText(/^manage$/i);
  163 |   if (await manage.isVisible().catch(() => false)) {
  164 |     await manage.click();
  165 |   }
  166 |   const alreadyOnLineup = page.getByText(/qa journeys talent/i);
  167 |   if (!(await alreadyOnLineup.isVisible().catch(() => false))) {
  168 |     const addTalent = page.getByRole("button", { name: /^add talent$/i });
  169 |     await expect(addTalent).toBeVisible({ timeout: 20_000 });
  170 |     await addTalent.click();
  171 |     const rosterSearch = page.getByPlaceholder(/search roster/i);
  172 |     await expect(rosterSearch).toBeVisible({ timeout: 10_000 });
  173 |     await rosterSearch.fill("QA Journeys");
  174 |     await page.getByRole("button", { name: /qa journeys talent/i }).click();
  175 |     await expect(page.getByText(/invited|added to lineup/i).first()).toBeVisible({
  176 |       timeout: 20_000,
  177 |     });
  178 |   }
  179 | 
  180 |   await page.getByRole("tab", { name: /^offer$/i }).click();
  181 |   const startOffer = page.getByRole("button", { name: /start drafting offer/i });
  182 |   if (await startOffer.isVisible().catch(() => false)) {
  183 |     await startOffer.click();
  184 |     await expect(page.getByText(/offer draft created/i)).toBeVisible({
  185 |       timeout: 20_000,
  186 |     });
  187 |   } else {
  188 |     await expect(page.getByText(/draft|line item|save draft/i).first()).toBeVisible({
  189 |       timeout: 20_000,
  190 |     });
  191 |   }
  192 | 
  193 |   const assigned = await latestAssignedDirectoryInquiry();
```