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
  assert.doesNotMatch(s, /90 days/i);
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
