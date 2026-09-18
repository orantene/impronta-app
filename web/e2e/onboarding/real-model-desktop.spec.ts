/**
 * Real-model desktop runs: three talent sentences, three business sentences,
 * each from a typed sentence to the composed site or profile, at 1440 px.
 *
 * Opt-in only (`ONB_REAL_MODEL=1`): it spends model credits and needs the
 * isolated stack with model keys. Every screen is captured into
 * `ONB_EVIDENCE_DIR`; the assertions are the floor (understood, arrival, a
 * rendered site), the screenshots are the point.
 */
import type { Locator } from "@playwright/test";
import { isolatedService } from "../cases/_isolated-db";
import { APP_BASE, MARKETING_BASE, evidence, expect, openHome, test } from "./_module";
import { devSignIn, ensureUser } from "./_seed";

test.skip(!process.env.ONB_REAL_MODEL, "set ONB_REAL_MODEL=1 to spend model credits");
test.use({ viewport: { width: 1440, height: 900 } });

type Run = {
  id: string;
  intent: "talent" | "business";
  sentence: string;
  city: string;
  name: string;
  services: string[];
  style?: "natural" | "modern" | "minimal" | "vibrant";
};

const RUNS: Run[] = [
  { id: "t1-nails", intent: "talent", sentence: "I'm a nail technician in Cancún, I do gel, acrylics and nail art at home or at the client's place, Monday to Saturday.", city: "Cancún", name: "Valeria Nails", services: ["Gel nails", "Acrylic nails", "Nail art"] },
  { id: "t2-photo", intent: "talent", sentence: "Wedding and event photographer based in Tulum, I shoot weddings, elopements and brand shoots, available all week.", city: "Tulum", name: "Diego Fotografía", services: ["Wedding photography", "Elopements", "Brand shoots"] },
  { id: "t3-yoga", intent: "talent", sentence: "I teach yoga and breathwork in Playa del Carmen, private classes and small groups, mornings and evenings.", city: "Playa del Carmen", name: "Ana Yoga", services: ["Private yoga", "Group classes", "Breathwork"] },
  { id: "b1-taco", intent: "business", sentence: "Taquería El Güero in Cancún, tacos al pastor, quesadillas and aguas frescas, open Tuesday to Sunday 1pm to 11pm, WhatsApp orders.", city: "Cancún", name: "Taquería El Güero", services: ["Tacos al pastor", "Quesadillas", "Aguas frescas"], style: "vibrant" },
  { id: "b2-barber", intent: "business", sentence: "Barbería Norte is a barbershop in Playa del Carmen: fades, beard trims and hot towel shaves, Monday to Saturday 10 to 8.", city: "Playa del Carmen", name: "Barbería Norte", services: ["Fade haircut", "Beard trim", "Hot towel shave"], style: "minimal" },
  { id: "b3-spa", intent: "business", sentence: "Casa Selva Spa in Tulum offers massages, facials and temazcal ceremonies, open every day from 9am to 7pm.", city: "Tulum", name: "Casa Selva Spa", services: ["Massage", "Facial", "Temazcal"], style: "natural" },
];

const visible = async (loc: Locator, ms = 1500) =>
  loc.isVisible({ timeout: ms }).catch(() => false);

