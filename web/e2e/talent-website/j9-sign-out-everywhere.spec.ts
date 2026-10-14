/**
 * J9 — S1 sign-out regression (TUL-708 / TUL-712 / TUL-621).
 *
 * "First Log out does not end the session" kept coming back. Root cause: the
 * proxy refreshed (re-minted) the session cookie on the sign-out request, and
 * Log out was a one-scope server action plus a client hop. Middleware verifies
 * JWTs locally, so any surviving cookie copy kept the user signed in.
 *
 * This journey runs against the LOCAL Supabase of the talent-website lane
 * (never production): it signs in, holds the session at several cookie scopes
 * across two subdomains (`localhost` + `acme.lvh.me`, which shares `.lvh.me`),
 * plants a browser-side Supabase session in localStorage, logs out through
 * each entry point, reloads, and asserts every host is signed out.
 *
 * Not run by agent sessions (no servers); CI runs it in the talent-website lane.
 */
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import { ACME_AGENCY_LOCAL_DOMAIN, talentFixture } from "./fixtures";
import { TALENT_SITE_FIXTURE_READY } from "./helpers";

const PORT = Number(new URL(process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000").port || 3000);
const HOSTS = [`http://localhost:${PORT}`, `http://${ACME_AGENCY_LOCAL_DOMAIN}:${PORT}`];
const AUTH_RE = /^sb-.*-auth-token(\.\d+)?$/;
const FX = talentFixture("t_ready");

/**
 * Dev sign-in through the context's request client (shared cookie jar), not a
 * navigation: the endpoint answers 307 and the browser aborts a `page.goto`
 * mid-redirect (net::ERR_ABORTED), which failed every run. The Set-Cookie on
 * the 307 lands in the browser context for that host; the caller then
 * navigates to the host root and asserts the session cookie is present.
 */
async function signIn(page: Page, origin: string) {
  const url = `${origin}/api/dev/signin?email=${encodeURIComponent(FX.email)}&next=%2F`;
  let status = 0;
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    try {
      const res = await page.request.get(url, { maxRedirects: 0 });
      status = res.status();
      if (status === 307) break;
    } catch {
      status = 0; // server still warming up; retry
    }
    await page.waitForTimeout(250 * attempt);
  }
  expect(status, `dev-signin failed on ${origin}`).toBe(307);
  await page.goto(`${origin}/`, { waitUntil: "domcontentloaded" });
  const auth = (await page.context().cookies(origin)).filter((c) => AUTH_RE.test(c.name));
  expect(auth.length, `signed in (auth cookie) on ${origin}`).toBeGreaterThan(0);
}

/** Hold the session at every scope a real browser accumulates. */
async function spreadSessionAcrossScopes(context: BrowserContext) {
  const auth = (await context.cookies()).filter((c) => AUTH_RE.test(c.name));
  expect(auth.length, "signed in with an auth cookie").toBeGreaterThan(0);
  const copies = auth.flatMap((c) => [
    { name: c.name, value: c.value, domain: ".lvh.me", path: "/" },
    { name: c.name, value: c.value, domain: ACME_AGENCY_LOCAL_DOMAIN, path: "/" },
    { name: c.name, value: c.value, domain: "localhost", path: "/" },
  ]);
  await context.addCookies(copies);
}

async function plantBrowserSession(page: Page) {
  await page.evaluate(() => {
    localStorage.setItem("sb-e2e-auth-token", JSON.stringify({ access_token: "stale" }));
    sessionStorage.setItem("sb-e2e-auth-token", "stale");
  });
}

async function assertSignedOutEverywhere(page: Page, context: BrowserContext) {
  for (const origin of HOSTS) {
    await page.goto(`${origin}/login`, { waitUntil: "domcontentloaded" });
    await page.reload({ waitUntil: "domcontentloaded" });
    const left = (await context.cookies(origin)).filter((c) => AUTH_RE.test(c.name));
    expect(left.map((c) => `${c.name}@${c.domain}`), `auth cookies left on ${origin}`).toEqual([]);
    const stored = await page.evaluate(() =>
      [...Object.keys(localStorage), ...Object.keys(sessionStorage)].filter((k) => k.startsWith("sb-")),
    );
    if (origin === HOSTS[0]) expect(stored, "browser Supabase session cleared").toEqual([]);
    // /account must not render a signed-in page after sign-out.
    await page.goto(`${origin}/account`, { waitUntil: "domcontentloaded" });
    await expect(page.getByText(new RegExp(FX.email, "i"))).toHaveCount(0);
  }
}

/** Each Log out entry point, driven the way the product drives it. */
const ENTRY_POINTS: { name: string; run: (page: Page) => Promise<void> }[] = [
  {
    // SignOutForm (headers, account menus, admin bars, marketing header).
    name: "declarative SignOutForm POST /auth/sign-out",
    run: async (page) => {
      await page.evaluate(() => {
        const f = document.createElement("form");
        f.method = "post";
        f.action = "/auth/sign-out";
        document.body.appendChild(f);
        f.submit();
      });
    },
  },
  {
    // signOutEverywhere(CLIENT_SIGN_OUT_PATH): talent-host popover.
    name: "client popover POST /auth/client-sign-out",
    run: async (page) => {
      await page.evaluate(() => {
        const f = document.createElement("form");
        f.method = "post";
        f.action = "/auth/client-sign-out";
        document.body.appendChild(f);
        f.submit();
      });
    },
  },
  {
    // Whatever visible Log out control the page renders (first click only).
    name: "visible Log out control, first click",
    run: async (page) => {
      await page.goto(`${HOSTS[0]}/account`, { waitUntil: "domcontentloaded" });
      const control = page
        .getByRole("button", { name: /^(log out|sign out|cerrar sesi[oó]n)$/i })
        .first();
      if ((await control.count()) === 0) {
        await page.goto(`${HOSTS[0]}/`, { waitUntil: "domcontentloaded" });
        const menu = page.getByRole("button", { name: /account|cuenta/i }).first();
        if (await menu.count()) await menu.click();
      }
      const target = page.getByRole("button", { name: /^(log out|sign out|cerrar sesi[oó]n)$/i }).first();
      test.skip((await target.count()) === 0, "no visible Log out control on this fixture's pages");
      await target.click();
    },
  },
];

test.describe("S1 sign-out ends the session on every subdomain", () => {
  test.skip(!TALENT_SITE_FIXTURE_READY, "set TALENT_SITE_E2E_FIXTURE_READY=1 after seed.ts");

  for (const entry of ENTRY_POINTS) {
    test(`${entry.name}`, async ({ page, context }) => {
      await signIn(page, HOSTS[0]);
      await signIn(page, HOSTS[1]);
      await spreadSessionAcrossScopes(context);
      await page.goto(`${HOSTS[0]}/`, { waitUntil: "domcontentloaded" });
      await plantBrowserSession(page);

      const signOut = page.waitForResponse(
        (r) => /\/auth\/(client-)?sign-out$/.test(new URL(r.url()).pathname) && r.request().method() === "POST",
      );
      await entry.run(page);
      const res = await signOut;
      expect(res.status()).toBe(303);
      expect(res.headers()["cache-control"] ?? "").toMatch(/no-store/);
      // The sign-out response must never carry a fresh (non-expiring) auth cookie.
      const minted = (await res.headersArray())
        .filter((h) => h.name.toLowerCase() === "set-cookie" && /^sb-/.test(h.value))
        .filter((h) => !/Max-Age=0/i.test(h.value));
      expect(minted.map((h) => h.value)).toEqual([]);
      await page.waitForLoadState("domcontentloaded");

      await assertSignedOutEverywhere(page, context);
    });
  }
});
