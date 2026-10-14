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
 * asserts the session cookie is present (no navigation).
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
  // No navigation here: the acme.lvh.me root redirects cross-host, which the
  // browser reports as net::ERR_ABORTED. The Set-Cookie on the 307 already
  // landed in the shared jar, so assert the session cookie directly.
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

async function assertSignedOutEverywhere(page: Page, context: BrowserContext, checkStorage: boolean) {
  for (const origin of HOSTS) {
    await page.goto(`${origin}/login`, { waitUntil: "domcontentloaded" });
    await page.reload({ waitUntil: "domcontentloaded" });
    const left = (await context.cookies(origin)).filter((c) => AUTH_RE.test(c.name));
    expect(left.map((c) => `${c.name}@${c.domain}`), `auth cookies left on ${origin}`).toEqual([]);
    const stored = await page.evaluate(() =>
      [...Object.keys(localStorage), ...Object.keys(sessionStorage)].filter((k) => k.startsWith("sb-")),
    );
    if (checkStorage && origin === HOSTS[0]) expect(stored, "browser Supabase session cleared").toEqual([]);
    // /account must not render a signed-in page after sign-out.
    await gotoSettled(page, `${origin}/account`);
    await expect(page.getByText(new RegExp(FX.email, "i"))).toHaveCount(0);
  }
}

/**
 * Navigate and wait for the page to settle. Signed-in pages such as `/`,
 * `/talent` and `/account` render a loading shell and then redirect on the
 * client, so a plain `page.goto` reports net::ERR_ABORTED (the RSC stream is
 * cancelled; the `transformAlgorithm` TypeError in the server log is that
 * cancellation). Commit the navigation, tolerate the abort, then wait until
 * the URL stops changing so no pending client redirect can cancel the next
 * step (that race swallowed the sign-out form POST).
 */
async function gotoSettled(page: Page, url: string) {
  try {
    await page.goto(url, { waitUntil: "commit" });
  } catch (err) {
    if (!/ERR_ABORTED|interrupted by another navigation/i.test(String(err))) throw err;
  }
  let last = "";
  let stableSince = Date.now();
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    await page.waitForLoadState("domcontentloaded").catch(() => {});
    const now = page.url();
    if (now !== last) {
      last = now;
      stableSince = Date.now();
    } else if (Date.now() - stableSince >= 1500) {
      return;
    }
    await page.waitForTimeout(250);
  }
}

/** Each Log out entry point, driven the way the product drives it. */
//
// `clientJs`: whether the entry runs the product's browser-side cleanup
// (`clearBrowserAuthState`, called by SignOutForm onSubmit and by
// signOutEverywhere). The two synthetic-form entries below POST straight to
// the route to pin the SERVER contract (303, no-store, every cookie scope
// expired, nothing re-minted) and never run that JS. Browser storage is not
// something a server response can clear here: the route sends only
// Clear-Site-Data "cache", and Clear-Site-Data needs a secure context anyway
// (http://*.lvh.me is not one). So the localStorage/sessionStorage
// `sb-*` assertion applies only where the product's real control runs.
// The helper's storage sweep is pinned by
// src/lib/auth/sign-out-root-cause.security.test.ts.
const ENTRY_POINTS: { name: string; clientJs: boolean; run: (page: Page) => Promise<void> }[] = [
  {
    // SignOutForm (headers, account menus, admin bars, marketing header).
    name: "declarative SignOutForm POST /auth/sign-out",
    clientJs: false,
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
    clientJs: false,
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
    clientJs: true,
    run: async (page) => {
      await gotoSettled(page, `${HOSTS[0]}/account`);
      const control = page
        .getByRole("button", { name: /^(log out|sign out|cerrar sesi[oó]n)$/i })
        .first();
      await control.waitFor({ state: "attached", timeout: 10_000 }).catch(() => {});
      if ((await control.count()) === 0) {
        await gotoSettled(page, `${HOSTS[0]}/`);
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
      // Cold dev-server compiles of /auth/sign-out and the talent shell alone
      // took ~25s in CI; the default 30s budget timed out before any assert.
      test.setTimeout(150_000);
      await signIn(page, HOSTS[0]);
      await signIn(page, HOSTS[1]);
      await spreadSessionAcrossScopes(context);
      // Settle on the signed-in landing page first: `/` redirects to /talent and
      // then client-side to /talent/today, and a late client redirect cancelled
      // the sign-out form navigation (POST never surfaced as a response).
      await gotoSettled(page, `${HOSTS[0]}/`);
      // CI trace (run 38640120408): gotoSettled returned on the /talent loading
      // shell (URL stable 1.5s while /talent/today compiled); its client
      // redirect fired 66ms after the form submit and cancelled the POST.
      // Wait for the final landing page itself, rendered, before signing out.
      await page.waitForURL(/\/talent\/today(?:[?#]|$)/, { timeout: 60_000 });
      await page.waitForLoadState("load");
      await expect(page.getByRole("button", { name: /open account menu/i })).toBeVisible({
        timeout: 60_000,
      });
      if (entry.clientJs) await plantBrowserSession(page);

      const signOut = page.waitForResponse(
        (r) => /\/auth\/(client-)?sign-out$/.test(new URL(r.url()).pathname) && r.request().method() === "POST",
        { timeout: 60_000 },
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

      await assertSignedOutEverywhere(page, context, entry.clientJs);
    });
  }
});
