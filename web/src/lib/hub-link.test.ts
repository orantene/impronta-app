import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { withHubLocale } from "@/lib/hub-link";
import { resolveTalentPublicPreviewDestinations } from "@/lib/talent/public-profile-href";

test("withHubLocale marks Spanish and French hub links, leaves English alone", () => {
  assert.equal(withHubLocale("https://tulala.digital/t/abc", "es"), "https://tulala.digital/t/abc?lang=es");
  assert.equal(withHubLocale("https://tulala.digital/t/abc", "es-MX"), "https://tulala.digital/t/abc?lang=es");
  assert.equal(withHubLocale("https://tulala.digital/t/abc", "fr"), "https://tulala.digital/t/abc?lang=fr");
  assert.equal(withHubLocale("https://tulala.digital/t/abc", "en"), "https://tulala.digital/t/abc");
  assert.equal(withHubLocale("https://tulala.digital/t/abc", null), "https://tulala.digital/t/abc");
});

test("withHubLocale keeps existing query and fragment, and is idempotent", () => {
  assert.equal(withHubLocale("https://h.test/t/a?x=1#top", "es"), "https://h.test/t/a?x=1&lang=es#top");
  const once = withHubLocale("https://h.test/t/a", "es");
  assert.equal(withHubLocale(once, "es"), once);
  assert.equal(withHubLocale("https://h.test/t/a?lang=en", "es"), "https://h.test/t/a?lang=en");
});

test("preview destinations carry the locale on the hub link only", () => {
  const es = resolveTalentPublicPreviewDestinations({
    profileCode: "TAL-1",
    publicSiteUrl: "https://marta.tulala.digital",
    locale: "es",
  });
  assert.equal(es.destinations.find((d) => d.kind === "hub")?.href, "https://tulala.digital/t/TAL-1?lang=es");
  assert.equal(es.destinations.find((d) => d.kind === "website")?.href, "https://marta.tulala.digital");
  const none = resolveTalentPublicPreviewDestinations({ profileCode: "TAL-1", publicSiteUrl: null });
  assert.equal(none.defaultHref, "https://tulala.digital/t/TAL-1");
});

test("app-host components that open the hub pass the dashboard locale", () => {
  for (const f of [
    "src/components/admin/shell/internal/page-modules/TalentPreviewEyeControl.tsx",
    "src/components/admin/shell/internal/talent.tsx",
  ]) {
    const src = readFileSync(f, "utf8");
    assert.match(src, /resolveTalentPublicPreviewDestinations\(\{[\s\S]*?locale: dashboardLocale/, f);
  }
});
