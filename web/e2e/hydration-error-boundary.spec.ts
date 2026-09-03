/**
 * Does a public page survive HYDRATION, or does the error boundary eat it?
 *
 *   cd web && npm run test:e2e:hydration
 *   PLAYWRIGHT_BASE_URL=https://tulala.digital npm run test:e2e:hydration
 *
 * ─── WHY THIS EXISTS AND WHY NOTHING ELSE COULD CATCH IT ────────────────────
 *
 * SEV-1, 2026-09-03. TWO separate defects, both `useDirectoryInquiryModal`
 * thrown from a consumer with no provider above it, on two different routes:
 *
 *   1. `(marketing)` mounted no `DirectoryInquiryModalProvider` while pages in
 *      that group rendered `AgencyChatLauncherMount` -> `DirectoryInquiryUrlSync`
 *      -> the hook. That killed `/global-directory`.
 *
 *   2. `agency-home-storefront.tsx` had `AgencyChatLauncherMount` FOUR LINES
 *      BELOW the provider's closing tag, outside its subtree. That killed every
 *      tenant storefront, which is what `/w/<slug>` actually renders — the proxy
 *      strips the prefix and serves the ROOT `app/page.tsx`, not `(marketing)`.
 *
 * Both painted "Something went wrong… the agency may need to check
 * configuration" over HTML that had already been delivered correctly.
 *
 * The server response was PERFECT throughout: HTTP 200, correct SEO title, up
 * to 2.7 MB of correct markup. So:
 *
 *   curl              passed
 *   deploy:smoke      passed
 *   CI                passed
 *   a JS-less crawler saw a perfect page and indexed it
 *
 * The only observer that ever saw the failure was a human with a browser. That
 * is the entire reason this test executes the page instead of reading a
 * response, and it is why no amount of hardening `deploy:smoke` would have
 * helped: a 200 with a correct body IS the symptom.
 *
 * ─── WHY IT LOADS EACH PAGE MORE THAN ONCE ──────────────────────────────────
 *
 * The failure looked intermittent when first sampled: 3 of 3 loads on one
 * tenant, 2 of 4 on another. It was not intermittent. TWO DISTINCT ROUTES WERE
 * FAILING FOR TWO DISTINCT REASONS and the sample mixed them, which is what
 * randomness looks like from the outside. Content-dependence was offered as an
 * explanation and then withdrawn once the second cause was found in source.
 *
 * Repeated loads are kept anyway. They cost nothing, and the reason to keep
 * them is exactly the reason the first explanation was wrong: a guard built on
 * a diagnosis, rather than on the symptom, fails the moment the diagnosis does.
 *
 * ─── NOT A CI GATE ──────────────────────────────────────────────────────────
 *
 * e2e is deliberately not in the CI lane set (see reference_ci_lane_parity), so
 * this is an OPERATOR check in the `deploy:smoke` family: run it after a
 * deploy, and whenever a route group's provider set changes. Wiring it into CI
 * would need a browser in the structural lane, which is a separate decision.
 */

import { test, expect, type Page } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL?.replace(/\/$/, "") ?? "https://tulala.digital";

/** Every load must be clean; see "why more than once" above. */
const LOAD_COUNT = 3;

/**
 * Public surfaces that must survive hydration.
 *
 * The two `/w/` entries are the reproduction cases from the incident and are
 * the reason the fixture tenants `ines-oussaifi-studio` and `travelpathshuttle`
 * are held back from deletion. If they are ever retired, replace them with two
 * other path-based tenants rather than dropping the coverage — a path-based
 * storefront is the shape that broke.
 */
const PATHS = [
  "/global-directory",
  "/w/ines-oussaifi-studio",
  "/w/travelpathshuttle",
];

/**
 * Host-based tenants, checked on their own origin.
 *
 * Added because assuming a host-based tenant was unaffected is precisely the
 * error that made the first diagnosis half-right: `/global-directory` and
 * `/w/<slug>` turned out to fail for two DIFFERENT reasons, and a sample that
 * mixed them looked like flakiness. `improntamodels.com` renders the same
 * `AgencyHomeStorefront` component that carried the second bug, so it gets
 * measured rather than reasoned about.
 */
const ABSOLUTE_URLS = ["https://improntamodels.com/"];

/** Copy the error boundary renders. Matching the heading is enough. */
const ERROR_BOUNDARY_TEXT = /something went wrong|nos topamos con un obst/i;

type Captured = { consoleErrors: string[]; pageErrors: string[] };

function capture(page: Page): Captured {
  const out: Captured = { consoleErrors: [], pageErrors: [] };
  page.on("console", (msg) => {
    if (msg.type() === "error") out.consoleErrors.push(msg.text());
  });
  page.on("pageerror", (err) => out.pageErrors.push(err.message));
  return out;
}

for (const target of [...PATHS, ...ABSOLUTE_URLS]) {
  test(`${target} survives hydration on ${LOAD_COUNT} consecutive loads`, async ({
    page,
  }) => {
    const isAbsolute = /^https?:\/\//.test(target);
    const path = target;
    for (let attempt = 1; attempt <= LOAD_COUNT; attempt += 1) {
      const seen = capture(page);

      // A cache-busting param per attempt: two identical loads can be served
      // from the bfcache without re-hydrating, which would make repeated loads
      // measure one hydration and report false confidence.
      const base = isAbsolute ? target : `${BASE}${path}`;
      const url = `${base}${base.includes("?") ? "&" : "?"}__hydration_probe=${attempt}`;
      const response = await page.goto(url, { waitUntil: "networkidle" });

      expect(
        response?.status(),
        `${path} attempt ${attempt}: server response`,
      ).toBeLessThan(400);

      // THE ASSERTION THAT MATTERS. The boundary replaces the page content, so
      // its heading being visible means the page is dead regardless of status.
      await expect(
        page.getByText(ERROR_BOUNDARY_TEXT).first(),
        `${path} attempt ${attempt}: the error boundary painted over a page ` +
          `the server rendered correctly. Console: ${seen.consoleErrors.join(" | ") || "(none)"}`,
      ).toBeHidden();

      // A provider-missing throw surfaces as a page error even when the
      // boundary swallows it, so assert on it directly too: it names the cause
      // where the boundary only shows an apology.
      const providerThrow = [...seen.consoleErrors, ...seen.pageErrors].filter((m) =>
        /must be used within/i.test(m),
      );
      expect(
        providerThrow,
        `${path} attempt ${attempt}: a React context provider is missing above ` +
          `a consumer on this route. This is the SEV-1 shape: the server ` +
          `response is fine and only a browser can see it.`,
      ).toEqual([]);
    }
  });
}
