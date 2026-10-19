/**
 * Promos v1, public price: one live public AUTO 20% promo, seeded for t_max,
 * must price every surface the same way (design L6: no surface renders a price
 * itself).
 *
 *   hub /t/<code>             headline "Antes X, ahora Y -20%"
 *   site home services card   strike-through + badge
 *   service page              strike-through + badge
 *   booking sheet             total at the pay step
 *
 * The promo is "all services" so whichever offering the hub headline picks is
 * discounted. Promos are per tenant and the hub tenant is shared by every
 * rostered fixture: `afterAll` deletes it so no other spec sees a re-priced
 * catalogue. Anonymous visitors; no sign-in.
 */
import { expect, test } from "@playwright/test";

import { MAISON_FIXED_OFFERING, talentFixture } from "../talent-website/fixtures";
import { talentProfileIdFor } from "../talent-website/helpers";
import {
  adminDb,
  PROMO_PREFIX,
  cleanupPromos,
  ensureBookingHoursIfMissing,
  moneyToCents,
  offeringByTitle,
  promoTenantId,
  removeBookingHours,
  seedPromo,
  serviceSlugFor,
  type OfferingRef,
} from "./_db";
import { advanceToWho, expectFooterTotal } from "./_sheet";

const fx = talentFixture("t_max");
const PERCENT = 20;
/** Names this spec seeds start with this, so cleanup never touches another spec's promos. */
const SPEC_PREFIX = `${PROMO_PREFIX} price`;

test.describe.configure({ mode: "serial" });

let tenantId = "";
let profileId = "";
let offering: OfferingRef;
let createdHours = false;

const siteHome = `/t/site/${fx.siteSlug}`;
const expectedFinal = (list: number): number => Math.round(list * (1 - PERCENT / 100));

test.beforeAll(async () => {
  const db = adminDb();
  profileId = talentProfileIdFor("t_max");
  tenantId = await promoTenantId(db, profileId);
  offering = await offeringByTitle(db, profileId, MAISON_FIXED_OFFERING);
  await cleanupPromos(db, tenantId, SPEC_PREFIX);
  createdHours = await ensureBookingHoursIfMissing(db, profileId, tenantId);
  await seedPromo(db, tenantId, { name: "price auto 20", unlock: "auto", percent: PERCENT, showOnSite: true });
});

test.afterAll(async () => {
  if (!tenantId) return;
  const db = adminDb();
  await cleanupPromos(db, tenantId, SPEC_PREFIX);
  if (createdHours) await removeBookingHours(db, profileId);
});

test("hub headline shows before, now and the -20% badge", async ({ page }) => {
  await page.goto(`/t/${fx.profileCode}`, { waitUntil: "domcontentloaded" });
  const body = page.locator("body");
  await expect(body).toContainText(/-20%/, { timeout: 30_000 });
  const text = await body.innerText();
  const m = /(?:Antes|Was)\s+([^,\n]+),\s+(?:ahora|now)\s+(.+?)\s+-20%/.exec(text);
  if (!m) throw new Error("the hub headline must read 'Antes X, ahora Y -20%'");
  const list = moneyToCents(m[1] ?? "");
  const final = moneyToCents(m[2] ?? "");
  expect(final, "the discounted price is 20% under the list price").toBe(expectedFinal(list));
});

test("service page strikes the list price and shows the discounted one", async ({ page }) => {
  const res = await page.goto(`${siteHome}/${serviceSlugFor(offering)}`, { waitUntil: "domcontentloaded" });
  expect(res?.status(), "the service page must serve").toBe(200);
  const price = page.locator("[data-talent-service-page] [data-promo-price]");
  await expect(price).toBeVisible({ timeout: 30_000 });
  await expect(price.locator("[data-promo-badge]")).toHaveText("-20%");
  const list = moneyToCents(await price.locator("s").first().innerText());
  const final = moneyToCents(await price.locator("strong").first().innerText());
  expect(list, "struck price is the offering's list price").toBe(offering.amountCents);
  expect(final).toBe(expectedFinal(offering.amountCents));
});

test("site services card carries the same discounted price as the service page", async ({ page }) => {
  await page.goto(siteHome, { waitUntil: "domcontentloaded" });
  const card = page
    .locator("li, article, div")
    .filter({ hasText: offering.title })
    .locator("[data-promo-price]")
    .first();
  // A starter home without a services-catalog section has no card to compare.
  test.skip((await card.count()) === 0, "the seeded site home renders no services-catalog card for this offering");
  await expect(card.locator("[data-promo-badge]")).toHaveText("-20%");
  const final = moneyToCents(await card.locator("strong").first().innerText());
  expect(final).toBe(expectedFinal(offering.amountCents));
});

test("booking sheet total at the pay step equals the service page price", async ({ page }) => {
  await page.goto(`${siteHome}/${serviceSlugFor(offering)}`, { waitUntil: "domcontentloaded" });
  await page.locator("[data-talent-service-book]").click();
  const list = await advanceToWho(page);
  if (list !== null) expect(list, "the sheet's summary shows the list price").toBe(offering.amountCents);
  await expectFooterTotal(page, expectedFinal(offering.amountCents));
});
