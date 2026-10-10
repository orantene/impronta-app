/**
 * TUL-444 B1 Step 1 — wall-clock the public Max-site loaders on fxlank
 * (isolated). Read-only. Never targets TAL-93938 / book-jorgelina.
 *
 * Run: `JOURNEYS_ISOLATED=1 npm run test:wt -- src/lib/talent-site/server/max-site-loader-timing.test.ts`
 * Prints a ranked table of loader ms (stderr) and asserts the top 5 exist.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

const FORBIDDEN_SLUGS = new Set(["book-jorgelina", "jorg-beauty-qa"]);
const FORBIDDEN_CODES = new Set(["TAL-93938"]);
/** Published site on fxlank (isolated). Gridline checklist host on prod; here for loader RTT. */
const TARGET_SLUG = "diego-navarro-dj";
const LOCALE = "en";

type Span = { name: string; ms: number };

function assertIsolated(): void {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  assert.match(url, /fxlank/, `REFUSED: not fxlank (${url || "missing"})`);
  assert.equal(process.env.JOURNEYS_ISOLATED, "1", "REFUSED: JOURNEYS_ISOLATED must be 1");
  assert.ok(process.env.SUPABASE_SERVICE_ROLE_KEY, "REFUSED: missing service role");
}

async function timeOne(name: string, work: () => Promise<unknown>): Promise<Span> {
  const t0 = performance.now();
  await work();
  return { name, ms: Math.round(performance.now() - t0) };
}

