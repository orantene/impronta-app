/**
 * Public policy pages (B4): rendering (published, default, ES/EN), the dead
 * /privacy redirect, the footer hrefs, and the snapshot a booking stamps.
 * The sheet-over-booking test lives in policy-sheet.test.ts.
 */
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { TalentPolicyDocument } from "@/components/public-booking/TalentPolicyDocument";
import { isTalentSiteHostPathAllowed } from "@/lib/saas/talent-site-host-routing";
import { RESERVED_PAGE_SLUGS } from "@/lib/talent-site/server/site-page-management-core";

import { DEFAULT_POLICY_ANSWERS } from "./answers";
import type { PolicyFacts } from "./facts";
import {
  asPolicyLocale,
  buildPolicyPage,
  LEGACY_PRIVACY_SLUG,
  loadLatestPolicyVersionId,
  loadPolicyPage,
  parsePublishedClauses,
  POLICY_SLUG,
  policyDocForSlug,
} from "./public";
import { renderPolicyText } from "./render";
import { policyVersionIdForTalents } from "./stamp";
import { policyFakeAdmin } from "./__fixtures__/policy-fake-admin";

const PROFILE = "00000000-0000-4000-8000-0000000000aa";
const OTHER = "00000000-0000-4000-8000-0000000000bb";
const ROOT = join(__dirname, "..", "..", "..");

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

const FACTS: PolicyFacts = {
  displayName: "Jor",
  depositPct: 30,
  inPersonMethods: ["cash"],
  cancelHours: 24,
  where: ["studio"],
  zone: "Roma Norte",
  contact: { chat: true, whatsapp: false, email: false },
};

function publishedFrom(facts: PolicyFacts, version: number) {
  return {
    version,
    contentHash: `hash-${version}-0000000000`,
    answers: DEFAULT_POLICY_ANSWERS,
    facts,
    textEs: renderPolicyText(facts, DEFAULT_POLICY_ANSWERS, "es").text,
    textEn: renderPolicyText(facts, DEFAULT_POLICY_ANSWERS, "en").text,
    publishedAt: "2026-09-30T12:00:00.000Z",
  };
}

// ------------------------------------------------------------------ routes

test("slugs: /politicas is the booking policy, /privacidad the privacy notice", () => {
  assert.equal(policyDocForSlug("politicas"), "booking");
  assert.equal(policyDocForSlug("privacidad"), "privacy");
  assert.equal(policyDocForSlug("privacy"), null);
  assert.equal(policyDocForSlug(null), null);
  assert.equal(POLICY_SLUG.booking, "politicas");
  assert.equal(POLICY_SLUG.privacy, "privacidad");
});

test("talent host: policy slugs and the legacy /privacy all reach the render route", () => {
  for (const path of ["/politicas", "/privacidad", "/privacy"]) {
    assert.deepEqual(isTalentSiteHostPathAllowed(path), { kind: "render", pageSlug: path.slice(1) });
  }
});

test("a talent cannot author a page that would shadow a policy route", () => {
  for (const slug of ["politicas", "privacidad", "privacy"]) assert.ok(RESERVED_PAGE_SLUGS.includes(slug));
});

test("footer socket hrefs resolve to the routes built here", () => {
  const file = "src/lib/talent-site/footer-socket.ts";
  // The socket ships on its own branch; once it is merged its constants must match.
  if (!existsSync(join(ROOT, file))) return;
  const src = read(file);
  assert.match(src, new RegExp(`TALENT_BOOKING_POLICY_PATH = "/${POLICY_SLUG.booking}"`));
  assert.match(src, new RegExp(`TALENT_PRIVACY_PATH = "/${POLICY_SLUG.privacy}"`));
});

test("the renderer swaps only the body: shell, theme and footer still wrap it", () => {
  const src = read("src/lib/talent-site/server/render-max-site.tsx");
  assert.match(src, /policyDocForSlug\(input\.pageSlug\)/);
  assert.match(src, /args\.mainOverride \?\? renderFreeformPageRootTree/);
  // main is painted before the footer, so the socket (rendered with the footer) follows it.
  assert.ok(src.indexOf("args.mainOverride") < src.indexOf("data-talent-max-site-footer"));
});

