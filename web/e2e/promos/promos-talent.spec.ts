/**
 * Promos v1, talent side: /talent/promos.
 *
 * t_max (talent_portfolio) is the PAID fixture: the free plan allows one
 * lifetime trial and blocks resume on non-trial promos, which would make
 * pause/resume/duplicate depend on workspace history. The dashboard is forced
 * to Spanish so the copy in `src/lib/promos/copy/talent.ts` (es) is what we
 * assert.
 *
 * Runs in the `promos` project (needs the signed-in storage state that
 * `talent-website-setup` writes) and cleans up every promo it makes.
 */
import { expect, test, type Page } from "@playwright/test";

import { storageStateFor } from "../talent-website/fixtures";
import { setDashboardLocale, talentProfileIdFor } from "../talent-website/helpers";
import { adminDb, promoTenantId } from "./_db";

const PROMO_NAME = "Llena tu semana";

test.use({ storageState: storageStateFor("t_max") });
test.describe.configure({ mode: "serial" });

let tenantId = "";

/** The talent-created promos have the template's own name (no E2E prefix), so clean by exact name. */
async function deleteTemplatePromos(): Promise<void> {
  const db = adminDb();
  const { error } = await db
    .from("tenant_promo_codes")
    .delete()
    .eq("tenant_id", tenantId)
    .or(`name.eq.${PROMO_NAME},name.eq.${PROMO_NAME} (2)`);
  if (error) throw new Error(`cleanup: ${error.message}`);
}

async function promoRows(): Promise<{ id: string; name: string; is_draft: boolean; is_paused: boolean; max_redemptions: number | null; value: number }[]> {
  const { data, error } = await adminDb()
    .from("tenant_promo_codes")
    .select("id, name, is_draft, is_paused, max_redemptions, value")
    .eq("tenant_id", tenantId)
    .like("name", `${PROMO_NAME}%`)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as { id: string; name: string; is_draft: boolean; is_paused: boolean; max_redemptions: number | null; value: number }[];
}

async function openPromosPage(page: Page): Promise<void> {
  await setDashboardLocale(page.context(), "es");
  // Direct navigation, not via the shell: this is the cold-load path that used to hang on "Cargando".
  await page.goto("/talent/promos", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("button", { name: "Nueva" }), "the page must render its header action").toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("Cargando tus promos")).toHaveCount(0, { timeout: 15_000 });
}

test.beforeAll(async () => {
  const db = adminDb();
  tenantId = await promoTenantId(db, talentProfileIdFor("t_max"));
  await deleteTemplatePromos();
});

test.afterAll(async () => {
  if (tenantId) await deleteTemplatePromos();
});

test("opens directly and leaves the loading state within 15s", async ({ page }) => {
  await openPromosPage(page);
  await expect(page.getByRole("heading", { name: "Promos" }).first()).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0);
});

test('creates "Llena tu semana" 20% from the template in 3 taps and lists it under Activas as "0 de 3"', async ({ page }) => {
  await openPromosPage(page);

  // Tap 1: New. Tap 2: the template tile. Tap 3: Publish now.
  await page.getByRole("button", { name: "Nueva" }).click();
  await page.getByRole("button", { name: new RegExp(`^${PROMO_NAME}`) }).click();
  await page.getByRole("button", { name: "Publicar ahora" }).click();

  // The drawer closes and the list reloads; Activas is the default tab.
  const card = page.getByRole("button", { name: `Abrir promo: ${PROMO_NAME}`, exact: true });
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(card).toContainText("20%");
  await expect(card).toContainText("0 de 3");
  await expect(card).toContainText("Activa");

  const rows = await promoRows();
  expect(rows, "exactly one promo was created").toHaveLength(1);
  expect(rows[0]).toMatchObject({ name: PROMO_NAME, value: 20, max_redemptions: 3, is_draft: false, is_paused: false });
});

test("pauses and resumes from the detail sheet", async ({ page }) => {
  await openPromosPage(page);
  await page.getByRole("button", { name: `Abrir promo: ${PROMO_NAME}`, exact: true }).click();

  const toggle = page.getByRole("switch", { name: "Activar o pausar" });
  await expect(toggle).toBeChecked();

  await toggle.click();
  await expect(page.getByText("Promo en pausa")).toBeVisible({ timeout: 15_000 });
  await expect.poll(async () => (await promoRows())[0]?.is_paused, { timeout: 15_000 }).toBe(true);
  await expect(page.getByRole("switch", { name: "Activar o pausar" })).not.toBeChecked();

  await page.getByRole("switch", { name: "Activar o pausar" }).click();
  await expect(page.getByText("Promo activa de nuevo")).toBeVisible({ timeout: 15_000 });
  await expect.poll(async () => (await promoRows())[0]?.is_paused, { timeout: 15_000 }).toBe(false);
  await expect(page.getByRole("switch", { name: "Activar o pausar" })).toBeChecked();
});

test("duplicates into a draft copy and keeps the original untouched", async ({ page }) => {
  await openPromosPage(page);
  await page.getByRole("button", { name: `Abrir promo: ${PROMO_NAME}`, exact: true }).click();
  await page.getByRole("button", { name: "Duplicar" }).click();
  await expect(page.getByText("Copia creada como borrador")).toBeVisible({ timeout: 15_000 });

  await expect.poll(async () => (await promoRows()).length, { timeout: 15_000 }).toBe(2);
  const rows = await promoRows();
  const copy = rows.find((r) => r.name === `${PROMO_NAME} (2)`);
  expect(copy, "the copy is named with a (2) suffix").toBeTruthy();
  expect(copy?.is_draft, "a duplicate is a draft, never live").toBe(true);
  const original = rows.find((r) => r.name === PROMO_NAME);
  expect(original).toMatchObject({ is_draft: false, is_paused: false });

  // Drafts live under Programadas.
  await openPromosPage(page);
  await page.getByRole("button", { name: /^Programadas/ }).click();
  await expect(page.getByRole("button", { name: `Abrir promo: ${PROMO_NAME} (2)`, exact: true })).toBeVisible();
});
