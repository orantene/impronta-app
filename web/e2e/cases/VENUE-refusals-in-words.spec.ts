/**
 * VENUE, the floor and the kitchen refuse in SENTENCES, in every language.
 *
 * Both screens are handed a CODE by their server actions (`party_too_large`,
 * `invalid_state`) and never a sentence, that is deliberate, so the words can
 * be the workspace's own language rather than the engine author's. A unit test
 * proves the catalog has an entry for every code. Only a run proves the SCREEN
 * reaches for it, and this file is that run: it makes each screen refuse for
 * real and reads the red box, once per language the platform serves.
 *
 * THE KITCHEN'S REFUSAL IS MADE BY TWO STATIONS, not by editing a row. One tab
 * acknowledges the ticket; the other is still showing the Acknowledge button
 * and taps it. That is a pass with two screens on a Saturday, and it is the
 * only route to `invalid_state` that goes through the interface.
 *
 * A REFUSAL IS ASSERTED TWICE. `refusalText` answers with the GENERIC sentence
 * for a code it does not recognise, so "it is not a raw token" and "it is the
 * right words" are two different failures and both have to be checked. The
 * expected sentences are written out here rather than read from the catalog:
 * a test that reads its expectation from the same file the screen reads
 * cannot notice the two of them pointing at the wrong key together.
 *
 * WHICH LANGUAGES. On a workspace host the languages a screen can render in
 * are the WORKSPACE's published locales (`agency_business_identity.
 * supported_locales`), narrowed onto the platform's public list: the proxy
 * overlays them (`withTenantLanguageSettings`) and a cookie naming any other
 * language falls back to the default. The platform allow-list is `en` and
 * `es` (`PLATFORM_LOCALES`, and a CHECK constraint on the same column), and
 * French was retired by the owner on 2026-08-16. So a browser on this host
 * can be served two languages, and this file walks both. The French sentences
 * ship in the catalog and are proven through the screens' own render in
 * `lib/visits/restaurant-screens.render.test.ts`; putting them in front of a
 * browser would mean reopening that decision, which no test may do.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  test,
  expect,
  prepareJourneysPage,
  signInJourneysStaff,
  skipUnlessFixture,
  assertWorkspaceIdentity,
} from "./_harness";
import { isolatedService, JOURNEYS_TENANT_ID } from "./_isolated-db";
import { releaseVenueJourneyParty } from "./_venue-db";

skipUnlessFixture();

test.use({ timezoneId: "Asia/Tokyo" });

/** The sentence the floor must show when the engine refuses `party_too_large`. */
const FLOOR_PARTY_TOO_LARGE: Record<string, string> = {
  en: "This party is larger than the table allows.",
  es: "Este grupo es más grande de lo que permite la mesa.",
  fr: "Ce groupe est plus grand que ce que la table permet.",
};

/** The sentence the station board must show when the engine refuses `invalid_state`. */
const KITCHEN_INVALID_STATE: Record<string, string> = {
  en: "That ticket is not at a step where this is possible. Reload the board.",
  es: "Ese ticket no está en un paso donde esto sea posible. Recarga el tablero.",
  fr: "Ce ticket n'est pas à une étape où cela est possible. Rechargez le tableau.",
};

type Catalog = Record<string, string>;

/** The labels a person taps, in the language under test. Read from the shipped catalog. */
function labels(locale: string): Catalog {
  const raw = JSON.parse(
    readFileSync(resolve(process.cwd(), "messages", `${locale}.json`), "utf8"),
  ) as Record<string, unknown>;
  const dashboard = (raw.dashboard ?? {}) as Record<string, Record<string, string>>;
  return {
    tablesTitle: dashboard.tables!.pageTitle!,
    seatParty: dashboard.tables!.seatParty!,
    partySizeLabel: dashboard.tables!.partySizeLabel!,
    confirmSeat: dashboard.tables!.confirmSeat!,
    prepTitle: dashboard.preparation!.pageTitle!,
    acknowledge: dashboard.preparation!.acknowledge!,
    statusAcknowledged: dashboard.preparation!.statusAcknowledged!,
    tabQueued: dashboard.preparation!.tabQueued!,
    tabPreparing: dashboard.preparation!.tabPreparing!,
    destination: dashboard.preparation!.destination!,
    destinationCounter: dashboard.preparation!.destinationCounter!,
  };
}

/**
 * Which languages THIS WORKSPACE's screens can actually render in, asked of
 * the database rather than assumed: the workspace's published locales, kept
 * only where the platform serves them publicly. A locale outside that set
 * renders the default language, and a loop that assumed three would then
 * "pass" by reading the same English screen three times.
 */