for (const run of RUNS) {
  test(`${run.id}: ${run.intent} from one sentence to the ${run.intent === "talent" ? "profile" : "site"}`, async ({ page }) => {
    test.setTimeout(480_000);
    const stamp = Date.now().toString(36).slice(-4);
    const email = `qa-onb-real-${run.id}-${stamp}@impronta.test`;
    const userId = await ensureUser(email);
    await devSignIn(page, email);
    await openHome(page);
    if (run.intent === "business") await page.getByRole("link", { name: /Start a business/ }).first().click();
    else await page.getByRole("button", { name: /Sell your work/ }).first().click();
    const resume = page.getByTestId("onb-resume-continue");
    if (await visible(resume, 2000)) await page.getByTestId("onb-resume-restart").click().catch(() => resume.click());
    await expect(page.getByTestId("onb-sentence")).toBeVisible({ timeout: 15_000 });
    await evidence(page, `${run.id}-01-entry`);
    await page.getByTestId("onb-sentence").fill(run.sentence);
    await page.getByTestId("onb-send").click();
    await page.getByTestId("onb-confirm-send").click();
    await expect(page.getByTestId("onb-understood")).toBeVisible({ timeout: 150_000 });
    await evidence(page, `${run.id}-02-understood`);
    const err = page.getByTestId("onb-error");
    expect(await visible(err, 500), "the model read the sentence (no short-form fallback)").toBe(false);
    await page.getByTestId("onb-accept").click();

    const fork = page.getByTestId("onb-fork");
    if (await visible(fork, 2000)) await page.getByTestId(`onb-fork-${run.intent}`).click();

    await expect(page.getByTestId("onb-essentials")).toBeVisible({ timeout: 60_000 });
    await evidence(page, `${run.id}-03-essentials-prefilled`);
    // What you do: keep the AI's pick when there is one, else search the catalogue.
    if (!(await visible(page.getByTestId("onb-basics-what-selected")))) {
      await page.getByTestId("onb-basics-what").fill(run.services[0].split(" ")[0]);
      const opt = page.getByTestId("onb-basics-what-option").first();
      if (await visible(opt, 4000)) await opt.click();
      else await page.getByTestId("onb-basics-other").fill(run.services[0]);
    }
    if (!(await visible(page.getByTestId("onb-basics-city-selected")))) {
      await page.getByTestId("onb-basics-city").fill(run.city);
      await page.getByTestId("onb-basics-city-option").first().click({ timeout: 10_000 });
    }
    const nameInput = page.getByTestId("onb-name-input");
    if (await visible(nameInput) && !(await nameInput.inputValue()).trim()) await nameInput.fill(run.name);
    if ((await page.locator('[data-testid^="onb-service-chip-"]').count()) === 0) {
      for (const s of run.services) {
        await page.getByTestId("onb-service-input").fill(s);
        await page.getByTestId("onb-service-input").press("Enter");
      }
    }
    if (run.intent === "business") {
      if (await visible(page.getByTestId("onb-hours-mon_sat_9_7"))) await page.getByTestId("onb-hours-mon_sat_9_7").click();
      const wa = page.getByTestId("onb-whatsapp-input");
      if (await visible(wa) && !(await wa.inputValue()).trim()) await wa.fill("998 555 0101");
    }
    await evidence(page, `${run.id}-04-essentials-filled`);
    await page.getByTestId("onb-next").click();

    if (run.intent === "business") {
      await expect(page.getByTestId("onb-style")).toBeVisible({ timeout: 60_000 });
      await page.getByTestId(`onb-style-${run.style ?? "modern"}`).click();
      await evidence(page, `${run.id}-05-style`);
      await page.getByTestId("onb-style-continue").click();
    }

    await expect(page.getByTestId("onb-ready")).toBeVisible({ timeout: 60_000 });
    if (run.intent === "business") {
      await expect(page.getByTestId("onb-link-available").or(page.getByTestId("onb-link-taken"))).toBeVisible({ timeout: 20_000 });
      if (await visible(page.getByTestId("onb-link-taken"))) {
        await page.getByTestId("onb-link-suggestion").first().click();
        await expect(page.getByTestId("onb-link-available")).toBeVisible({ timeout: 20_000 });
      }
    }
    await evidence(page, `${run.id}-06-ready`);
    await page.getByTestId("onb-build").click();
    await expect(page.getByTestId("onb-building")).toBeVisible();
    await evidence(page, `${run.id}-07-building`);
    await expect(page.getByTestId("onb-arrival")).toBeVisible({ timeout: 150_000 });
    await page.waitForTimeout(2500);
    await evidence(page, `${run.id}-08-arrival`);

    const admin = isolatedService();
    if (run.intent === "business") {
      const { data: brief } = await admin.from("tulala_briefs").select("module_state").eq("profile_id", userId).order("updated_at", { ascending: false }).limit(1).maybeSingle();
      const tenantId = (brief?.module_state as { build?: { tenantId?: string } } | null)?.build?.tenantId;
      expect(tenantId, "workspace provisioned").toBeTruthy();
      const { data: agency } = await admin.from("agencies").select("slug, settings").eq("id", tenantId!).maybeSingle();
      const compose = (agency!.settings as { site_compose?: { outcome: string; lookId?: string } }).site_compose;
      test.info().annotations.push({ type: "compose", description: JSON.stringify(compose) });
      await page.goto(`${APP_BASE.replace("3106", "3008")}/w/${agency!.slug}`, { timeout: 240_000, waitUntil: "domcontentloaded" });
      await expect(page.getByText(run.name).first()).toBeVisible({ timeout: 150_000 });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${process.env.ONB_EVIDENCE_DIR}/${run.id}-09-site-full-1440.png`, fullPage: true });
      await evidence(page, `${run.id}-09-site-fold`);
    } else {
      const { data: tp } = await admin.from("talent_profiles").select("id, display_name, short_bio, profile_code").eq("user_id", userId).maybeSingle();
      expect(tp, "talent profile written").toBeTruthy();
      test.info().annotations.push({ type: "profile", description: JSON.stringify(tp) });
      // The arrival CTA targets the app host; on this stack that host is not the
      // local proxy, so the same page is opened on the app proxy (one cookie jar).
      await expect(page.getByTestId("onb-arrival-cta")).toHaveText(/Finish my page/);
      await page.goto(`${APP_BASE}/talent/today`, { timeout: 240_000, waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => {});
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${process.env.ONB_EVIDENCE_DIR}/${run.id}-09-today-full-1440.png`, fullPage: true });
      await evidence(page, `${run.id}-09-today-fold`);
      if (tp!.profile_code) {
        await page.goto(`${MARKETING_BASE}/t/${tp!.profile_code}`, { timeout: 240_000, waitUntil: "domcontentloaded" });
        await page.waitForLoadState("networkidle", { timeout: 60_000 }).catch(() => {});
        await page.waitForTimeout(2500);
        await page.screenshot({ path: `${process.env.ONB_EVIDENCE_DIR}/${run.id}-10-public-profile-full-1440.png`, fullPage: true });
      }
    }
  });
}
