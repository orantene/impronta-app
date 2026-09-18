/**
 * Phase 4.2 · Save, build, arrive.
 *
 * A signed-in fixture user (seeded facts) taps Build: the route provisions
 * the workspace, the composer runs inside provisioning and stamps the site,
 * and the arrival says only what the stamp proves. Then the builder deep
 * link opens the composed home with the edit chrome. Isolated DB only; the
 * run's tenant is deleted in `afterEach`.
 */
import { isolatedService } from "../cases/_isolated-db";
import { APP_BASE, evidence, expect, openHome, test, finishEssentials } from "./_module";
import { devSignIn, ensureUser, seedBrief } from "./_seed";


/**
 * Tenants cannot be hard-deleted (cms_pages and friends reference them); the
 * platform's own delete is a soft cancel. Each run uses a unique business
 * name, so the slug is fresh, and the run's tenant is cancelled afterwards.
 */
async function cancelRunTenants(slugPrefix: string) {
  const admin = isolatedService();
  await admin.from("agencies").update({ status: "cancelled" }).like("slug", `${slugPrefix}%`).neq("status", "cancelled");
}

test.describe("onboarding · build and arrival", () => {
  test.afterEach(async () => {
    await cancelRunTenants("qa-onb-build");
  });

  test("El Paisa: Build provisions, composes, arrives; the builder opens on the composed home; a second tap creates nothing", async ({ page }) => {
    test.setTimeout(180_000);
    // A fresh person per run: the one-free-workspace rule counts a cancelled
    // tenant as owned, so a reused user would arrive at "existing workspace".
    const runId = Date.now().toString(36).slice(-5);
    const businessName = `QA Onb Build ${runId}`;
    const slug = `qa-onb-build-${runId}`;
    const email = `qa-onb-build-${runId}@impronta.test`;
    const userId = await ensureUser(email);
    await seedBrief({
      userId,
      fixture: "el-paisa",
      facts: [
        ["business.name", businessName, "url_import", "needs_approval"],
        ["business.exists", true, "url_import", "needs_approval"],
        ["work.industry", "Argentine grill restaurant", "url_import", "needs_approval"],
        ["person.city", "Cancún", "url_import", "needs_approval"],
        ["business.hours", ["Tue-Sun 13:00-23:00"], "url_import", "needs_approval"],
        ["presence.whatsapp", "+529981234567", "url_import", "needs_approval"],
        ["work.services", ["Parrilla", "Empanadas"], "url_import", "needs_approval"],
      ],
    });
    await devSignIn(page, email);
    await openHome(page);
    await page.getByRole("link", { name: /Start a business/ }).first().click();
    await page.getByTestId("onb-resume-continue").click();
    await expect(page.getByTestId("onb-understood")).toBeVisible({ timeout: 20_000 });
    await page.getByTestId("onb-accept").click();
    await finishEssentials(page, { style: true });
    await expect(page.getByTestId("onb-ready")).toBeVisible();
    await expect(page.getByTestId("onb-link-available").or(page.getByTestId("onb-link-taken"))).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId("onb-link-value")).toContainText(slug);

    await page.getByTestId("onb-build").click();
    await expect(page.getByTestId("onb-building")).toBeVisible();
    await expect(page.getByTestId("onb-step-label")).toHaveText(/4 · Build/);
    await evidence(page, "30-building");
    await expect(page.getByTestId("onb-arrival")).toBeVisible({ timeout: 120_000 });
    await evidence(page, "31-arrival-business");

    const admin = isolatedService();
    const { data: agency } = await admin.from("agencies").select("id, slug, settings").eq("slug", slug).maybeSingle();
    expect(agency, "workspace provisioned with the chosen link").toBeTruthy();
    const stamp = (agency!.settings as { site_compose?: { outcome: string; placed: { hoursPresent: boolean; whatsappPresent: boolean; photos: { hero: string | null } } } }).site_compose;
    expect(stamp, "compose stamp written").toBeTruthy();
    // Arrival claims exactly the stamp: hours and WhatsApp were placed; photos only for a type hero.
    const fact = await page.getByTestId("onb-arrival-fact").innerText();
    expect(fact.includes("your hours")).toBe(stamp!.placed.hoursPresent);
    expect(fact.includes("WhatsApp")).toBe(stamp!.placed.whatsappPresent);
    expect(fact.includes("photos")).toBe(stamp!.placed.photos.hero === "type" || stamp!.placed.photos.hero === "owner");
    const variant = await page.getByTestId("onb-arrival").getAttribute("data-variant");
    expect(stamp!.outcome === "fallback_used" || stamp!.outcome === "failed" ? "fallback" : "business").toBe(variant);
    await expect(page.getByTestId("onb-arrival-cta")).toHaveText(/Open my website/);

    // Second tap: idempotent, same workspace.
    const res = await page.request.post("/api/onboarding/build");
    const body = (await res.json()) as { ok: boolean; build: { status: string; tenantId?: string } };
    expect(body.build.status).toBe("done");
    expect(body.build.tenantId).toBe(agency!.id);
    const { count } = await admin.from("agencies").select("id", { count: "exact", head: true }).like("slug", `${slug}%`);
    expect(count).toBe(1);
    // The provisioner activated the fresh profile (otherwise every app page
    // bounces to the role chooser).
    const { data: prof } = await admin.from("profiles").select("app_role, account_status").eq("id", userId).maybeSingle();
    expect(prof).toMatchObject({ account_status: "active" });

    // The builder opens on the composed home (local stack: path-based workspace on the app host).
    const editorUrl = `${APP_BASE.replace("3106", "3008")}/w/${agency!.slug}?edit=1&panel=sections`;
    await page.goto(editorUrl);
    await expect(page.getByText(businessName).first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: /Exit to live site/ })).toBeVisible({ timeout: 30_000 });
    await evidence(page, "32-builder-open");
  });

  test("Rosa (talent): Build creates the page and arrives on Finish my page", async ({ page }) => {
    test.setTimeout(120_000);
    const email = "qa-onb-build-rosa@impronta.test";
    const userId = await ensureUser(email);
    const admin = isolatedService();
    await admin.from("talent_profiles").delete().eq("user_id", userId);
    await seedBrief({
      userId,
      intent: "talent",
      facts: [
        ["person.professional_name", "Rosa QA", "user_stated"],
        ["work.discipline", "House cleaner", "ai_inference", "needs_approval"],
        ["person.city", "Playa del Carmen", "ai_inference", "needs_approval"],
        ["work.services", ["House cleaning", "Deep cleaning"], "ai_inference", "needs_approval"],
        ["business.works_alone", true, "ai_inference", "needs_approval"],
      ],
      input: { kind: "text", value: "I clean houses in Playa" },
    });
    await devSignIn(page, email);
    await openHome(page);
    await page.getByRole("button", { name: /Sell your work/ }).first().click();
    await page.getByTestId("onb-resume-continue").click();
    await expect(page.getByTestId("onb-understood")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("onb-accept")).toHaveText(/Looks good/);
    await page.getByTestId("onb-accept").click();
    await finishEssentials(page, {});
    await page.getByTestId("onb-build").click();
    await expect(page.getByTestId("onb-arrival")).toBeVisible({ timeout: 60_000 });
    await expect(page.getByTestId("onb-arrival")).toHaveAttribute("data-variant", "talent");
    await expect(page.getByTestId("onb-arrival")).toContainText("You're in, Rosa QA");
    await expect(page.getByTestId("onb-arrival-fact")).toContainText("2 services");
    await expect(page.getByTestId("onb-arrival-cta")).toHaveText(/Finish my page/);
    await evidence(page, "33-arrival-talent");
    const { data: tp } = await admin.from("talent_profiles").select("id, display_name, home_city_text, workflow_status, short_bio").eq("user_id", userId).maybeSingle();
    expect(tp).toMatchObject({ display_name: "Rosa QA", home_city_text: "Playa del Carmen", workflow_status: "draft" });
    // Phase 5 writer: bio drafted from her words only, services as quote-priced
    // drafts, the language of the module, the primary type from the discipline
    // (hub roster permitting: the isolated branch has no platform hub tenant,
    // so the tenant-scoped rows are asserted only when the roster exists).
    expect(String(tp!.short_bio)).toMatch(/^I'm Rosa QA, a house cleaner in Playa del Carmen\. I offer house cleaning and deep cleaning\./);
    const { data: roster } = await admin.from("agency_talent_roster").select("tenant_id").eq("talent_profile_id", tp!.id).limit(1);
    if (roster && roster.length) {
      const tenantId = roster[0].tenant_id as string;
      const { data: offerings } = await admin.from("talent_offerings").select("title, price_display, status").eq("talent_profile_id", tp!.id).eq("tenant_id", tenantId);
      expect((offerings ?? []).map((o) => o.title).sort()).toEqual(["Deep cleaning", "House cleaning"]);
      expect(offerings!.every((o) => o.price_display === "quote" && o.status === "draft")).toBe(true);
      const { data: langs } = await admin.from("talent_languages").select("language_name").eq("talent_profile_id", tp!.id);
      expect((langs ?? []).map((l) => l.language_name)).toEqual(["English"]);
      const { data: tax } = await admin.from("talent_profile_taxonomy").select("relationship_type, taxonomy_terms(slug)").eq("talent_profile_id", tp!.id);
      expect((tax ?? []).some((t) => t.relationship_type === "primary_role")).toBe(true);
    } else {
      test.info().annotations.push({ type: "not-clicked", description: "no platform hub tenant on this stack: taxonomy/languages/offerings rows need the hub roster" });
    }
  });
});
