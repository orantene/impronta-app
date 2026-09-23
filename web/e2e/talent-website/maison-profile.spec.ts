/**
 * Maison profile template — smoke journey.
 *
 * Covers the three things about this template that are cheap to break and
 * expensive to ship broken:
 *
 *   1. the catalogue actually renders as a tabbed menu,
 *   2. a service with a required option refuses to continue until one is
 *      chosen, and
 *   3. THE BOOKING PROMISE DEGRADES WITH THE SURFACE.
 *
 * (3) is the reason this file exists. `appointments-plan-policy` caps a free
 * talent at `request`, and `loadInstantBookEligibility` only arms on an agency
 * host, so an offering row that says `booking_mode: "instant"` can sit on a
 * surface that cannot confirm anything. The template steps the CTA text, the
 * dispatched event intent and the sheet's final button down together — and
 * this asserts BOTH the text and the intent, because a button that reads
 * "Enviar solicitud" while still emitting an instant-book intent is the same
 * lie one layer down, and a text-only assertion is exactly how that survives
 * review.
 *
 * Fixtures: imported from `./fixtures`, never hardcoded. This spec needs two
 * offering shapes the Q.3 seed does not create yet (see REQUIRED FIXTURES
 * below); until they exist each affected test SKIPS with a message naming what
 * is missing, rather than failing or silently passing.
 *
 * DEPENDENCY — READ BEFORE MERGING. This file imports `./fixtures`, which
 * lives on the QA-harness branch (Phase Q.3), not on main. Until that lands,
 * Playwright cannot even discover this spec ("Cannot find module './fixtures'"),
 * so THIS BRANCH MUST NOT MERGE AHEAD OF THE HARNESS. Verified in the other
 * direction: with fixtures.ts present, all four tests register.
 *
 * REQUIRED FIXTURES (proposed addition to seed.ts — not applied here, because
 * seed.ts belongs to the QA-harness work):
 * SEEDED as of 7a98d77a3 on the harness branch: `ensureMaisonCatalogue()`
 * creates both rows on every talent with `readiness.offering`, so they land on
 * `t_ready` — a talent_basic, agency-less profile, i.e. the surface that
 * cannot confirm. Both rows are booking_mode "instant" ON PURPOSE: seeded as
 * "request" there would be nothing to degrade from and test 3 would pass
 * vacuously.
 */

import { expect, test, type Page } from "@playwright/test";

import { talentFixture } from "./fixtures";

/**
 * Titles of the two seeded fixture offerings.
 *
 * These SHOULD be imported rather than restated — but the canonical constants
 * currently live in `seed.ts`, and importing that module from a spec would run
 * the seeder. At module scope seed.ts calls requireEnv() for the Supabase URL
 * and service-role key (throws when unset), asserts the target is a local
 * Supabase (throws when it is not), creates a service-role client, and then
 * calls main() — so `import { … } from "./seed"` either crashes test collection
 * or silently re-seeds the database as a side effect of listing tests.
 *
 * Restated here deliberately, with the values matching seed.ts exactly. The
 * fix is to move both constants into `fixtures.ts`, which exists precisely so
 * specs can import identities "without pulling in @supabase/supabase-js or any
 * server-only module" (its own header). Raised with the harness owner; this
 * comment goes when the constants move.
 */
const MAISON_OPTIONED_TITLE = "Maison QA — optioned service";
const MAISON_FIXED_TITLE = "Maison QA — fixed service";

const READY = talentFixture("t_ready");

/** The profile, forced onto this template regardless of the tenant's token. */
function maisonUrl(profileCode: string): string {
  return `/t/${profileCode}?template=maison`;
}

async function gotoMaison(page: Page, profileCode: string): Promise<void> {
  await page.goto(maisonUrl(profileCode));
  await expect(page.locator("main[data-profile-template='maison']")).toBeVisible();
}

/** Records every storefront event the page emits, so intent can be asserted. */
async function captureOfferingEvents(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as { __maisonEvents?: unknown[] };
    w.__maisonEvents = [];
    for (const name of [
      "tulala:offering-instant",
      "tulala:offering-slot",
      "tulala:offering-request",
    ]) {
      window.addEventListener(name, (e) => {
        const detail = (e as CustomEvent).detail as Record<string, unknown> | null;
        w.__maisonEvents!.push({ name, intent: detail?.intent ?? null, title: detail?.title ?? null });
      });
    }
  });
}

async function offeringEvents(page: Page) {
  return page.evaluate(
    () => (window as unknown as { __maisonEvents: { name: string; intent: string | null; title: string | null }[] }).__maisonEvents,
  );
}

async function rowFor(page: Page, title: string) {
  const row = page.locator(".mn-row", { hasText: title });
  if ((await row.count()) === 0) return null;
  // The row may sit under an inactive category tab.
  const panelHidden = await row.evaluate((el) => !!el.closest("[hidden]")).catch(() => false);
  if (panelHidden) return null;
  return row.first();
}

