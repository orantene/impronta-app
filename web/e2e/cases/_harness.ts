/**
 * Case-journey spec pattern.
 *
 * Fixtures prepare state. This file only opens the real interface.
 * Each case adds `e2e/cases/Cxx-….spec.ts` rather than a bespoke harness.
 *
 * Auth: PLAYWRIGHT_USE_DEV_SIGNIN=1 and /api/dev/signin already exist.
 * Device: tablet-pos and mobile-checkout projects in playwright.config.ts.
 *
 * A login page, host-not-registered page, or empty error shell cannot pass.
 */

import { test, expect, type Page } from "@playwright/test";

export { test, expect };

export const JOURNEYS_SLUG = process.env.JOURNEYS_TENANT_SLUG ?? "qa-journeys";
export const JOURNEYS_DISPLAY = process.env.JOURNEYS_TENANT_NAME ?? "QA Journeys";
export const FIXTURE_READY = process.env.JOURNEYS_FIXTURE_READY === "1";

export async function prepareJourneysPage(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem("impronta_analytics_consent", "denied");
    } catch {
      /* ignore */
    }
  });
}

export async function assertNotAuthWall(page: Page): Promise<void> {
  const url = page.url().toLowerCase();
  expect(url, "login URL cannot pass a journey").not.toMatch(/\/login|\/signin|\/auth\//);
  await expect(
    page.getByText(/host not registered/i),
    "unregistered host page cannot pass a journey",
  ).toHaveCount(0);
  // A public header "Sign in" link is not an auth wall. The wall is a
  // sign-in heading as the page itself — scanning the whole body also
  // matched builder CSS and failed every storefront journey.
  await expect(
    page.getByRole("heading", { name: /^(sign in|log in|iniciar sesión)$/i }),
    "login heading cannot pass a journey",
  ).toHaveCount(0);
}

export async function assertWorkspaceIdentity(page: Page): Promise<void> {
  await assertNotAuthWall(page);
  expect(
    page.url(),
    "workspace identity must be asserted on a workspace surface",
  ).toMatch(/\/(admin|talent|client)(\/|\?|$)/);
  await expect(
    page.getByRole("heading", { name: /this page is no longer here/i }),
    "branded 404 cannot pass a workspace identity check",
  ).toHaveCount(0);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const landmarks = await page
    .locator("header, [role='banner'], nav, aside, h1")
    .allTextContents();
  const shell = [await page.title(), ...landmarks].join(" ").toLowerCase();
  expect(shell, `workspace chrome must name ${JOURNEYS_DISPLAY}`).toContain(
    JOURNEYS_DISPLAY.toLowerCase().slice(0, 8),
  );
}

export async function openWorkspace(page: Page, segment: string): Promise<void> {
  await signInJourneysStaff(page, `/admin/${segment}`);
  await assertWorkspaceIdentity(page);
}

export async function openStorefront(page: Page): Promise<void> {
  await page.goto("/");
  await assertNotAuthWall(page);
  await expect(page.locator("body")).toBeVisible();
}

export const JOURNEYS_OWNER_EMAIL =
  process.env.JOURNEYS_OWNER_EMAIL ?? "qa-journeys-owner@impronta.test";
export const JOURNEYS_TALENT_EMAIL =
  process.env.JOURNEYS_TALENT_EMAIL ?? "qa-journeys-talent@impronta.test";

/**
 * How many times to ask for a session before calling it a failure.
 *
 * A 404 from `/api/dev/signin` has two very different causes and only one of
 * them is worth retrying.
 *
 * PERMANENT: TULALA_ALLOW_DEV_SURFACES is not set on the dev server. The Edge
 * proxy inlines NODE_ENV=production, so without the flag `/api/dev/*` is not
 * short-circuited, falls through host resolution, and every request lands on
 * the storefront's not-found page. Retrying cannot help and the message below
 * has to name the flag, because the symptom looks like a missing route.
 *
 * TRANSIENT: the Turbopack dev server briefly loses the route from its tree
 * after it rebuilds — observed as four consecutive 404s immediately after
 * `Compiling /_not-found/page`, followed by 307 for the sixteen requests
 * either side of them, all inside one server process with the flag set the
 * whole time. It is a dev-server fault, not a product one, so it must not be
 * allowed to read as "the fixture cannot sign in".
 */
const SIGNIN_ATTEMPTS = 6;

/**
 * Passwordless fixture sign-in. Reads cookies from the 307 and then opens
 * `nextPath` on PLAYWRIGHT_BASE_URL so a Location that dropped the proxy
 * port cannot bounce the browser onto :80.
 */
export async function signInJourneysStaff(
  page: Page,
  nextPath = "/admin/pos",
  email = JOURNEYS_OWNER_EMAIL,
): Promise<void> {
  const params = new URLSearchParams({ email, next: nextPath });
  const seen: number[] = [];
  let setCookies: string[] = [];
  for (let attempt = 1; attempt <= SIGNIN_ATTEMPTS; attempt += 1) {
    const res = await page.request.get(`/api/dev/signin?${params.toString()}`, {
      maxRedirects: 0,
    });
    if (res.status() === 307) {
      setCookies = res
        .headersArray()
        .filter((h) => h.name.toLowerCase() === "set-cookie")
        .map((h) => h.value);
      break;
    }
    seen.push(res.status());
    // 404 (Turbopack briefly missing the route) and 502/503 (Next restarting
    // or the proxy's upstream gone) are the only statuses worth retrying.
    // 403/400/401/500 are the handler answering; retrying only delays the report.
    if (res.status() !== 404 && res.status() !== 502 && res.status() !== 503) {
      expect(res.status(), `dev sign-in refused: ${await res.text()}`).toBe(307);
    }
    if (attempt < SIGNIN_ATTEMPTS) await page.waitForTimeout(250 * attempt);
  }
  expect(
    seen.length,
    `dev sign-in returned ${seen.join(", ")} — ${SIGNIN_ATTEMPTS} 404s is not a rebuild ` +
      `gap. Start the dev server with TULALA_ALLOW_DEV_SURFACES=1 or /api/dev/* falls ` +
      `through to the storefront's not-found page.`,
  ).toBeLessThan(SIGNIN_ATTEMPTS);
  // A response that is not followed does not always reach the browser's cookie
  // jar (observed on a remote https origin: only the platform's own cookie was
  // stored). The session cookie is the whole point of the call, so put it in
  // the context explicitly rather than trusting the transfer.
  await adoptSetCookies(page, setCookies);
  await page.goto(nextPath);
  await assertNotAuthWall(page);
}

/** Parse `Set-Cookie` headers from a non-followed response into the context. */
async function adoptSetCookies(page: Page, headers: string[]): Promise<void> {
  if (headers.length === 0) return;
  const origin = new URL(
    process.env.PLAYWRIGHT_BASE_URL ?? new URL(page.url()).origin,
  );
  const cookies = headers
    .map((header) => {
      const [pair, ...attrs] = header.split(";");
      const eq = pair.indexOf("=");
      if (eq <= 0) return null;
      const attrMap = new Map(
        attrs.map((a) => {
          const [k, ...v] = a.trim().split("=");
          return [k.toLowerCase(), v.join("=")] as const;
        }),
      );
      const sameSiteRaw = (attrMap.get("samesite") ?? "Lax").toLowerCase();
      const sameSite =
        sameSiteRaw === "none" ? "None" : sameSiteRaw === "strict" ? "Strict" : "Lax";
      return {
        name: pair.slice(0, eq).trim(),
        value: pair.slice(eq + 1).trim(),
        domain: attrMap.get("domain")?.replace(/^\./, "") ?? origin.hostname,
        path: attrMap.get("path") ?? "/",
        httpOnly: attrMap.has("httponly"),
        secure: attrMap.has("secure") || origin.protocol === "https:",
        sameSite,
      };
    })
    .filter((c): c is NonNullable<typeof c> => c !== null);
  if (cookies.length > 0) await page.context().addCookies(cookies);
}

// ── The counter (P3) ───────────────────────────────────────────────────
//
// Five helpers rather than five copies of the same locators in five case
// specs. The counter's affordances are shared by every case that rings
// something up, and the last time they were spelled out per file a screen
// rewrite left four specs driving buttons that no longer existed.
//
// Each one names the affordance, never the markup: a role and an accessible
// name, so the assertion is what a cashier can see and reach.

/** Open the counter on a fixture workspace, chrome and all. */
export async function openCounter(page: Page, orderId?: string): Promise<void> {
  const query = orderId ? `&order=${encodeURIComponent(orderId)}` : "";
  await signInJourneysStaff(page, `/admin/pos?mode=counter${query}`);
  await assertWorkspaceIdentity(page);
}

/** C02 — a fresh, empty sale. Resolves once the URL carries its order id. */
export async function counterStartSale(page: Page): Promise<void> {
  await page.getByRole("button", { name: /start a new sale/i }).click();
  await expect(page).toHaveURL(/order=/, { timeout: 30_000 });
}

/** Add one unit of a catalog item by its own name. */
export async function counterAddItem(page: Page, title: string): Promise<void> {
  const tile = page.getByRole("button", { name: title }).first();
  await expect(tile).toBeVisible({ timeout: 20_000 });
  await tile.click();
  await expect(page.getByText(/add an item to start this sale/i)).toHaveCount(0, {
    timeout: 20_000,
  });
}

/**
 * Name the buyer.
 *
 * `startCollection` hands this to `ensureCustomer`, which is what writes
 * `orders.customer_id` — so this is how a case's marker email reaches the row
 * its DB assertion looks the order up by.
 */
export async function counterNameBuyer(page: Page, email: string): Promise<void> {
  await page.getByLabel(/^e-?mail$/i).first().fill(email);
}

/**
 * Charge, then confirm cash. Two taps because the counter has two screens:
 * Charge opens the collect sheet (money.md M01), Confirm cash takes it.
 *
 * Tendering exactly the amount due is the default, so no keypad entry is
 * needed for the ordinary case.
 */
export async function counterCollectCash(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^Charge · /i }).first().click();
  await expect(page.getByRole("tab", { name: /^cash$/i })).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: /confirm cash/i }).click();
}

/** The paid screen (M13). The one honest proof a collection landed. */
export async function expectCounterPaid(page: Page): Promise<void> {
  await expect(page.getByRole("heading", { name: /^paid$/i })).toBeVisible({ timeout: 30_000 });
}

export function skipUnlessFixture(): void {
  test.skip(!FIXTURE_READY, "P0-06 apply needs credentials; set JOURNEYS_FIXTURE_READY=1 after seed");
}
