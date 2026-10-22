import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { JS_ERRORS } from "../../components/settings/join-studio-copy";
import { parseStudioReference } from "./join-studio";

const root = join(__dirname, "..", "..", "..");
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

test("TUL-75 join studio: a bare address and Tulala /w links resolve to the slug", () => {
  assert.deepEqual(parseStudioReference("bella-studio"), { kind: "slug", slug: "bella-studio" });
  assert.deepEqual(parseStudioReference("  Bella-Studio "), { kind: "slug", slug: "bella-studio" });
  assert.deepEqual(parseStudioReference("tulala.digital/w/bella-studio"), { kind: "slug", slug: "bella-studio" });
  assert.deepEqual(parseStudioReference("https://www.tulala.digital/es/w/bella-studio/servicios?x=1"), {
    kind: "slug",
    slug: "bella-studio",
  });
  assert.deepEqual(parseStudioReference("https://app.tulala.digital/w/bella-studio"), { kind: "slug", slug: "bella-studio" });
});

test("TUL-75 join studio: subdomains and own domains are looked up by host, www dropped", () => {
  assert.deepEqual(parseStudioReference("https://bella-studio.tulala.digital/"), { kind: "host", host: "bella-studio.tulala.digital" });
  assert.deepEqual(parseStudioReference("www.bellastudio.mx/reservar"), { kind: "host", host: "bellastudio.mx" });
});

test("TUL-75 join studio: junk, Tulala pages that are not a studio, and odd schemes are refused", () => {
  for (const raw of ["", "   ", "Bella Studio", "tulala.digital", "tulala.digital/pricing", "app.tulala.digital/bella/admin", "javascript:alert(1)", "ftp://bella.mx", "-bad-", "a".repeat(301)]) {
    assert.equal(parseStudioReference(raw), null, raw);
  }
});

test("TUL-75 join studio: closed studios answer like unknown ones, and the action is guarded", () => {
  const src = read("src/lib/server-actions/join-studio.ts");
  assert.match(src, /assertNotImpersonating\(\)/);
  assert.match(src, /tryConsumeRateLimit\(`join-studio:\$\{userId\}`/);
  assert.match(src, /if \(!registrationIsLive\(settings\)\) \{/);
  assert.match(src, /if \(!studio\.acceptsOpenApplications\) return \{ ok: false, code: "not_found" \};/);
  assert.match(src, /if \(!studio\) return \{ ok: false, code: "not_found" \};/);
  assert.match(src, /applyRegistrationPolicy\(admin,/);
  assert.doesNotMatch(src, /getTenantPortalScopeBySlug/);
  const server = read("src/lib/onboarding/join-studio.server.ts");
  assert.match(server, /agency\.kind !== "agency"/);
  assert.match(server, /isLiveDomainStatus/);
});

test("TUL-75 join studio: the card is in talent Settings and every error has EN + ES copy", () => {
  const page = read("src/components/admin/shell/internal/talent/pages/SettingsPage.tsx");
  assert.match(page, /key: "join-studio"[^\n]*<JoinStudioCard \/>/);
  for (const [code, pair] of Object.entries(JS_ERRORS)) {
    assert.ok(pair.en.trim() && pair.es.trim(), code);
    assert.notEqual(pair.en, pair.es, code);
  }
});

test("TUL-1862 join studio: a studio with open applications ON files an application, and the card links to Discover", () => {
  const src = read("src/lib/server-actions/join-studio.ts");
  assert.match(src, /submitAgencyApplication\(studio\.tenantId\)/);
  assert.match(src, /duplicate_pending[^\n]*already_pending/);
  assert.match(read("src/lib/onboarding/join-studio.server.ts"), /accepts_open_applications/);
  const card = read("src/components/settings/join-studio-card.tsx");
  assert.match(card, /href="\/talent\/discover-agencies"/);
});

test("TUL-1862 / TUL-1690: a staging /w link resolves through the env-derived hosts, and Discover has no production host literal", () => {
  assert.deepEqual(parseStudioReference("https://app.staging.tulala.digital/w/bella-studio", ["app.staging.tulala.digital"]), { kind: "slug", slug: "bella-studio" });
  assert.deepEqual(parseStudioReference("https://app.staging.tulala.digital/w/bella-studio"), { kind: "host", host: "app.staging.tulala.digital" });
  const client = read("src/components/talent/apply/TalentApplyDiscoveryClient.tsx");
  assert.doesNotMatch(client, /tulala\.(app|digital)/);
  assert.match(client, /href=\{`\/w\/\$\{row\.slug\}`\}/);
  assert.match(client, /applicationNote\(terms, message, lang\)/);
  assert.doesNotMatch(read("src/components/settings/join-studio-copy.ts"), /tulala\.digital/);
  assert.match(read("src/lib/server-actions/join-studio.ts"), /resolveMarketingOrigin\(\)/);
});
