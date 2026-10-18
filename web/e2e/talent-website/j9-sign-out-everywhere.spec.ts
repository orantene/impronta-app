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
import { expect, test, type BrowserContext, type Page, type Response } from "@playwright/test";

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

/**
 * Whether a sign-out answered on `signOutOrigin` can expire cookies held for
 * `origin`. A browser only accepts a Set-Cookie for the response host or a
 * parent Domain of it, so `localhost` can never expire `acme.lvh.me` or
 * `.lvh.me` cookies (fixture-vs-product: production's equivalent is
 * app.tulala.digital expiring `.tulala.digital`, which the sweep does and
 * cookie-domain.test.ts pins). Two origins share a sweep scope only when they
 * are the same host or both sit under the shared `.lvh.me` parent.
 */
function sweepReaches(signOutOrigin: string, origin: string): boolean {
  const a = new URL(signOutOrigin).hostname;
  const b = new URL(origin).hostname;
  if (a === b) return true;
  const shared = (h: string) => (h === "lvh.me" || h.endsWith(".lvh.me") ? ".lvh.me" : undefined);
  return shared(a) !== undefined && shared(a) === shared(b);
}

async function assertSignedOutEverywhere(page: Page, context: BrowserContext, checkStorage: boolean) {
  // Every entry point signs out on HOSTS[0] (localhost).
  for (const origin of HOSTS.filter((o) => sweepReaches(HOSTS[0], o))) {
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
const ENTRY_POINTS: { name: string; clientJs: boolean; run: (page: Page, arm: () => void) => Promise<void> }[] = [
  {
    // SignOutForm (headers, account menus, admin bars, marketing header).
    name: "declarative SignOutForm POST /auth/sign-out",
    clientJs: false,
    run: async (page, arm) => {
      arm();
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
    run: async (page, arm) => {
      arm();
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
    run: async (page, arm) => {
      await gotoSettled(page, `${HOSTS[0]}/account`);
      // The product's account menu renders "Sign out" as role="menuitem" (IdentityBar-2
      // AccountMenuItem), which a role=button locator never matches; a plain button elsewhere
      // is also accepted. Matching only buttons made this spec "pass by skipping".
      const LOG_OUT = /^(log out|sign out|cerrar sesi[oó]n)$/i;
      const target = page
        .getByRole("button", { name: LOG_OUT })
        .or(page.getByRole("menuitem", { name: LOG_OUT }))
        .first();
      await target.waitFor({ state: "attached", timeout: 10_000 }).catch(() => {});
      if ((await target.count()) === 0) {
        await gotoSettled(page, `${HOSTS[0]}/`);
        const menu = page.getByRole("button", { name: /open account menu|abrir men[uú] de cuenta/i }).first();
        await menu.waitFor({ state: "visible", timeout: 30_000 });
        // Open the menu and wait for the control. The first click can land before React attaches
        // its handler, so retry, but never click a menu that is already open (it would close it).
        try {
          await expect(async () => {
            if ((await menu.getAttribute("aria-expanded")) !== "true") await menu.click();
            await expect(target).toBeVisible({ timeout: 4_000 });
          }).toPass({ timeout: 20_000 });
        } catch {
          // The skip above the describe already covers a fixture that is not ready, so reaching
          // here means a race or a real regression: fail loudly, never skip.
          throw new Error(
            "TALENT_SITE_E2E_FIXTURE_READY is set but no Log out / Sign out control (button or menuitem) " +
              "appeared within 20 s of opening the account menu on the signed-in landing page",
          );
        }
      }
      // Hydration: the control is in the SSR HTML before React attaches its handler, and a click
      // in that window submits nothing. Wait until it is visible and enabled, and the page has
      // finished loading, then arm the response wait and click.
      await target.waitFor({ state: "visible", timeout: 30_000 });
      await expect(target).toBeEnabled({ timeout: 30_000 });
      await page.waitForLoadState("load");
      arm();
      await target.click();
    },
  },
];

test.describe("S1 sign-out ends the session on every subdomain", () => {
  test.skip(!TALENT_SITE_FIXTURE_READY, "set TALENT_SITE_E2E_FIXTURE_READY=1 after seed.ts");

  // Warm the routes the entries touch. `next dev` (Turbopack) compiles a route on its first
  // request: /talent/today 10-24 s, /account ~16 s, / ~12 s in CI. Doing that inside a test
  // starves every timeout it owns and made the first attempt of the last entry fail while its
  // (warm) retry passed. One signed-in pass over the same URLs, outside any test budget.
  test.beforeAll(async ({ browser }) => {
    test.setTimeout(240_000);
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await signIn(page, HOSTS[0]);
      for (const path of ["/talent/today", "/account", "/", "/auth/sign-out"]) {
        await page.request
          .get(`${HOSTS[0]}${path}`, { maxRedirects: 0, timeout: 90_000 })
          .catch(() => undefined); // a 307/405 or an aborted stream still means the route compiled
      }
    } finally {
      await context.close();
    }
  });

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

      // The 60 s response budget is armed by the entry itself, immediately before the click /
      // submit that sends the POST. It used to be armed before `entry.run`, so the "visible Log
      // out control" entry (goto /account, goto /, open menu) spent it on cold dev-server
      // compiles (/account ~16 s, / ~12 s, /talent/today ~10-24 s) and timed out before the click
      // ever happened (CI run 39148329994, first attempt; the retry, warm, passed).
      let signOut: Promise<Response> | undefined;
      const arm = () => {
        signOut = page.waitForResponse(
          (r) => /\/auth\/(client-)?sign-out$/.test(new URL(r.url()).pathname) && r.request().method() === "POST",
          { timeout: 60_000 },
        );
      };
      await entry.run(page, arm);
      expect(signOut, "the entry armed the sign-out response wait before its click").toBeDefined();
      const res = await signOut!;
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
