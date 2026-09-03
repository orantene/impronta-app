/**
 * Does a public page survive HYDRATION, or does the error boundary eat it?
 *
 *   cd web && npm run test:e2e:hydration
 *   PLAYWRIGHT_BASE_URL=https://tulala.digital npm run test:e2e:hydration
 *
 * ─── WHY THIS EXISTS AND WHY NOTHING ELSE COULD CATCH IT ────────────────────
 *
 * SEV-1, 2026-09-03. `(marketing)` mounted no `DirectoryInquiryModalProvider`
 * while pages in that group rendered `AgencyChatLauncherMount` ->
 * `DirectoryInquiryUrlSync` -> `useDirectoryInquiryModal`. The hook threw on
 * hydration and the error boundary painted
 *
 *     "Something went wrong. Please try again. If this keeps happening,
 *      the agency may need to check configuration."
 *
 * over a page whose HTML had already been delivered correctly. Every
 * path-based tenant storefront (`/w/<slug>`) resolves through that group.
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
 * tenant, 2 of 4 on another. The likeliest explanation is content-dependence
 * (whether a given tenant's rendered tree contains a hook consumer) rather than
 * randomness, which would make it deterministic per page. But a guard that
 * assumes that and is wrong is a guard that passes on a coin flip, so each page
 * is loaded LOAD_COUNT times and every load must be clean. Cheap insurance
 * against the diagnosis being wrong.
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

for (const path of PATHS) {
  test(`${path} survives hydration on ${LOAD_COUNT} consecutive loads`, async ({
    page,
  }) => {
    for (let attempt = 1; attempt <= LOAD_COUNT; attempt += 1) {
      const seen = capture(page);

      // A cache-busting param per attempt: two identical loads can be served
      // from the bfcache without re-hydrating, which would make repeated loads
      // measure one hydration and report false confidence.
      const url = `${BASE}${path}${path.includes("?") ? "&" : "?"}__hydration_probe=${attempt}`;
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