test("/privacy redirects to /privacidad on the talent host and the platform path", () => {
  const host = read("src/app/%5Ftalent-site/[[...pageSlug]]/page.tsx");
  assert.match(host, /seg === LEGACY_PRIVACY_SLUG\) permanentRedirect\(`\/\$\{POLICY_SLUG\.privacy\}`\)/);
  const site = read("src/app/t/site/[siteSlug]/[pageSlug]/page.tsx");
  assert.match(site, /pageSlug === LEGACY_PRIVACY_SLUG/);
  assert.match(site, /permanentRedirect\(`\/t\/site\/\$\{encodeURIComponent\(siteSlug\)\}\/\$\{POLICY_SLUG\.privacy\}`\)/);
  assert.equal(LEGACY_PRIVACY_SLUG, "privacy");
  for (const slug of ["politicas", "privacidad"]) {
    assert.ok(existsSync(join(ROOT, `src/app/t/[profileCode]/${slug}/page.tsx`)), `/t/[code]/${slug} route exists`);
  }
});

// ------------------------------------------------------------------ content

test("published: the page shows the latest published snapshot in the visitor locale", () => {
  const p = publishedFrom(FACTS, 3);
  const es = buildPolicyPage({ doc: "booking", locale: "es", published: p });
  assert.equal(es.isDefault, false);
  assert.equal(es.version, 3);
  assert.equal(es.title, "Políticas de reserva");
  assert.match(es.clauses.map((c) => c.body).join(" "), /30%/);
  const en = buildPolicyPage({ doc: "booking", locale: "en-US", published: p });
  assert.equal(en.locale, "en");
  assert.equal(en.title, "Booking policies");
  assert.equal(en.clauses.length, es.clauses.length);
  assert.notDeepEqual(en.clauses.map((c) => c.title), es.clauses.map((c) => c.title));
});

test("published text is stored text: live facts changing later never rewrites it", () => {
  const p = publishedFrom(FACTS, 1);
  const again = buildPolicyPage({ doc: "booking", locale: "es", published: { ...p, facts: { ...FACTS, depositPct: 90 } } });
  assert.equal(again.clauses.map((c) => c.body).join(" ").includes("90%"), false);
});

test("privacy page takes the contact and personal-data clauses of the published version", () => {
  const p = publishedFrom(FACTS, 2);
  const m = buildPolicyPage({ doc: "privacy", locale: "es", published: p });
  assert.equal(m.isDefault, false);
  assert.deepEqual(m.clauses.map((c) => c.title), ["Contacto", "Pagos y datos personales"]);
  assert.deepEqual(m.clauses.map((c) => c.n), [1, 2]);
});

test("default: no published version shows neutral platform text, never a 404", () => {
  for (const doc of ["booking", "privacy"] as const) {
    for (const locale of ["es", "en"]) {
      const m = buildPolicyPage({ doc, locale, published: null });
      assert.equal(m.isDefault, true);
      assert.equal(m.version, null);
      assert.ok(m.clauses.length >= 3);
      assert.ok(m.clauses.every((c) => c.body.length > 0));
    }
  }
  // A version that has no matching clauses also falls back rather than rendering empty.
  const empty = buildPolicyPage({ doc: "privacy", locale: "es", published: { ...publishedFrom(FACTS, 1), textEs: "" } });
  assert.equal(empty.isDefault, true);
  assert.equal(asPolicyLocale(undefined), "es");
  assert.equal(asPolicyLocale("EN"), "en");
});

test("parsePublishedClauses round-trips the rendered snapshot", () => {
  const rendered = renderPolicyText(FACTS, DEFAULT_POLICY_ANSWERS, "en");
  const parsed = parsePublishedClauses(rendered.text);
  assert.deepEqual(parsed.map((c) => c.title), rendered.clauses.map((c) => c.title));
  assert.deepEqual(parsed.map((c) => c.body), rendered.clauses.map((c) => c.body));
});

test("loadPolicyPage reads the latest published version for that talent only", async () => {
  const { admin, store } = policyFakeAdmin({});
  assert.equal((await loadPolicyPage(admin, { talentProfileId: PROFILE, doc: "booking", locale: "es" })).isDefault, true);
  const rows = (store.talent_policy_versions ??= []);
  for (const [v, pct] of [[1, 10], [2, 20]] as const) {
    const f = { ...FACTS, depositPct: pct };
    rows.push({
      id: `ver-${v}`,
      talent_profile_id: PROFILE,
      version: v,
      content_hash: `hash-${v}-0000000000`,
      answers: DEFAULT_POLICY_ANSWERS,
      facts: f,
      rendered_text_es: renderPolicyText(f, DEFAULT_POLICY_ANSWERS, "es").text,
      rendered_text_en: renderPolicyText(f, DEFAULT_POLICY_ANSWERS, "en").text,
      published_at: "2026-09-30T12:00:00.000Z",
    });
  }
  const m = await loadPolicyPage(admin, { talentProfileId: PROFILE, doc: "booking", locale: "en" });
  assert.equal(m.version, 2);
  assert.match(m.clauses.map((c) => c.body).join(" "), /20%/);
  assert.equal((await loadPolicyPage(admin, { talentProfileId: OTHER, doc: "booking", locale: "en" })).isDefault, true);
});

