import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/**
 * Legal Phase 0: public and admin copy must not claim behaviour the code does
 * not implement. These static checks keep removed claims from coming back.
 */
const read = (p: string) => readFileSync(p, "utf8");

test("payments copy does not call the talent merchant of record", () => {
  assert.doesNotMatch(read("src/lib/marketing/features/feature-payments.ts"), /merchant of record/i);
});

test("privacy page has no unimplemented promises", () => {
  const s = read("src/app/(marketing)/legal/privacy/page.tsx");
  assert.doesNotMatch(s, /consent banner/i);
  assert.doesNotMatch(s, /within 30 days/i);
  // Owner decision 2026-10-01: these periods are stated, from retention-config.ts.
  assert.match(s, /3 years after the last activity/);
  assert.match(read("src/app/(marketing)/legal/privacy/privacy-es.tsx"), /3 años después de la última actividad/);
  assert.match(s, /90 days/);
  assert.match(s, /LEGAL_REVIEW_PENDING/);
  assert.doesNotMatch(s, /CSV \+ JSON/);
  for (const p of ["Vercel", "Supabase", "Stripe", "Resend", "Sentry", "Google Maps", "Anthropic", "OpenAI", "Upstash"]) {
    assert.ok(s.includes(p), `subprocessor ${p} listed`);
  }
});

test("tracking tag copy is not described as consent-gated", () => {
  for (const f of ["messages/en.json", "messages/es.json", "src/lib/integrations/catalog.ts"]) {
    const s = read(f);
    assert.doesNotMatch(s, /consent-gated/i, f);
    assert.doesNotMatch(s, /gated behind visitor consent/i, f);
    assert.doesNotMatch(s, /siempre sujet[oa]s? al consentimiento del visitante/i, f);
  }
});

test("JSON-LD never carries legal first/last name", () => {
  for (const f of [
    "src/lib/seo/talent-json-ld.ts",
    "src/lib/talent-site/server/max-site-seo.server.ts",
    "src/app/t/[profileCode]/profile-view.tsx",
  ]) {
    assert.doesNotMatch(read(f), /givenName|familyName/, f);
  }
});

test("self-cancel copy does not promise a link-based cancel", () => {
  const s = read("src/lib/site-admin/builder-node/visit-sources.ts");
  assert.doesNotMatch(s, /Cambias o cancelas desde tu enlace|Change or cancel from your link/);
  assert.doesNotMatch(
    read("src/components/talent/website-settings/WebsiteSettingsGroups.tsx"),
    /refunded in full before that/,
  );
});

test("terms describe collect-and-pay-out (TUL-43 option A) and 18+ in EN and ES, marked for review", () => {
  const s = read("src/app/(marketing)/legal/terms/page.tsx");
  // Option A (Oran, 2026-10-16): the Terms follow the code. Tulala's platform account takes the card
  // payment and pays the seller out; the talent is not merchant of record through its own Connect account.
  assert.doesNotMatch(s, /merchant of record|own Stripe Connect/);
  assert.match(s, /collects the client\u2019s payment/);
  const es = read("src/app/(marketing)/legal/terms/terms-es.tsx");
  assert.doesNotMatch(es, /comerciante registrado|propia cuenta de Stripe Connect/);
  assert.match(es, /Tulala cobra el pago del cliente/);
  assert.match(es, /LEGAL_REVIEW_PENDING/);
  assert.match(s, /18 or older/);
  assert.match(es, /18 años o más/);
  assert.match(s, /LEGAL_REVIEW_PENDING/);
  const panel = read("src/components/talent/money/MoneyPayoutsPanel.tsx");
  assert.doesNotMatch(panel, /merchant of record/);
  assert.match(panel, /Tulala collects your clients/);
  assert.match(panel, /LEGAL_REVIEW_PENDING/);
});

test("no legal page claims Tulala covers chargebacks; lost disputes are recovered from the seller", () => {
  const pages = [
    "src/app/(marketing)/legal/terms/page.tsx",
    "src/app/(marketing)/legal/terms/terms-es.tsx",
    "src/app/(marketing)/legal/privacy/page.tsx",
    "src/app/(marketing)/legal/privacy/privacy-es.tsx",
    "src/app/(marketing)/legal/refunds/page.tsx",
    "src/app/(marketing)/legal/refunds/refunds-es.tsx",
  ];
  for (const p of pages) {
    const s = read(p).replace(/\s+/g, " ");
    assert.doesNotMatch(s, /\{PLATFORM_BRAND\.name\} (covers it|lo cubre)/, p);
    assert.doesNotMatch(s, /Tulala covers|Tulala cubre/i, p);
  }
  // TUL-43 option A: disputes land on Tulala's payment account; Tulala handles them and can reverse the payout.
  assert.match(read(pages[0]).replace(/\s+/g, " "), /raised against \{PLATFORM_BRAND\.name\}&rsquo;s payment account/);
  assert.match(read(pages[1]).replace(/\s+/g, " "), /se presenta contra la cuenta de pagos de/);
  assert.match(read(pages[4]).replace(/\s+/g, " "), /raised against \{PLATFORM_BRAND\.name\}&rsquo;s payment account/);
  assert.match(read(pages[5]).replace(/\s+/g, " "), /se presenta contra la cuenta de pagos de/);
});
