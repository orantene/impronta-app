/**
 * Every listed profile must be REACHABLE, and the location facets must not
 * split one place into two buckets.
 *
 *   cd web && npx playwright test e2e/directory-reachability.spec.ts
 *   PLAYWRIGHT_BASE_URL=https://tulala.digital npx playwright test e2e/directory-reachability.spec.ts
 *
 * ─── WHY THIS EXISTS: I RAISED A FALSE P0 ───────────────────────────────────
 *
 * On 2026-09-05 I reported that /global-directory promised "53 profiles",
 * rendered 24, and had no way to reach the other 29. It was escalated as the
 * largest guest-visible loss on the platform. IT WAS FALSE. A "Show more
 * (29 left)" button was on the page the whole time, visible and working: two
 * clicks take the grid 24 -> 48 -> 53.
 *
 * How I produced that error, because the shape is the reusable part:
 *
 *   page.locator("button").filter({ hasText: /load more|show more|next/i }).first()
 *
 * `/next/i` matched "Open in the next 30 days" — an availability filter
 * checkbox — and `.first()` returned THAT element. I read its label, concluded
 * no pagination control existed, then "confirmed" it by scrolling for infinite
 * load that this page correctly does not use. Two checks agreeing, both
 * pointed at the wrong element.
 *
 * So this test asserts the OUTCOME a visitor cares about — can I reach every
 * profile the header promises — rather than the presence of any particular
 * control. A future redesign may replace the button with infinite scroll or
 * numbered pages, and this test should keep passing without edits. It also
 * fails loudly if the real defect ever appears, which is the thing my manual
 * pass could not do reliably.
 */

import { test, expect, type Page } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL?.replace(/\/$/, "") ?? "https://tulala.digital";

/** The count the page promises, from its own header. */
async function headerCount(page: Page): Promise<number> {
  const txt = await page.evaluate(() => document.body.innerText);
  const m = txt.match(/([\d,]+)\s+profiles?/);
  return m ? Number(m[1].replace(/,/g, "")) : NaN;
}

/** Distinct profiles actually reachable in the DOM. */
async function renderedCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Set(
        [...document.querySelectorAll('a[href^="/t/"]')].map((a) =>
          a.getAttribute("href"),
        ),
      ).size,
  );
}

/**
 * Exhaust whatever paging mechanism the page uses.
 *
 * Deliberately mechanism-agnostic: click any control whose accessible name
 * looks like "show/load more", and also scroll, so infinite-scroll or a
 * different control still satisfies it. Bounded so a broken control that never
 * advances the count fails fast instead of looping.
 */
async function exhaustPaging(page: Page): Promise<void> {
  for (let i = 0; i < 12; i += 1) {
    const before = await renderedCount(page);

    // Anchored to the START of the accessible name so it cannot match an
    // unrelated control that merely CONTAINS one of these words — the exact
    // mistake that produced the false report this file documents.
    const more = page.getByRole("button", { name: /^(show|load) more\b/i });
    if (await more.count()) {
      await more.first().scrollIntoViewIfNeeded();
      await more.first().click();
    } else {
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    }

    // TERMINATE ON THE COUNT, NEVER ON THE CONTROL'S PRESENCE.
    //
    // Two ways of ending this loop are wrong, and I wrote both before landing
    // here. A fixed sleep ends it early because the next page can take longer
    // than the sleep, and "count unchanged" then reads as "nothing more
    // exists". Watching the button is worse: it DETACHES transiently while
    // React re-renders, so a mid-render read says "no control, we're done"
    // while 29 profiles are still unloaded.
    //
    // Growth of the rendered set is the only signal that means what it says.
    // If it does not grow within a generous window we are exhausted — whether
    // because everything is loaded or because the control is broken — and the
    // assertion in the test, not this loop, decides which of those it was.
    try {
      await expect
        .poll(async () => renderedCount(page), { timeout: 20_000, intervals: [500] })
        .toBeGreaterThan(before);
    } catch {
      return;
    }
  }
}

test("every profile the header promises is reachable", async ({ page }) => {
  // Exhausting paging is several round trips against a live site; the 30s
  // default is not enough and a timeout here would read as the defect.
  test.setTimeout(180_000);
  await page.goto(`${BASE}/global-directory`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  const promised = await headerCount(page);
  expect(promised, "the header must state a profile count").toBeGreaterThan(0);

  const firstPage = await renderedCount(page);
  expect(firstPage, "the first page must render something").toBeGreaterThan(0);

  await exhaustPaging(page);

  const reachable = await renderedCount(page);
  expect(
    reachable,
    `the directory promises ${promised} profiles but only ${reachable} are ` +
      `reachable after exhausting paging. ${promised - reachable} talent who ` +
      `chose to be listed cannot be seen by any guest.`,
  ).toBe(promised);
});

test("filtering by an accented country returns the same rows as the plain spelling", async ({
  page,
}) => {
  test.setTimeout(120_000);
  // Production carried "Mexico" (41), "mexico" (2) and "México" (4) as free
  // text. The facet key folded case but not diacritics and the filter used an
  // accent-sensitive .ilike(), so ?country=Mexico returned 43 and
  // ?country=México returned 4 — disjoint sets, one place.
  const counts: Record<string, number> = {};
  for (const spelling of ["Mexico", "México", "mexico"]) {
    await page.goto(
      `${BASE}/global-directory?country=${encodeURIComponent(spelling)}`,
      { waitUntil: "networkidle" },
    );
    await page.waitForTimeout(2500);
    counts[spelling] = await headerCount(page);
  }
  expect(
    counts["México"],
    `?country=México returned ${counts["México"]} and ?country=Mexico returned ` +
      `${counts["Mexico"]}. One place must be one bucket.`,
  ).toBe(counts["Mexico"]);
  expect(counts["mexico"]).toBe(counts["Mexico"]);
});

test("no city is offered under a country it is not in", async ({ page }) => {
  await page.goto(`${BASE}/global-directory`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);
  const txt = await page.evaluate(() => document.body.innerText);

  // "Buenos Aires, Mexico" was live on 2026-09-05: the city label was composed
  // from two INDEPENDENT free-text fields, so a wrong pair rendered as
  // confidently as a right one.
  expect(
    txt,
    "a city facet is pairing a city with a country it is not in",
  ).not.toMatch(/Buenos Aires,\s*M[eé]xico/i);
});
