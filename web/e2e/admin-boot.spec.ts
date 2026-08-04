/**
 * Admin-boot gate — the anti-sev-1 spec.
 *
 * 2026-08-03: a module cycle (#971) crashed EVERY production /admin route at
 * chunk evaluation ("ReferenceError: Cannot access 'oo' before
 * initialization") while tsc, lint, `next build`, dev-server QA and PR CI
 * were all green — dev chunking evaluates modules in a different order, so
 * only a COMPILED server exposes the crash class. This spec exists to make
 * that class un-shippable: CI builds the app, starts `next start`, signs in,
 * and loads the admin shell + the Card Design studio, failing on any
 * module-evaluation error, chunk-load failure, or the global error boundary.
 *
 * MUST run against a compiled server (`next build` + `VERCEL_ENV=preview
 * next start`) — that is the whole point; `next dev` masks the failure mode.
 * The admin-boot workflow does exactly that. Locally:
 *
 *   cd web && npm run build
 *   VERCEL_ENV=preview npx next start -p 3000 &
 *   PLAYWRIGHT_SKIP_WEBSERVER=1 PLAYWRIGHT_USE_DEV_SIGNIN=1 \
 *     npx playwright test e2e/admin-boot.spec.ts --project=chromium
 *
 * Auth: the dev-signin route's passwordless branch for @impronta.test
 * accounts (needs SUPABASE_SERVICE_ROLE_KEY in the server env; the route is
 * enabled outside dev via VERCEL_ENV=preview).
 */

import { test, expect, type Page } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const ADMIN_EMAIL = process.env.ADMIN_BOOT_EMAIL ?? "qa-admin@impronta.test";
const ADMIN_HOME = "/impronta/admin";
const CARD_DESIGN = "/impronta/admin/website/card-design";

/** Error signatures that mean the client chunk graph is broken. */
const FATAL_PATTERNS = [
  /ReferenceError/i,
  /before initialization/i,
  /ChunkLoadError/i,
  /Loading chunk .* failed/i,
  /is not a function/i,
];

function collectFatalErrors(page: Page): string[] {
  const fatal: string[] = [];
  page.on("pageerror", (err) => {
    fatal.push(`pageerror: ${err.message}`);
  });
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    const text = msg.text();
    if (FATAL_PATTERNS.some((p) => p.test(text))) {
      fatal.push(`console.error: ${text.slice(0, 400)}`);
    }
  });
  return fatal;
}

test.describe("admin shell boots on a compiled server", () => {
  test("dev-signin → /impronta/admin + Card Design studio render without module-eval errors", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    const fatal = collectFatalErrors(page);

    // Passwordless dev-signin for @impronta.test, redirecting into the shell.
    await page.goto(
      `${BASE_URL}/api/dev/signin?email=${encodeURIComponent(ADMIN_EMAIL)}&next=${encodeURIComponent(ADMIN_HOME)}`,
      { waitUntil: "domcontentloaded" },
    );
    await expect(page).toHaveURL(new RegExp(`${ADMIN_HOME.replace(/\//g, "\\/")}`), {
      timeout: 30_000,
    });

    // The global error boundary is the sev-1 signature — never acceptable.
    await expect(
      page.getByText("Something went wrong", { exact: false }),
    ).toHaveCount(0);

    // A real shell landmark must hydrate (nav sidebar's Overview entry).
    await expect(page.getByText("Overview", { exact: false }).first()).toBeVisible({
      timeout: 45_000,
    });

    // The Card Design studio sits deep in the admin chunk graph — the exact
    // page the 2026-08-03 cycle killed. Soft-nav it and re-check.
    await page.goto(`${BASE_URL}${CARD_DESIGN}`, { waitUntil: "domcontentloaded" });
    await expect(
      page.getByText("Something went wrong", { exact: false }),
    ).toHaveCount(0, { timeout: 30_000 });
    await expect(page.getByText("Card Design", { exact: false }).first()).toBeVisible({
      timeout: 45_000,
    });

    expect(fatal, `fatal client errors:\n${fatal.join("\n")}`).toHaveLength(0);
  });
});
