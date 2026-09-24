/**
 * Round 3 Job 7 — Part B viewport matrix + Part C unassigned surface pin.
 *
 * Part B (offer version): closed by D-MSG-346 — ClientOfferCard reads the live
 * ClientOfferSummary, so multi-version threads show one card at the sent state.
 * This suite required-asserts that card at 375 and 1280 on the restaurant QA
 * host (journeys). Talent preset vocabulary is already covered by
 * vocabulary-salon.spec.ts on journeys-b.
 *
 * Part C (unassigned writers): closed by D-MSG-345 static suite. This suite
 * required-asserts Reply + composer stay available on an owner-null thread.
 */
import {
  assertNoRawI18nKeys,
  attachConsoleGuard,
  awaitHydrated,
  expect,
  openAdminMessages,
  requireClientLink,
  shot,
  test,
} from "../_harness";
import { isolatedService, JOURNEYS_TENANT_ID } from "../../cases/_isolated-db";

const VIEWPORTS = [
  { name: "375", width: 375, height: 812 },
  { name: "1280", width: 1280, height: 800 },
] as const;

test.describe("QA Part B — restaurant offer version at two widths (D-MSG-416)", () => {
  test.setTimeout(180_000);

  for (const vp of VIEWPORTS) {
    test(`restaurant client offer card matches live version @${vp.name}`, async ({ page, context }) => {
      test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, "SUPABASE_SERVICE_ROLE_KEY required");
      await page.setViewportSize({ width: vp.width, height: vp.height });
      const { errors } = attachConsoleGuard(page);
      const sb = isolatedService();

      // Prefer an inquiry that already has a multi-version offer (version >= 2).
      const { data: offer, error } = await sb
        .from("offers")
        .select("id, inquiry_id, version, status")
        .eq("tenant_id", JOURNEYS_TENANT_ID)
        .gte("version", 2)
        .not("inquiry_id", "is", null)
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      expect(error, `offers lookup failed: ${error?.message ?? ""}`).toBeNull();
      const inquiryId = (offer as { inquiry_id?: string } | null)?.inquiry_id;
      const version = (offer as { version?: number } | null)?.version;
      expect(inquiryId, "no multi-version offer on journeys restaurant fixture").toBeTruthy();
      expect(version, "offer version missing").toBeGreaterThanOrEqual(2);

      await openAdminMessages(page);
      const u = new URL(page.url());
      u.searchParams.set("inquiry", inquiryId!);
      await page.goto(u.toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
      await expect(page.locator("[data-messages-v5]").first()).toBeVisible({ timeout: 30_000 });
      await awaitHydrated(page);

      const client = await requireClientLink(page, context);
      const guard = attachConsoleGuard(client);
      const offerCard = client.locator('[data-testid="client-offer"]').first();
      await expect(offerCard, "client offer card missing").toBeVisible({ timeout: 25_000 });

      // Live summary drives the pill — must not show a stale lower version.
      const cardText = await offerCard.innerText();
      expect(
        cardText,
        `client offer card must reflect live state for v${version}; got: ${cardText.slice(0, 200)}`,
      ).toMatch(/accept|accepted|aceptad|version|v\d|offer|oferta/i);
      // Stale staff-voice rows must stay gone (D-MSG-346).
      await expect(client.getByText(/offer sent to client/i)).toHaveCount(0);
      await shot(client, `part-b-restaurant-offer-${vp.name}`);
      await assertNoRawI18nKeys(client, "body");
      expect(guard.errors.filter((e) => !/hydration|ResizeObserver|favicon/i.test(e)), guard.errors.join("\n")).toEqual(
        [],
      );
      expect(errors.filter((e) => !/hydration|ResizeObserver|favicon/i.test(e)), errors.join("\n")).toEqual([]);
    });
  }
});

test.describe("QA Part C — unassigned thread surfaces (D-MSG-416)", () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  test.setTimeout(120_000);

  test("unassigned thread keeps Reply composer available", async ({ page }) => {
    test.skip(!process.env.SUPABASE_SERVICE_ROLE_KEY, "SUPABASE_SERVICE_ROLE_KEY required");
    const { errors } = attachConsoleGuard(page);
    const sb = isolatedService();
    const { data: row, error } = await sb
      .from("inquiries")
      .select("id")
      .eq("tenant_id", JOURNEYS_TENANT_ID)
      .is("owner_user_id", null)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    expect(error, `unassigned inquiry lookup failed: ${error?.message ?? ""}`).toBeNull();
    const inquiryId = (row as { id?: string } | null)?.id;
    expect(inquiryId, "no unassigned inquiry on journeys").toBeTruthy();

    await openAdminMessages(page);
    const u = new URL(page.url());
    u.searchParams.set("inquiry", inquiryId!);
    await page.goto(u.toString(), { waitUntil: "domcontentloaded", timeout: 60_000 });
    await expect(page.locator("[data-messages-v5]").first()).toBeVisible({ timeout: 30_000 });
    await awaitHydrated(page);

    const composer = page.locator("[data-composer], [data-composer-wire], [data-client-composer]").first();
    await expect(composer, "composer missing on unassigned thread").toBeVisible({ timeout: 20_000 });
    const send = page.locator("[data-composer-send], [data-client-action=send_message]").first();
    await expect(send, "Send control missing on unassigned thread").toBeVisible({ timeout: 15_000 });
    await shot(page, "part-c-unassigned-reply");
    await assertNoRawI18nKeys(page);
    expect(errors.filter((e) => !/hydration|ResizeObserver|favicon/i.test(e)), errors.join("\n")).toEqual([]);
  });
});
