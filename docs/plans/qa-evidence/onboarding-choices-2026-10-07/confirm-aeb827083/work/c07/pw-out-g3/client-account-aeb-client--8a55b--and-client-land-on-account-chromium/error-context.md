# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: client-account/aeb-client-account.spec.ts >> TUL-64: /me, /cuenta and /client land on /account
- Location: e2e/client-account/aeb-client-account.spec.ts:150:5

# Error details

```
Error: /me redirect target

expect(received).toMatch(expected)

Expected pattern: /^\/account(\/|$)/
Received string:  "/me"
```

# Test source

```ts
  53  |   assertIsolated();
  54  |   const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  55  |   const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY ?? "", { auth: { persistSession: false } });
  56  |   const anon = createClient(url, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "", { auth: { persistSession: false, autoRefreshToken: false } });
  57  |   const link = await admin.auth.admin.generateLink({ type: "magiclink", email: EMAIL });
  58  |   const hash = link.data?.properties?.hashed_token;
  59  |   if (link.error || !hash) throw new Error(`magic link failed: ${link.error?.message ?? "no hashed_token"}`);
  60  |   const v = await anon.auth.verifyOtp({ type: "magiclink", token_hash: hash });
  61  |   if (v.error || !v.data.session) throw new Error(`verifyOtp failed: ${v.error?.message ?? "no session"}`);
  62  |   // One session, valid on both hosts (cookie per host, same token).
  63  |   cookies = [BASE, AGENCY_BASE].filter(Boolean).flatMap((b) => buildSessionCookies(v.data.session!, new URL(b).hostname, ISOLATED_REF).map((c) => ({ ...c, secure: false })));
  64  | });
  65  | 
  66  | test.beforeEach(async ({ context, page }) => {
  67  |   await context.addCookies(cookies);
  68  |   await page.addInitScript(() => {
  69  |     try { window.localStorage.setItem("impronta_analytics_consent", "denied"); } catch { /* ignore */ }
  70  |   });
  71  | });
  72  | 
  73  | const body = (page: Page) => page.evaluate(() => document.body.innerText);
  74  | 
  75  | async function expectAccountHome(page: Page, path: string): Promise<void> {
  76  |   await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  77  |   await expect(page.getByRole("heading", { name: /^(sign in|log in)$/i }), "client must not hit a sign-in wall").toHaveCount(0);
  78  |   await expect(page.getByText(/host not registered/i)).toHaveCount(0);
  79  |   await expect(page.getByText(/this is a team account|esta es una cuenta de equipo/i), "client must not be treated as a team account").toHaveCount(0);
  80  | }
  81  | 
  82  | // TUL-61: icon + signed-in summary on the talent site.
  83  | test("TUL-61: the account icon opens a signed-in summary with 'My account' (opened and closed, nothing clicked inside)", async ({ page }, info) => {
  84  |   await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  85  |   const icon = page.getByRole("button", { name: /open account menu|abrir men[uú] de cuenta/i }).first();
  86  |   await expect(icon, "account icon in the site header").toBeVisible({ timeout: 30_000 });
  87  |   await icon.click();
  88  |   const dialog = page.getByRole("dialog").first();
  89  |   await expect(dialog).toBeVisible();
  90  |   await expect(dialog).toContainText(EMAIL.split("@")[0]!.slice(0, 8));
  91  |   await expect(dialog.getByRole("link", { name: /my account|mi cuenta/i }).first()).toBeVisible();
  92  |   await info.attach("account popover", { body: await page.screenshot(), contentType: "image/png" });
  93  |   await page.keyboard.press("Escape");
  94  | });
  95  | 
  96  | // TUL-62: /account on the talent site, four tabs.
  97  | test("TUL-62: /account shows the four tabs and each tab renders its real content or its honest empty line", async ({ page }, info) => {
  98  |   await expectAccountHome(page, "/account");
  99  |   const nav = page.getByRole("navigation", { name: /your account|tu cuenta/i });
  100 |   for (const tab of [/visits|visitas/i, /messages|mensajes/i, /payments|pagos/i, /settings|ajustes|configuraci/i]) {
  101 |     await expect(nav.getByRole("link", { name: tab })).toBeVisible();
  102 |   }
  103 |   await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
  104 | 
  105 |   await page.goto(`${BASE}/account?tab=messages`, { waitUntil: "domcontentloaded" });
  106 |   await expect(page.getByText(/no messages yet|a[uú]n no hay mensajes/i).or(page.locator('a[href^="/account/messages/"]').first())).toBeVisible();
  107 | 
  108 |   await page.goto(`${BASE}/account?tab=payments`, { waitUntil: "domcontentloaded" });
  109 |   await expect(page.getByRole("heading", { name: /balance due|saldo/i })).toBeVisible();
  110 |   await expect(page.getByRole("heading", { name: /receipts|recibos/i })).toBeVisible();
  111 | 
  112 |   await page.goto(`${BASE}/account?tab=settings`, { waitUntil: "domcontentloaded" });
  113 |   await expect(page.getByText(EMAIL, { exact: false })).toBeVisible();
  114 |   await expect(page.getByRole("button", { name: /^(save|guardar)$/i })).toBeVisible(); // seen, never clicked
  115 |   await expect(page.getByRole("button", { name: /log out|cerrar sesi/i })).toBeVisible(); // seen, never clicked
  116 |   await info.attach("settings tab", { body: await page.screenshot(), contentType: "image/png" });
  117 | });
  118 | 
  119 | test("TUL-62: a visit opens its detail with Cancel and Change time offered and the cancellation policy stated (never clicked)", async ({ page }, info) => {
  120 |   await expectAccountHome(page, "/account");
  121 |   const first = page.locator('a[href^="/account/visits/"]').first();
  122 |   test.skip((await first.count()) === 0, "this client has no visit on the stack: run 5 must create a booking for CLIENT_QA_EMAIL first");
  123 |   await first.click();
  124 |   await expect(page).toHaveURL(/\/account\/visits\//);
  125 |   const text = await body(page);
  126 |   expect(text, "cancellation policy line").toMatch(/cancellation policy|pol[ií]tica de cancelaci/i);
  127 |   expect(text, "time zone note").toMatch(/times are in|las horas est[aá]n en/i);
  128 |   const cancellable = await page.getByRole("button", { name: /cancel visit|cancelar (la )?visita/i }).count();
  129 |   const movable = await page.getByRole("button", { name: /change time|cambiar (la )?hora/i }).count();
  130 |   info.annotations.push({ type: "actions", description: `cancel=${cancellable} change-time=${movable}` });
  131 |   // A confirmed, future visit must offer both; a past/cancelled one offers neither, and says why.
  132 |   if (/confirmed|confirmad/i.test(text) && !/free cancellation window has passed|ventana de cancelaci/i.test(text)) {
  133 |     expect(cancellable, "Cancel offered").toBeGreaterThan(0);
  134 |     expect(movable, "Change time offered").toBeGreaterThan(0);
  135 |   }
  136 |   await info.attach("visit detail", { body: await page.screenshot(), contentType: "image/png" });
  137 | });
  138 | 
  139 | test("TUL-62: a receipt (if any) shows the seller block and the 1.5% fee line (TUL-67 page side)", async ({ page }) => {
  140 |   await expectAccountHome(page, "/account?tab=payments");
  141 |   const rec = page.locator('a[href^="/account/receipts/"]').first();
  142 |   test.skip((await rec.count()) === 0, "no receipt for this client: needs a PAID booking from paid QA S4 (card 8)");
  143 |   await rec.click();
  144 |   const text = await body(page);
  145 |   expect(text).toMatch(/sold by|vendido por/i);
  146 |   expect(text).toMatch(/1\.5\s?%|1,5\s?%/);
  147 | });
  148 | 
  149 | // TUL-64: /me /cuenta /client redirect into /account; agency host has the extra tabs.
  150 | test("TUL-64: /me, /cuenta and /client land on /account", async ({ page }) => {
  151 |   for (const legacy of ["/me", "/cuenta", "/client"]) {
  152 |     await page.goto(`${BASE}${legacy}`, { waitUntil: "domcontentloaded" });
> 153 |     expect(new URL(page.url()).pathname, `${legacy} redirect target`).toMatch(/^\/account(\/|$)/);
      |                                                                       ^ Error: /me redirect target
  154 |   }
  155 | });
  156 | 
  157 | test("TUL-64: on an agency host /account carries the agency tabs (Quotes, Shortlists, Approvals) after the four", async ({ page }) => {
  158 |   test.skip(!AGENCY_BASE, "set CLIENT_QA_AGENCY_BASE_URL to a staging-qa agency host where this client has a relationship");
  159 |   await page.goto(`${AGENCY_BASE}/account`, { waitUntil: "domcontentloaded" });
  160 |   const nav = page.getByRole("navigation", { name: /your account|tu cuenta/i });
  161 |   for (const tab of [/quotes|cotizaciones/i, /shortlists|listas/i, /approvals|aprobaciones/i]) {
  162 |     await expect(nav.getByRole("link", { name: tab })).toBeVisible();
  163 |   }
  164 | });
  165 | 
  166 | // TUL-67 (email side): the branded client email body cannot be read from the UI.
  167 | test.fixme("TUL-67: the branded confirmation/receipt email body (themed layout, 'via Tulala' sender, reply-to Messages, Manage booking link, seller block + 1.5% fee line)", async () => {
  168 |   // Blocked on card 93: the isolated send-email hook still rejects, so no body is captured. Once it is fixed,
  169 |   // read the captured message for CLIENT_QA_EMAIL from the hook's sink and assert the five parts named here.
  170 | });
  171 | 
```