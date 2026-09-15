# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: cases/C08-modelling-or-talent-agency.spec.ts >> C08-OP assign: staff adds talent and drafts offer
- Location: e2e/cases/C08-modelling-or-talent-agency.spec.ts:123:5

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('dialog', { name: /message (the agency|qa journeys)/i }).getByText(/inquiry received|got it, we've received your message|sent, awaiting reply/i).first()
Expected: visible
Timeout: 40000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 40000ms
  - waiting for getByRole('dialog', { name: /message (the agency|qa journeys)/i }).getByText(/inquiry received|got it, we've received your message|sent, awaiting reply/i).first()

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
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
        - generic: Bi
        - button "Find Talent" [ref=e33] [cursor=pointer]:
          - generic [ref=e34]: Find Talent
      - paragraph [ref=e36]: No one matches yet. Broaden the filters, or check back as the roster grows.
    - contentinfo [ref=e37]
    - button "Message QA Journeys" [expanded] [ref=e39] [cursor=pointer]:
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
      - generic [ref=e68]:
        - generic [ref=e69]: Need two models for a catalog shoot next month.
        - generic [ref=e70]: Sending…
      - generic [ref=e71]:
        - textbox [ref=e72]
        - textbox "Type your message…" [disabled] [ref=e73]
        - button "Send message" [disabled] [ref=e74]: …
      - generic [ref=e75]:
        - button "Send to agency" [disabled] [ref=e76]
        - paragraph [ref=e77]: No payment now. Sending starts a conversation, not a booking.
      - tablist "Panel navigation" [ref=e78]:
        - tab "Home" [ref=e79] [cursor=pointer]:
          - img [ref=e81]
          - generic [ref=e84]: Home
        - tab "Chat" [selected] [ref=e85]:
          - img [ref=e87]
          - generic [ref=e89]: Chat
        - tab "Lineup" [ref=e90] [cursor=pointer]:
          - img [ref=e92]
          - generic [ref=e97]: Lineup
        - tab "Inquiries" [ref=e98] [cursor=pointer]:
          - img [ref=e100]
          - generic [ref=e103]: Inquiries
  - alert [ref=e104]
```

# Test source

```ts
  45  |   // earlier inquiry. That guest already has a conversation, so the dock
  46  |   // restores the draft ("Not sent") and asks to verify email instead of
  47  |   // showing the name/email gate.
  48  |   await page.context().clearCookies({ name: "impronta_guest" });
  49  |   await page.goto("/directory?inquiry=open");
  50  |   await assertNotAuthWall(page);
  51  |   const chat = page.getByRole("dialog", { name: /message (the agency|qa journeys)/i });
  52  |   await expect(chat).toBeVisible({ timeout: 20_000 });
  53  |   const startNew = chat.getByRole("button", { name: /start a new inquiry/i });
  54  |   if (!(await startNew.isVisible().catch(() => false))) {
  55  |     const switcher = chat.getByRole("button", { name: /switch inquiry/i });
  56  |     if (await switcher.isVisible().catch(() => false)) {
  57  |       await switcher.click();
  58  |     }
  59  |   }
  60  |   if (await startNew.isVisible().catch(() => false)) {
  61  |     await startNew.click();
  62  |   } else {
  63  |     const chatTab = chat.getByRole("tab", { name: /^chat$/i });
  64  |     if (await chatTab.isVisible().catch(() => false)) {
  65  |       await chatTab.click();
  66  |     }
  67  |   }
  68  |   return chat;
  69  | }
  70  | 
  71  | test("C08-CUS smoke: storefront body is reachable — not a journey pass", async ({ page }) => {
  72  |   await openStorefront(page);
  73  | });
  74  | 
  75  | test("C08-OP smoke: operator Sales heading is reachable — not a journey pass", async ({ page }) => {
  76  |   await openWorkspace(page, "sales");
  77  |   await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  78  | });
  79  | 
  80  | test("C08-CUS inquiry: directory guest chat submits and DB agrees", async ({ page }, testInfo) => {
  81  |   test.setTimeout(180_000);
  82  |   const marker = `c08-cus-${Date.now()}@impronta.test`;
  83  |   const brief = "Need two models for a catalog shoot next month.";
  84  | 
  85  |   const chat = await openFreshDirectoryChat(page);
  86  | 
  87  |   const composer = chat.getByPlaceholder(/type your message|write a reply|type a message/i);
  88  |   await expect(composer).toBeVisible({ timeout: 30_000 });
  89  |   await composer.fill(brief);
  90  | 
  91  |   const sendLine = chat.getByRole("button", { name: /send message/i }).first();
  92  |   if (await sendLine.isVisible().catch(() => false)) {
  93  |     await sendLine.click();
  94  |   } else {
  95  |     await chat.getByRole("button", { name: /send to agency/i }).click();
  96  |   }
  97  | 
  98  |   await expect(chat.getByPlaceholder(/^first name$/i)).toBeVisible({ timeout: 20_000 });
  99  |   await chat.getByPlaceholder(/^first name$/i).fill("Cora");
  100 |   await chat.getByPlaceholder(/^last name$/i).fill("Cuevas");
  101 |   await chat.getByPlaceholder(/email/i).fill(marker);
  102 |   await chat.getByRole("button", { name: /^send message$/i }).click();
  103 | 
  104 |   await expect(
  105 |     chat.getByText(/inquiry received|got it, we've received your message|sent, awaiting reply/i).first(),
  106 |   ).toBeVisible({ timeout: 40_000 });
  107 | 
  108 |   const persisted = await latestGuestDirectoryInquiry(marker);
  109 |   expect(persisted, "guest directory inquiry must exist on qa-journeys").not.toBeNull();
  110 |   expect(persisted?.contactEmail).toBe(marker);
  111 |   expect(persisted?.contactName?.toLowerCase()).toContain("cora");
  112 |   expect(persisted?.status).toMatch(/submitted|draft|coordination/);
  113 |   expect(
  114 |     `${persisted?.message ?? ""} ${persisted?.sourcePage ?? ""}`.toLowerCase(),
  115 |   ).toMatch(/catalog|directory|agency/);
  116 | 
  117 |   await page.screenshot({
  118 |     path: testInfo.outputPath("c08-cus-inquiry.png"),
  119 |     fullPage: true,
  120 |   });
  121 | });
  122 | 
  123 | test("C08-OP assign: staff adds talent and drafts offer", async ({ page }, testInfo) => {
  124 |   test.setTimeout(180_000);
  125 |   const marker = `c08-op-${Date.now()}@impronta.test`;
  126 |   const brief = "Need two models for a catalog shoot next month.";
  127 | 
  128 |   const chat = await openFreshDirectoryChat(page);
  129 |   const composer = chat.getByPlaceholder(/type your message|write a reply|type a message/i);
  130 |   await expect(composer).toBeVisible({ timeout: 30_000 });
  131 |   await composer.fill(brief);
  132 |   const sendLine = chat.getByRole("button", { name: /send message/i }).first();
  133 |   if (await sendLine.isVisible().catch(() => false)) {
  134 |     await sendLine.click();
  135 |   } else {
  136 |     await chat.getByRole("button", { name: /send to agency/i }).click();
  137 |   }
  138 |   await expect(chat.getByPlaceholder(/^first name$/i)).toBeVisible({ timeout: 20_000 });
  139 |   await chat.getByPlaceholder(/^first name$/i).fill("Cora");
  140 |   await chat.getByPlaceholder(/^last name$/i).fill("Cuevas");
  141 |   await chat.getByPlaceholder(/email/i).fill(marker);
  142 |   await chat.getByRole("button", { name: /^send message$/i }).click();
  143 |   await expect(
  144 |     chat.getByText(/inquiry received|got it, we've received your message|sent, awaiting reply/i).first(),
> 145 |   ).toBeVisible({ timeout: 40_000 });
      |     ^ Error: expect(locator).toBeVisible() failed
  146 | 
  147 |   const seed = await latestGuestDirectoryInquiry(marker);
  148 |   expect(seed, "C08-OP guest inquiry must exist before staff assign").not.toBeNull();
  149 | 
  150 |   await signInJourneysStaff(page, "/admin/messages");
  151 |   await assertWorkspaceIdentity(page);
  152 |   await page.keyboard.press("Escape");
  153 | 
  154 |   const allChip = page.getByRole("button", { name: /^all$/i });
  155 |   if (await allChip.isVisible().catch(() => false)) {
  156 |     await allChip.click();
  157 |   }
  158 |   const inbox = page.locator("[data-tulala-inbox-scroll]");
  159 |   const row = inbox.getByRole("button", { name: /cora cuevas/i }).first();
  160 |   await expect(row).toBeVisible({ timeout: 30_000 });
  161 |   await row.click();
  162 | 
  163 |   await page.getByRole("tab", { name: /^lineup$/i }).click();
  164 |   await expect(page.locator("[data-live-lineup-loading]")).toHaveCount(0, {
  165 |     timeout: 20_000,
  166 |   });
  167 |   const manage = page.getByText(/^manage$/i);
  168 |   if (await manage.isVisible().catch(() => false)) {
  169 |     await manage.click();
  170 |   }
  171 |   const alreadyOnLineup = page.getByText(/qa journeys talent/i);
  172 |   if (!(await alreadyOnLineup.isVisible().catch(() => false))) {
  173 |     const addTalent = page.getByRole("button", { name: /^add talent$/i });
  174 |     await expect(addTalent).toBeVisible({ timeout: 20_000 });
  175 |     await addTalent.click();
  176 |     const rosterSearch = page.getByPlaceholder(/search roster/i);
  177 |     await expect(rosterSearch).toBeVisible({ timeout: 10_000 });
  178 |     await rosterSearch.fill("QA Journeys");
  179 |     await page.getByRole("button", { name: /qa journeys talent/i }).click();
  180 |     await expect(page.getByText(/invited|added to lineup/i).first()).toBeVisible({
  181 |       timeout: 20_000,
  182 |     });
  183 |   }
  184 | 
  185 |   await page.getByRole("tab", { name: /^offer$/i }).click();
  186 |   const startOffer = page.getByRole("button", { name: /start drafting offer/i });
  187 |   if (await startOffer.isVisible().catch(() => false)) {
  188 |     await startOffer.click();
  189 |     await expect(page.getByText(/offer draft created/i)).toBeVisible({
  190 |       timeout: 20_000,
  191 |     });
  192 |   } else {
  193 |     await expect(page.getByText(/draft|line item|save draft/i).first()).toBeVisible({
  194 |       timeout: 20_000,
  195 |     });
  196 |   }
  197 | 
  198 |   const assigned = await latestAssignedDirectoryInquiry();
  199 |   expect(assigned, "staff assign must persist a talent lineup on qa-journeys").not.toBeNull();
  200 |   expect(assigned?.talentIds).toContain(QA_JOURNEYS_TALENT_ID);
  201 |   expect(assigned?.offerStatus, "draft offer must exist on qa-journeys").toMatch(
  202 |     /draft|pending|sent/,
  203 |   );
  204 | 
  205 |   await page.screenshot({
  206 |     path: testInfo.outputPath("c08-op-assign.png"),
  207 |     fullPage: true,
  208 |   });
  209 | });
  210 | 
  211 | test("C08-OP send: staff prices a line and sends the offer", async ({ page }, testInfo) => {
  212 |   test.setTimeout(180_000);
  213 |   const marker = `c08-op-${Date.now()}@impronta.test`;
  214 |   const brief = "Need two models for a catalog shoot next month.";
  215 | 
  216 |   const chat = await openFreshDirectoryChat(page);
  217 |   const composer = chat.getByPlaceholder(/type your message|write a reply|type a message/i);
  218 |   await expect(composer).toBeVisible({ timeout: 30_000 });
  219 |   await composer.fill(brief);
  220 |   const sendLine = chat.getByRole("button", { name: /send message/i }).first();
  221 |   if (await sendLine.isVisible().catch(() => false)) {
  222 |     await sendLine.click();
  223 |   } else {
  224 |     await chat.getByRole("button", { name: /send to agency/i }).click();
  225 |   }
  226 |   await expect(chat.getByPlaceholder(/^first name$/i)).toBeVisible({ timeout: 20_000 });
  227 |   await chat.getByPlaceholder(/^first name$/i).fill("Cora");
  228 |   await chat.getByPlaceholder(/^last name$/i).fill("Cuevas");
  229 |   await chat.getByPlaceholder(/email/i).fill(marker);
  230 |   await chat.getByRole("button", { name: /^send message$/i }).click();
  231 |   await expect(
  232 |     chat.getByText(/inquiry received|got it, we've received your message|sent, awaiting reply/i).first(),
  233 |   ).toBeVisible({ timeout: 40_000 });
  234 | 
  235 |   const seed = await latestGuestDirectoryInquiry(marker);
  236 |   expect(seed, "C08-OP send guest inquiry must exist before staff send").not.toBeNull();
  237 | 
  238 |   await signInJourneysStaff(page, "/admin/messages");
  239 |   await expect(page).toHaveURL(/\/admin\/messages/, { timeout: 30_000 });
  240 |   const inbox = page.locator("[data-tulala-inbox-scroll]");
  241 |   await expect(inbox).toBeVisible({ timeout: 40_000 });
  242 |   await assertWorkspaceIdentity(page);
  243 |   await page.keyboard.press("Escape");
  244 | 
  245 |   const allChip = page.getByRole("button", { name: /^all$/i });
```