test.describe("Maison profile template", () => {
  test("renders the catalogue as a tabbed menu", async ({ page }) => {
    await gotoMaison(page, READY.profileCode);

    const services = page.locator("#servicios");
    await expect(services).toBeVisible();

    const tabs = page.locator(".mn-tabs .mn-tab");
    const tabCount = await tabs.count();
    // One published offering with no category yields no tabs at all; that is a
    // valid state and not this test's subject.
    test.skip(tabCount === 0, "no offering categories seeded on t_ready");

    // Exactly one tab is selected, and switching moves the selection.
    await expect(page.locator(".mn-tab[data-active='true']")).toHaveCount(1);

    if (tabCount > 1) {
      await tabs.nth(1).click();
      await expect(tabs.nth(1)).toHaveAttribute("data-active", "true");
      await expect(tabs.nth(0)).toHaveAttribute("data-active", "false");
    }

    // Every visible row states a price and offers exactly one action.
    const rows = page.locator(".mn-row");
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThan(0);
    for (let i = 0; i < rowCount; i += 1) {
      await expect(rows.nth(i).locator(".mn-row-action")).toHaveCount(1);
      await expect(rows.nth(i).locator(".mn-row-price")).toHaveCount(1);
    }
  });

  test("a required option blocks the booking sheet until it is chosen", async ({ page }) => {
    await gotoMaison(page, READY.profileCode);

    const row = await rowFor(page, MAISON_OPTIONED_TITLE);
    test.skip(row === null, `fixture "${MAISON_OPTIONED_TITLE}" not seeded — see REQUIRED FIXTURES`);

    // A service carrying options must invite a CHOICE, never a bare select.
    await expect(row!.locator(".mn-row-action")).toHaveText(/Elegir opciones|Choose options/);
    await row!.locator(".mn-row-action").click();

    // The sheet is the prototype harness's; the live profile mounts the real
    // one. Both consume the same event, so skip rather than fail when the
    // page under test has no sheet mounted.
    const sheet = page.locator(".jb-sheet");
    test.skip((await sheet.count()) === 0, "no booking sheet mounted on this surface");

    const cta = sheet.locator(".jb-cta");
    await expect(cta).toBeDisabled();
    await expect(cta).toHaveText(/Elegí una opción|Choose an option/);

    await sheet.locator(".jb-opt").first().click();
    await expect(cta).toBeEnabled();
    await expect(cta).toHaveText(/Continuar|Continue/);
  });

  test("the booking promise degrades when the surface cannot confirm", async ({ page }) => {
    await captureOfferingEvents(page);
    await gotoMaison(page, READY.profileCode);

    const row = await rowFor(page, MAISON_FIXED_TITLE);
    test.skip(row === null, `fixture "${MAISON_FIXED_TITLE}" not seeded — see REQUIRED FIXTURES`);

    // t_ready is talent_basic with no agency, so this surface cannot confirm
    // on the spot even though the offering row says booking_mode "instant".
    await row!.locator(".mn-row-action").click();

    // ASSERTION 1 — the dispatched INTENT degraded. This is the one that
    // matters most: it is what the booking engine would act on.
    const events = await offeringEvents(page);
    // Named explicitly: a click that dispatches nothing at all is its own
    // defect, and without this the next line fails as a type error instead.
    expect(
      events.length,
      "the row action dispatched no storefront event at all",
    ).toBeGreaterThan(0);
    const last = events[events.length - 1]!;
    expect(
      last.intent,
      "a surface that cannot confirm must not emit an instant-book intent",
    ).toBe("request");
    expect(last.name).not.toBe("tulala:offering-instant");

    // ASSERTION 2 — and the words the visitor reads degraded with it.
    const sheet = page.locator(".jb-sheet");
    test.skip((await sheet.count()) === 0, "no booking sheet mounted on this surface");
    await expect(sheet.locator(".jb-cta")).toHaveText(/Enviar solicitud|Send request/);
    await expect(page.locator(".mn-lead")).toContainText(
      /sujetas a confirmación|subject to confirmation/,
    );
  });

  test("hides every section whose data is absent", async ({ page }) => {
    // t_incomplete has no catalogue, no gallery and a thin profile: the page
    // must still render as a complete page rather than a skeleton of headings.
    const incomplete = talentFixture("t_incomplete");
    await gotoMaison(page, incomplete.profileCode);

    await expect(page.locator("main[data-profile-template='maison']")).toBeVisible();
    await expect(page.locator("h1")).toHaveCount(1);

    // No empty section headings left stranded.
    for (const id of ["#resultados", "#tu-cita", "#preguntas"]) {
      const section = page.locator(id);
      if ((await section.count()) > 0) {
        await expect(section).not.toBeEmpty();
      }
    }
  });
});