async function servedLocales(): Promise<string[]> {
  const sb = isolatedService();
  const { data: platform, error: platformErr } = await sb
    .from("app_locales")
    .select("code, enabled_public, archived_at")
    .order("sort_order", { ascending: true });
  if (platformErr) throw new Error(platformErr.message);
  const publicCodes = (platform ?? [])
    .filter((row) => row.enabled_public === true && row.archived_at === null)
    .map((row) => String(row.code));

  const { data: identity, error: identityErr } = await sb
    .from("agency_business_identity")
    .select("supported_locales")
    .eq("tenant_id", JOURNEYS_TENANT_ID)
    .maybeSingle();
  if (identityErr) throw new Error(identityErr.message);
  const published = Array.isArray(identity?.supported_locales)
    ? (identity.supported_locales as unknown[]).map(String)
    : [];
  return publicCodes.filter((code) => published.includes(code));
}

test.beforeEach(async ({ page }) => {
  await prepareJourneysPage(page);
});

test.afterEach(async () => {
  await releaseVenueJourneyParty();
});

test("VENUE-WORDS floor: a party that will not fit is refused in a sentence, in every language served", async ({
  page,
}, testInfo) => {
  test.setTimeout(300_000);

  const locales = await servedLocales();
  // Every language this host can serve is walked, and a fixture serving only
  // its default would make the loop below prove nothing about translation.
  expect(locales, "the workspace must publish more than its default language").toEqual(
    expect.arrayContaining(["en", "es"]),
  );
  for (const locale of locales) {
    expect(FLOOR_PARTY_TOO_LARGE[locale], `no expected sentence for ${locale}`).toBeTruthy();
    expect(KITCHEN_INVALID_STATE[locale], `no expected sentence for ${locale}`).toBeTruthy();
  }

  await signInJourneysStaff(page, "/admin/tables");
  await assertWorkspaceIdentity(page);
  const origin = new URL(page.url()).origin;

  for (const locale of locales) {
    const copy = labels(locale);
    await page.context().addCookies([{ name: "locale", value: locale, url: origin }]);
    await page.goto("/admin/tables");
    // The page is genuinely in this language before anything is asserted about
    // its refusal, otherwise a locale that quietly fell back to English would
    // pass three times over.
    await expect(
      page.getByRole("heading", { level: 1 }),
      `the floor must render in ${locale}`,
    ).toHaveText(copy.tablesTitle);

    const twoTop = page.locator("li").filter({ has: page.getByText("T2", { exact: true }) }).first();
    await expect(twoTop).toBeVisible({ timeout: 30_000 });
    await twoTop.getByRole("button", { name: copy.seatParty, exact: true }).click();
    const party = twoTop.getByLabel(copy.partySizeLabel);
    await expect(party).toBeVisible();
    // Six is past the combination's ceiling too (T2 + T3 seats three to four),
    // so this refusal has no join to offer and cannot be mistaken for one.
    await party.fill("6");
    await twoTop.getByRole("button", { name: copy.confirmSeat, exact: true }).click();

    const banner = page.locator("p.text-destructive").first();
    await expect(banner, `the floor must refuse in ${locale}`).toBeVisible({ timeout: 30_000 });
    await expect(banner).toHaveText(FLOOR_PARTY_TOO_LARGE[locale]!);
    await expect(
      banner,
      "a code in a red box is the failure this screen exists to prevent",
    ).not.toContainText(/party_too_large|not_allowed|invalid|unavailable/);

    await page.screenshot({
      path: testInfo.outputPath(`floor-refusal-${locale}.png`),
      fullPage: true,
    });
  }
});

