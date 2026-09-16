/**
 * 2.11 Package components + price phases (P01–P03, W03/E02).
 * Ground truth: `offering_components` rows for the package; an
 * `offering_price_phases` row for the item; a line priced inside a live
 * phase carries `price_phase_id` (repriceAndValidate leaves it alone).
 * Refusal: `overlap` — the same component twice; a phase whose end is
 * before its start (contract §5).
 */
import { test, expect, prepareJourneysPage, signInJourneysStaff, openCounter, counterStartSale, counterAddItem, skipUnlessFixture } from "./_harness";
import { isolatedService, JOURNEYS_TENANT_ID } from "./_isolated-db";
import { WIRE_SENTENCE, latestOrderIdByUrl } from "./_wire";

skipUnlessFixture();

const PIZZA = "33330012-0000-4000-8000-000000000002";
const GARLIC = "75742607-c24c-4f08-9c35-4ebc0591b2c7";

test("WIRE-2.11 package composition writes components and refuses a duplicate; a price phase prices the counter line", async ({ page }) => {
  test.setTimeout(300_000);
  await prepareJourneysPage(page);
  const sb = isolatedService();
  // A plain package item (the fixture's only `package` rows are event
  // offerings, which the catalog editor hides), shaped like House pizza.
  const { data: pkg, error: pkgErr } = await sb
    .from("talent_offerings")
    .insert({
      tenant_id: JOURNEYS_TENANT_ID,
      kind: "package",
      title: `WIRE package ${Date.now()}`,
      title_i18n: { en: "WIRE package" },
      price_type: "flat_package",
      price_display: "exact",
      amount_cents: 3000,
      currency: "USD",
      booking_mode: "instant",
      allow_pay_in_person: true,
      status: "published",
      visibility: "public",
      moderation_state: "approved",
      owner_kind: "workspace",
      reserve_mode: "full",
      consumes_units: 1,
    })
    .select("id")
    .single();
  expect(pkgErr, pkgErr?.message).toBeNull();
  const packageId = (pkg as { id: string }).id;
  const componentRows = async () => {
    const { data } = await sb.from("offering_components").select("component_offering_id, qty, required").eq("offering_id", packageId).order("qty");
    return (data ?? []) as { component_offering_id: string; qty: number; required: boolean }[];
  };
  let phaseId: string | null = null;
  try {
    // ── Composition ────────────────────────────────────────────────────
    await signInJourneysStaff(page, `/admin/catalog?item=${packageId}&tab=details`);
    const card = page.getByTestId("catalog-package-composition");
    await expect(card).toBeVisible({ timeout: 30_000 });
    // Reset to two rows: pizza x1, garlic x2.
    const rowsSel = card.locator("select[aria-label]");
    while ((await rowsSel.count()) > 0) {
      const remove = card.getByRole("button", { name: /remove/i }).first();
      if ((await remove.count()) === 0) break;
      await remove.click();
    }
    await card.getByTestId("catalog-package-add").click();
    await card.locator("select[aria-label]").nth(0).selectOption(PIZZA);
    await card.getByTestId("catalog-package-add").click();
    await card.locator("select[aria-label]").nth(1).selectOption(GARLIC);
    await card.getByLabel(/qty/i).nth(1).fill("2");
    await card.getByTestId("catalog-package-save").click();
    await expect(page.getByTestId("catalog-package-outcome")).toBeVisible({ timeout: 30_000 });
    await expect.poll(async () => (await componentRows()).map((r) => `${r.component_offering_id}:${r.qty}`).sort().join(","), { timeout: 20_000 }).toBe(
      [`${PIZZA}:1`, `${GARLIC}:2`].sort().join(","),
    );

    // Refusal: the same component twice → overlap, rows unchanged.
    await card.getByTestId("catalog-package-add").click();
    await card.locator("select[aria-label]").nth(2).selectOption(PIZZA);
    await card.getByTestId("catalog-package-save").click();
    await expect(page.getByTestId("catalog-package-outcome")).toHaveText(WIRE_SENTENCE.overlap, { timeout: 30_000 });
    expect((await componentRows()).length).toBe(2);

    // ── Price phases on House pizza ────────────────────────────────────
    await page.goto(`/admin/catalog?item=${PIZZA}&tab=pricing`);
    const phases = page.getByTestId("catalog-price-phases");
    await expect(phases).toBeVisible({ timeout: 30_000 });
    await phases.getByTestId("catalog-phase-add").click();
    const form = phases.getByTestId("catalog-phase-form");
    await expect(form).toBeVisible();
    const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 16);
    // Refusal first: an end before its start → overlap, nothing written.
    await form.getByTestId("catalog-phase-label").fill("WIRE early");
    await form.getByTestId("catalog-phase-starts").fill(day(0));
    await form.getByTestId("catalog-phase-ends").fill(day(-1));
    await form.getByTestId("catalog-phase-price").fill("15.50");
    await form.getByTestId("catalog-phase-save").click();
    await expect(page.getByTestId("catalog-phases-outcome")).toHaveText(WIRE_SENTENCE.overlap, { timeout: 30_000 });
    const { count: none } = await sb.from("offering_price_phases").select("id", { count: "exact", head: true }).eq("offering_id", PIZZA).eq("label", "WIRE early");
    expect(none).toBe(0);
    // Then a live phase: yesterday → +2 days at 15.50.
    await form.getByTestId("catalog-phase-starts").fill(day(-1));
    await form.getByTestId("catalog-phase-ends").fill(day(2));
    await form.getByTestId("catalog-phase-save").click();
    await expect(page.getByTestId("catalog-phases-outcome")).not.toHaveText(WIRE_SENTENCE.overlap, { timeout: 30_000 });
    await expect
      .poll(
        async () => {
          const { data } = await sb.from("offering_price_phases").select("id, price_cents").eq("offering_id", PIZZA).eq("label", "WIRE early").maybeSingle();
          phaseId = (data as { id: string } | null)?.id ?? null;
          return (data as { price_cents: number } | null)?.price_cents ?? null;
        },
        { timeout: 20_000 },
      )
      .toBe(1550);

    // The counter: the phase prices the line ON THE ADD (D-138): the first
    // price is the add, and `addLine` (draft.ts) stamps `price_phase_id`
    // there. `repriceAndValidate` never rewrites a stamped line.
    await openCounter(page);
    await counterStartSale(page);
    await counterAddItem(page, "House pizza");
    const orderId = await latestOrderIdByUrl(page);
    const readLine = async () => {
      const { data } = await sb.from("order_lines").select("unit_cents, price_phase_id").eq("order_id", orderId).eq("offering_id", PIZZA).maybeSingle();
      return data as { unit_cents: number; price_phase_id: string | null } | null;
    };
    await expect.poll(async () => (await readLine())?.price_phase_id ?? null, { timeout: 30_000 }).toBe(phaseId);
    expect(Number((await readLine())?.unit_cents)).toBe(1550);
    // The only reprice door on the counter is the Discount sheet's Apply;
    // `repriceAndValidate` writes the phase to the lines before it looks at
    // the code, so an unknown code still reprices (and is then refused).
    const reprice = async () => {
      await page.locator("[data-pos-open-discount]").click();
      await expect(page.locator("[data-pos-sheet='discount']")).toBeVisible({ timeout: 20_000 });
      await page.locator("[data-pos-sheet='discount'] input").first().fill("WIRE-NO-SUCH-CODE");
      await page.locator("[data-pos-discount-apply]").click();
      await expect(page.locator("[data-pos-discount-refused]")).toBeVisible({ timeout: 20_000 });
      await page.keyboard.press("Escape");
    };
    await reprice();
    await expect.poll(async () => (await readLine())?.price_phase_id ?? null, { timeout: 30_000 }).toBe(phaseId);
    expect(Number((await readLine())?.unit_cents)).toBe(1550);
    // A second reprice keeps the stamped phase (and its price).
    await reprice();
    await page.waitForTimeout(2_000);
    expect((await readLine())?.price_phase_id).toBe(phaseId);
    expect(Number((await readLine())?.unit_cents)).toBe(1550);
  } finally {
    if (phaseId) await sb.from("offering_price_phases").delete().eq("id", phaseId);
    await sb.from("offering_price_phases").delete().eq("offering_id", PIZZA).eq("label", "WIRE early");
    await sb.from("offering_components").delete().eq("offering_id", packageId);
    await sb.from("talent_offerings").delete().eq("id", packageId);
  }
});
