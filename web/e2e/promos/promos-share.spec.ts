/**
 * Promos v1, share links: `/t/<profileCode>/p/<slug>` (design C, L4, L8).
 *
 *   - every state is HTTP 200 (stories and QR prints live forever);
 *   - every promo page is noindex;
 *   - the open beacon (`POST /api/promos/event`, kind link_open) is the ONLY
 *     writer of promo_events and the thing that sets the 7-day `tl_promo`
 *     cookie. The page itself sets nothing, so the cookie is asserted on the
 *     beacon's response headers (the cookie is Secure; reading the response is
 *     independent of how the browser treats Secure on http://localhost).
 *
 * Fixture talent t_max; links are `unlock: link` promos seeded under the E2E
 * prefix and deleted afterwards. Anonymous visitors.
 */
import { expect, test } from "@playwright/test";

import { talentFixture } from "../talent-website/fixtures";
import { talentProfileIdFor } from "../talent-website/helpers";
import { adminDb, cleanupPromos, PROMO_PREFIX, promoTenantId, seedPromo } from "./_db";

const fx = talentFixture("t_max");
const run = Date.now();
const SPEC_PREFIX = `${PROMO_PREFIX} share`;
const LIVE_SLUG = `e2e-live-${run}`;
const ENDED_SLUG = `e2e-ended-${run}`;
const DAY_MS = 86_400_000;

let tenantId = "";
let livePromoId = "";

const hubLink = (slug: string): string => `/t/${fx.profileCode}/p/${slug}`;
const isBeacon = (url: string, method: string): boolean => url.includes("/api/promos/event") && method === "POST";

async function linkOpenCount(promoId: string): Promise<number> {
  const { count, error } = await adminDb()
    .from("promo_events")
    .select("id", { count: "exact", head: true })
    .eq("promo_id", promoId)
    .eq("kind", "link_open");
  if (error) throw new Error(error.message);
  return count ?? 0;
}

test.beforeAll(async () => {
  const db = adminDb();
  tenantId = await promoTenantId(db, talentProfileIdFor("t_max"));
  await cleanupPromos(db, tenantId, SPEC_PREFIX);
  livePromoId = await seedPromo(db, tenantId, { name: "share live", unlock: "link", linkSlug: LIVE_SLUG, percent: 20 });
  await seedPromo(db, tenantId, {
    name: "share ended",
    unlock: "link",
    linkSlug: ENDED_SLUG,
    percent: 20,
    startsAt: new Date(Date.now() - 3 * DAY_MS).toISOString(),
    endsAt: new Date(Date.now() - DAY_MS).toISOString(),
  });
});

test.afterAll(async () => {
  if (tenantId) await cleanupPromos(adminDb(), tenantId, SPEC_PREFIX);
});

test("a live promo link serves 200, is noindex, and the open beacon sets the promo cookie", async ({ page }) => {
  const beacon = page.waitForResponse((r) => isBeacon(r.url(), r.request().method()), { timeout: 30_000 });
  const res = await page.goto(`${hubLink(LIVE_SLUG)}?via=wa`, { waitUntil: "domcontentloaded" });
  expect(res?.status()).toBe(200);

  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Tu descuento ya está aplicado|Your discount is applied/);

  const b = await beacon;
  expect(b.status()).toBe(200);
  const setCookie = (await b.headerValue("set-cookie")) ?? "";
  expect(setCookie, "link_open pins the promo for 7 days").toContain(`tl_promo=${livePromoId}`);
  expect(setCookie, "first-touch source tag rides its own cookie").toContain("tl_promo_via=wa");
  expect(setCookie.toLowerCase(), "the cookie is httpOnly").toContain("httponly");
});

test("an ended promo link still serves 200 with the ended landing, noindex", async ({ page }) => {
  const res = await page.goto(hubLink(ENDED_SLUG), { waitUntil: "domcontentloaded" });
  expect(res?.status(), "stories and QR prints live forever: never a 404").toBe(200);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Esta promo terminó|This promo has ended/);
});

test("an unknown promo slug is still a 200 landing, never a 404", async ({ request }) => {
  const res = await request.get(hubLink(`e2e-nope-${run}`));
  expect(res.status()).toBe(200);
});

test("POST /api/promos/event link_open inserts a promo_events row and pins the cookie", async ({ request }) => {
  const before = await linkOpenCount(livePromoId);

  const res = await request.post("/api/promos/event", { data: { promoId: livePromoId, kind: "link_open", via: "ig_story" } });
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ ok: true });
  const cookies = res
    .headersArray()
    .filter((h) => h.name.toLowerCase() === "set-cookie")
    .map((h) => h.value)
    .join("\n");
  expect(cookies).toContain(`tl_promo=${livePromoId}`);

  await expect.poll(() => linkOpenCount(livePromoId), { timeout: 15_000 }).toBe(before + 1);
  const { data, error } = await adminDb()
    .from("promo_events")
    .select("kind, via, tenant_id")
    .eq("promo_id", livePromoId)
    .eq("via", "ig_story")
    .maybeSingle();
  if (error) throw new Error(error.message);
  expect(data).toMatchObject({ kind: "link_open", via: "ig_story", tenant_id: tenantId });
});

test("the event API refuses a bad promo id and an unknown kind without writing", async ({ request }) => {
  const before = await linkOpenCount(livePromoId);
  const badId = await request.post("/api/promos/event", { data: { promoId: "not-a-uuid", kind: "link_open" } });
  expect(badId.status()).toBe(400);
  const badKind = await request.post("/api/promos/event", { data: { promoId: livePromoId, kind: "purchase" } });
  expect(badKind.status()).toBe(400);
  expect(await linkOpenCount(livePromoId)).toBe(before);
});