describe("max-site loader timing on fxlank (TUL-444 B1)", () => {
  it("ranks the slowest public-path loaders for diego-navarro-dj /en", async () => {
    assertIsolated();
    assert.equal(FORBIDDEN_SLUGS.has(TARGET_SLUG), false);

    const { createClient } = await import("@supabase/supabase-js");
    const sb = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    );

    const { data: site, error: siteErr } = await sb
      .from("talent_sites")
      .select("talent_profile_id, site_slug, site_published_at")
      .eq("site_slug", TARGET_SLUG)
      .maybeSingle();
    assert.equal(siteErr, null, siteErr?.message);
    assert.ok(site?.talent_profile_id, `no published site for ${TARGET_SLUG}`);
    assert.ok(site.site_published_at, `${TARGET_SLUG} must be published`);

    const { data: profile } = await sb
      .from("talent_profiles")
      .select("profile_code")
      .eq("id", site.talent_profile_id)
      .maybeSingle();
    const code = (profile?.profile_code ?? "").toUpperCase();
    assert.equal(FORBIDDEN_CODES.has(code), false, `REFUSED real talent ${code}`);

    const pid = site.talent_profile_id as string;

    const loaders = await import("./load-max-site");
    const localeMod = await import("./talent-site-locale.server");
    const seoFacts = await import("./max-site-seo-facts.server");
    const offerings = await import("@/lib/talent/offerings-public");
    const demo = await import("./render-max-site-demo");
    const social = await import("./talent-social-links");
    const ask = await import("./talent-ask-visible");
    const { createServiceRoleClient } = await import("@/lib/supabase/admin");
    const live = await import("@/lib/talent/live-status");
    const platformTheme = await import("@/lib/platform/default-theme");

    // Warm TLS / pool so the ranked list is loader work, not connect.
    await loaders.loadMaxSiteBySlug(TARGET_SLUG);

    const jobs: Array<[string, () => Promise<unknown>]> = [
      ["maxSite.resolveSite", () => loaders.loadMaxSiteBySlug(TARGET_SLUG)],
      ["maxSite.locale", () =>
        localeMod.loadTalentSiteLocaleContext({
          talentProfileId: pid,
          requestedLocale: LOCALE,
        }),
      ],
      ["maxSite.plan", () => loaders.loadTalentPlanKey(pid)],
      ["maxSite.pages", () => loaders.loadMaxSitePages(pid)],
      ["maxSite.designSlug", () => loaders.loadMaxSiteDesignSlug(pid)],
      ["maxSite.tenant", () => loaders.loadTalentManagingTenantId(pid)],
      ["maxSite.identity", () => loaders.loadTalentSiteIdentity(pid)],
      ["maxSite.isDemo", () => demo.loadMaxSiteIsDemo(pid)],
      ["maxSite.seoFacts", () => seoFacts.loadMaxSiteSeoFacts(pid, LOCALE)],
      ["maxSite.themeTokens", () => loaders.loadMaxSiteThemeTokens(pid, { draft: false })],
      ["maxSite.offerings", () => offerings.loadPublicOfferingsForProfile(pid, LOCALE, null)],
      ["maxSite.askVisible", () => ask.loadTalentAskVisible(pid)],
      ["maxSite.socialLinks", () => social.loadTalentSocialLinks(pid)],
      ["maxSite.platformDefaultTheme", () => platformTheme.loadPlatformDefaultTheme("talent")],
      [
        "maxSite.liveStatus",
        async () => {
          const admin = createServiceRoleClient();
          assert.ok(admin, "service role client");
          return live.loadTalentLiveStatus(admin, pid);
        },
      ],
    ];

    // Sequential: matches per-loader wall clock when awaited one-at-a-time;
    // the render path fans some out with early(), but Step 1 needs named ms.
    const spans: Span[] = [];
    for (const [name, work] of jobs) {
      spans.push(await timeOne(name, work));
    }

    const ranked = [...spans].sort((a, b) => b.ms - a.ms);
    const top5 = ranked.slice(0, 5);

    // Critical-path proxy for renderTalentMaxSite's early() fan-out (no Next
    // Data Cache in tsx — this is RTT of the parallel group, not CDN TTFB).
    const fanOut = [
      () =>
        localeMod.loadTalentSiteLocaleContext({
          talentProfileId: pid,
          requestedLocale: LOCALE,
        }),
      () => loaders.loadTalentPlanKey(pid),
      () => loaders.loadMaxSitePages(pid),
      () => loaders.loadMaxSiteDesignSlug(pid),
      () => loaders.loadTalentManagingTenantId(pid),
      () => loaders.loadTalentSiteIdentity(pid),
      () => demo.loadMaxSiteIsDemo(pid),
      () => loaders.loadMaxSiteThemeTokens(pid, { draft: false }),
      () => seoFacts.loadMaxSiteSeoFacts(pid, LOCALE),
      () => offerings.loadPublicOfferingsForProfile(pid, LOCALE, null),
    ];
    const critT0 = performance.now();
    await Promise.all(fanOut.map((fn) => fn()));
    const criticalPathMs = Math.round(performance.now() - critT0);

    process.stderr.write(
      `\n[max-site-timing] target=${TARGET_SLUG} locale=${LOCALE} host=fxlank code=${code || "?"}\n`,
    );
    process.stderr.write(`[max-site-timing] top 5 slowest loaders:\n`);
    for (const [i, s] of top5.entries()) {
      process.stderr.write(`  ${i + 1}. ${s.name} ${s.ms}ms\n`);
    }
    process.stderr.write(`[max-site-timing] all (${ranked.length}):\n`);
    for (const s of ranked) {
      process.stderr.write(`  ${s.name} ${s.ms}ms\n`);
    }
    process.stderr.write(
      `[max-site-timing] criticalPathFanOut ${criticalPathMs}ms (Promise.all of locale/plan/pages/design/tenant/identity/demo/tokens/seo/offerings)\n`,
    );

    // Machine-readable line for the PR / Notion stamp.
    process.stderr.write(
      `[max-site-timing] TOP5_JSON=${JSON.stringify(top5)}\n`,
    );
    process.stderr.write(
      `[max-site-timing] CRITICAL_PATH_MS=${criticalPathMs}\n`,
    );

    assert.equal(top5.length, 5);
    assert.ok(top5.every((s) => Number.isFinite(s.ms) && s.ms >= 0));
    assert.ok(Number.isFinite(criticalPathMs) && criticalPathMs >= 0);
    assert.ok(
      ranked.some((s) => s.ms >= 5),
      "expected at least one loader >= 5ms against remote fxlank",
    );
  });
});