test("the document paints from theme tokens only: no hex, no em dash, both locales", () => {
  const p = publishedFrom(FACTS, 4);
  for (const locale of ["es", "en"]) {
    const html = renderToStaticMarkup(createElement(TalentPolicyDocument, { model: buildPolicyPage({ doc: "booking", locale, published: p }) }));
    assert.match(html, /data-talent-policy-doc="booking"/);
    assert.match(html, /data-policy-default="false"/);
    assert.match(html, new RegExp(`lang="${locale}"`));
    assert.match(html, /var\(--token-color-ink/);
    assert.doesNotMatch(html, /#[0-9a-fA-F]{3,8}\b/);
    assert.doesNotMatch(html, /—/);
  }
  const def = renderToStaticMarkup(createElement(TalentPolicyDocument, { model: buildPolicyPage({ doc: "privacy", locale: "en", published: null }) }));
  assert.match(def, /data-policy-default="true"/);
  assert.match(def, /href="https:\/\/tulala\.digital\/legal\/privacy"/);
  assert.doesNotMatch(def, /not published|aún no publicó/i);
});

// ----------------------------------------------------------------- snapshot

test("snapshot: a booking stamps the latest published version id, null when none", async () => {
  const { admin } = policyFakeAdmin({
    talent_policy_versions: [
      { id: "ver-1", talent_profile_id: PROFILE, version: 1 },
      { id: "ver-2", talent_profile_id: PROFILE, version: 2 },
    ],
  });
  assert.equal(await loadLatestPolicyVersionId(admin, PROFILE), "ver-2");
  assert.equal(await loadLatestPolicyVersionId(admin, OTHER), null);
  assert.equal(await loadLatestPolicyVersionId(admin, null), null);
  const broken = { from: () => { throw new Error("db down"); } };
  assert.equal(await loadLatestPolicyVersionId(broken, PROFILE), null, "a failed read never blocks a booking");
});

test("snapshot: a group request carries no single policy", async () => {
  assert.equal(await policyVersionIdForTalents([PROFILE, OTHER]), null);
  assert.equal(await policyVersionIdForTalents([]), null);
  assert.equal(await policyVersionIdForTalents(undefined), null);
});

test("snapshot is wired through the funnel: inquiry, offer, booking and order", () => {
  const submit = read("src/lib/inquiry/inquiry-engine-submit.ts");
  assert.match(submit, /policyVersionIdForTalents\(input\.talent_profile_ids\)/);
  assert.match(submit, /policy_version_id: policyVersionId/);
  const offers = read("src/lib/inquiry/inquiry-engine-offers.ts");
  assert.match(offers, /policy_version_id: inq\.policy_version_id \?\? null/);
  const booking = read("src/lib/inquiry/inquiry-engine-booking.ts");
  assert.match(booking, /stampBookingPolicyVersion\(supabase/);
  const purchase = read("src/lib/orders/purchase.ts");
  assert.match(purchase, /policy_version_id: input\.policyVersionId/);
  assert.match(purchase, /policyVersionId: input\.policyVersionId \?\? null/);
  assert.match(read("src/lib/orders/purchase-booking.ts"), /policy_version_id: input\.policyVersionId/);
  assert.match(read("src/lib/scheduling/instant-purchase.ts"), /policyVersionId: await loadLatestPolicyVersionId\(admin, input\.talentProfileId\)/);
  const migration = read("../supabase/migrations/20261231299610_policy_version_snapshot.sql");
  for (const table of ["inquiries", "inquiry_offers", "agency_bookings", "orders"]) {
    assert.match(migration, new RegExp(`ALTER TABLE public\\.${table}\\s+ADD COLUMN IF NOT EXISTS policy_version_id uuid NULL`));
  }
  assert.doesNotMatch(migration, /NOT NULL/);
});
