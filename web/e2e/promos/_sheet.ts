/**
 * Drives the public catalog booking sheet (CatalogBookingSheet) as a guest.
 * Selectors come from the component's own data attributes; the steps are
 * choose -> when -> who -> done.
 */
import { expect, type Locator, type Page } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { moneyToCents } from "./_db";

export function sheet(page: Page): Locator {
  return page.locator('[role="dialog"][data-catalog-booking]');
}

/** The sheet's running total (footer), in cents. */
export async function footerTotalCents(page: Page): Promise<number> {
  const text = await sheet(page).locator(".jb-total [data-catalog-price]").first().innerText();
  return moneyToCents(text);
}

/** The list price the choose step shows (never promo-adjusted), in cents. */
export async function summaryListCents(page: Page): Promise<number> {
  const text = await sheet(page).locator(".jb-summary [data-catalog-price]").first().innerText();
  return moneyToCents(text);
}

/**
 * Walks choose -> when (first free slot) -> who. Returns the list price read on
 * the choose step, when the sheet showed one.
 */
export async function advanceToWho(page: Page): Promise<number | null> {
  const dialog = sheet(page);
  await expect(dialog, "the booking sheet must open").toBeVisible({ timeout: 45_000 });
  const seen: { list: number | null } = { list: null };
  const email = page.getByTestId("cb-email");
  await expect
    .poll(
      async () => {
        if (await email.isVisible()) return "who";
        const choose = dialog.locator('[data-catalog-continue="choose"]');
        if (await choose.isVisible()) {
          if (seen.list === null) seen.list = await summaryListCents(page).catch(() => null);
          if (await choose.isEnabled()) await choose.click();
          return "choose";
        }
        const when = dialog.locator('[data-catalog-continue="when"]');
        if (await when.isVisible()) {
          const picked = dialog.locator('.jb-time[data-on="true"]');
          if ((await picked.count()) === 0) {
            const first = dialog.locator(".jb-time").first();
            if (await first.isVisible()) await first.click();
          } else if (await when.isEnabled()) {
            await when.click();
          }
          return "when";
        }
        return "wait";
      },
      {
        timeout: 90_000,
        intervals: [500, 1_000, 2_000],
        message: "never reached the 'who' step: no open slot (booking hours) or the sheet did not mount",
      },
    )
    .toBe("who");
  return seen.list;
}

export async function fillWho(page: Page, who: { name: string; email: string; phone?: string }): Promise<void> {
  await page.getByTestId("cb-name").fill(who.name);
  if (who.phone) await page.getByTestId("cb-phone").fill(who.phone);
  await page.getByTestId("cb-email").fill(who.email);
}

/** Types a code in the pay-step field ("¿Tienes un código?") and waits for the applied message. */
export async function applyTypedCode(page: Page, code: string): Promise<void> {
  const dialog = sheet(page);
  await dialog.locator("[data-promo-code-toggle]").click();
  const field = dialog.locator("[data-promo-code-field]");
  await field.getByRole("textbox").fill(code);
  await field.locator('button[type="submit"]').click();
  await expect(field.locator("[data-promo-code-ok]"), `code ${code} must apply`).toBeVisible({ timeout: 20_000 });
}

/** Waits until the footer total settles on `cents` (the promo preview is an async server action). */
export async function expectFooterTotal(page: Page, cents: number): Promise<void> {
  await expect.poll(() => footerTotalCents(page), { timeout: 30_000, intervals: [500, 1_000] }).toBe(cents);
}

export async function confirmBooking(page: Page): Promise<void> {
  await sheet(page).locator('[data-catalog-continue="who"]').click();
}

export type GuestOrder = { id: string; discount_cents: number; total_cents: number };

/** The newest order of this guest at this tenant (by customer email), polled until it exists. */
export async function orderForGuest(db: SupabaseClient, tenantId: string, email: string): Promise<GuestOrder> {
  const out: { order: GuestOrder | null } = { order: null };
  await expect
    .poll(
      async () => {
        const { data: cust } = await db
          .from("customers")
          .select("id")
          .eq("tenant_id", tenantId)
          .eq("email", email.toLowerCase())
          .maybeSingle();
        const customerId = (cust as { id: string } | null)?.id;
        if (!customerId) return "no-customer";
        const { data: order } = await db
          .from("orders")
          .select("id, discount_cents, total_cents")
          .eq("tenant_id", tenantId)
          .eq("customer_id", customerId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!order) return "no-order";
        const o = order as { id: string; discount_cents: number | string | null; total_cents: number | string | null };
        out.order = { id: o.id, discount_cents: Number(o.discount_cents ?? 0), total_cents: Number(o.total_cents ?? 0) };
        return "found";
      },
      { timeout: 45_000, intervals: [1_000, 2_000], message: `no order for guest ${email}` },
    )
    .toBe("found");
  if (!out.order) throw new Error(`no order for guest ${email}`);
  return out.order;
}