test("VENUE-WORDS kitchen: a ticket another station already took is refused in a sentence, in every language served", async ({
  page,
  browser,
}, testInfo) => {
  test.setTimeout(300_000);

  const locales = await servedLocales();
  expect(locales, "the workspace must publish more than its default language").toEqual(
    expect.arrayContaining(["en", "es"]),
  );
  await signInJourneysStaff(page, "/admin/pos?mode=counter");
  await assertWorkspaceIdentity(page);
  const origin = new URL(page.url()).origin;

  for (const locale of locales) {
    const copy = labels(locale);

    // A fresh sale with something on it, sent to the kitchen. Each pass needs
    // its own ticket: once a ticket is acknowledged it cannot be acknowledged
    // again, which is the point, so the previous pass's ticket is spent.
    await page.context().addCookies([{ name: "locale", value: "en", url: origin }]);
    await page.goto("/admin/pos?mode=counter");
    // The board's counter has no start button: the first tap opens the sale.
    await expect(page.locator("[data-pos-empty]")).toBeVisible({ timeout: 40_000 });
    await page.getByRole("button", { name: "House pizza" }).first().click();
    await expect(page).toHaveURL(/order=/, { timeout: 40_000 });
    const orderId = new URL(page.url()).searchParams.get("order");
    expect(orderId).toBeTruthy();
    await expect(page.locator("[data-pos-charge]").first()).toHaveText(/\$18\.00/, { timeout: 30_000 });
    const send = page.locator("[data-pos-send]");
    await send.click();
    // The counter's sign the ticket went: once the engine has answered the
    // action reads `Send again` (a second send is an amendment). Leaving
    // before that showed a board rendered before the ticket existed.
    await expect(send).toHaveText(/send again|enviar de nuevo|renvoyer/i, { timeout: 30_000 });

    // Station one, in the language under test.
    await page.context().addCookies([{ name: "locale", value: locale, url: origin }]);
    await page.goto("/admin/preparation");
    await expect(
      page.getByRole("heading", { level: 1 }),
      `the board must render in ${locale}`,
    ).toHaveText(copy.prepTitle);
    // The board lists every open ticket the venue has, oldest first, and
    // other journeys leave pickup tickets on it. The one this pass just sent
    // is a COUNTER ticket and the newest card of that kind.
    // The card says where it goes beside its code ("#A1B2 · Counter").
    const ownTicket = (p: import("@playwright/test").Page) =>
      p
        .locator("li[data-prep-ticket]")
        .filter({ hasText: /house pizza/i })
        .filter({ hasText: new RegExp(copy.destinationCounter, "i") })
        .last();
    await page.getByRole("tab", { name: new RegExp(`^${copy.tabQueued}`, "i") }).click();
    const ticket = ownTicket(page);
    await expect(ticket).toBeVisible({ timeout: 30_000 });
    // The card's own id, so the SAME ticket is followed across the tabs and
    // across the two stations: `.last()` on a filtered tab would otherwise
    // land on an older card the moment this one moves.
    const ticketId = await ticket.getAttribute("data-prep-ticket");
    expect(ticketId, "the card must carry its ticket id").toBeTruthy();
    const byId = (p: import("@playwright/test").Page) => p.locator(`li[data-prep-ticket="${ticketId}"]`);

    // Station two: a second browser context, its own session, looking at the
    // same board before anyone touched it.
    const second = await browser.newContext({ timezoneId: "Asia/Tokyo" });
    try {
      const other = await second.newPage();
      await prepareJourneysPage(other);
      await signInJourneysStaff(other, "/admin/preparation");
      await other.context().addCookies([{ name: "locale", value: locale, url: origin }]);
      await other.goto("/admin/preparation");
      await other.getByRole("tab", { name: new RegExp(`^${copy.tabQueued}`, "i") }).click();
      const stale = byId(other);
      await expect(stale).toBeVisible({ timeout: 30_000 });
      await expect(stale.getByRole("button", { name: copy.acknowledge, exact: true })).toBeVisible();

      // Station one takes it, and its own board says so in words (the
      // ticket leaves the Queued tab and reads Preparing on the next).
      await byId(page).getByRole("button", { name: copy.acknowledge, exact: true }).click();
      await expect(byId(page)).toHaveCount(0, { timeout: 30_000 });
      await page.getByRole("tab", { name: new RegExp(`^${copy.tabPreparing}`, "i") }).click();
      await expect(byId(page)).toContainText(copy.statusAcknowledged, { timeout: 30_000 });

      // Station two taps the button it is still showing.
      await stale.getByRole("button", { name: copy.acknowledge, exact: true }).click();
      const banner = other.locator('p[role="alert"]').first();
      await expect(banner, `the board must refuse in ${locale}`).toBeVisible({ timeout: 30_000 });
      await expect(banner).toHaveText(KITCHEN_INVALID_STATE[locale]!);
      await expect(
        banner,
        "a cook must never be shown `invalid_state`",
      ).not.toContainText(/invalid_state|not_found|wrong_tenant|unavailable/);

      await other.screenshot({
        path: testInfo.outputPath(`kitchen-refusal-${locale}.png`),
        fullPage: true,
      });
    } finally {
      await second.close();
    }

    // Leave nothing owed behind: the sale was never collected, so discard it
    // the way the counter's own control does (`Hold sale` → `Discard sale`).
    await page.context().addCookies([{ name: "locale", value: "en", url: origin }]);
    await page.goto(`/admin/pos?mode=counter&order=${orderId}`);
    await page.locator("[data-pos-hold]").click();
    await page.locator("[data-pos-discard]").click();
    await expect(page.locator("[data-pos-discard]")).toHaveCount(0, { timeout: 40_000 });
  }
});
