import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { cityWithAccents } from "./talent/agenda/timezone-city-es";
import { formatDualTimezoneWhen } from "./talent/agenda/present";
import { recordWhenLabel } from "@/lib/talent-agenda/record-labels";
import { PAGE_DESIGN_SUMMARIES } from "@/lib/site-admin/builder-node/page-designs/summaries";
import { PAGE_DESIGN_COPY_ES, pageDesignCopy } from "@/lib/site-admin/builder-node/page-designs/summaries-es";

const root = process.cwd();
const read = (rel: string) => readFileSync(join(root, rel), "utf8");

// TUL-702 / TUL-721 residuals from QA Batches 6, 7 and 10.
test("zone labels keep their accent in both languages: Cancún, Mérida; English stays English", () => {
  assert.equal(cityWithAccents("Cancun"), "Cancún");
  assert.equal(cityWithAccents("Merida"), "Mérida");
  assert.equal(cityWithAccents("Mexico City"), "Mexico City");
  assert.equal(cityWithAccents("Madrid"), "Madrid");
  const when = formatDualTimezoneWhen("2026-10-20T15:00:00Z", "2026-10-20T16:00:00Z", "America/Cancun");
  assert.match(when, /Cancún/);
  assert.doesNotMatch(when, /Cancun\b/);
  const rec = recordWhenLabel({ startsAt: "2026-10-20T15:00:00Z", endsAt: "2026-10-20T16:00:00Z", tz: "America/Cancun", locale: "es" });
  assert.match(rec ?? "", /Cancún/);
});

test("no feminine-only 'clienta' in the Spanish admin copy", () => {
  const files = [
    "messages/es.json",
    "src/lib/talent-agenda/agenda-i18n.ts",
    "src/components/admin/shell/internal/dashboard-i18n.ts",
    "src/components/admin/shell/internal/dashboard-i18n-clients.ts",
    "src/components/admin/shell/internal/dashboard-i18n-talent-client-panels.ts",
    "src/components/admin/shell/internal/dashboard-i18n-talent-gaps.ts",
    "src/components/talent/website-settings/policies-copy.ts",
  ];
  for (const f of files) assert.doesNotMatch(read(f), /\bclientas?\b/i, f);
});

test("the plan name follows the dashboard language (Oficina Web) in the profile drawer and calendar upsell", () => {
  assert.match(read("src/components/admin/shell/internal/talent-drawers/profile-extras.tsx"), /translateDashboardText\(label, dashboardLocale\)/);
  assert.doesNotMatch(read("src/components/admin/shell/internal/talent-drawers/profile-extras.tsx"), /\{ tier: TALENT_TIER_META\[\w+\]\.label \}/);
  assert.match(read("src/components/admin/shell/internal/talent/shared/calendar-3.tsx"), /copy\.t\(TALENT_TIER_META\[currentTier\]\.label\)/);
});

test("the Calendario loading fallback never prints the internal page id", () => {
  const src = read("src/components/admin/shell/internal/talent.tsx");
  assert.doesNotMatch(src, /We're loading this view:/);
  assert.doesNotMatch(src, /"\$\{talentPage\}"/);
});

test("every homepage design starter has Spanish copy, with no em dashes", () => {
  for (const d of PAGE_DESIGN_SUMMARIES) {
    const es = PAGE_DESIGN_COPY_ES[d.id];
    assert.ok(es, `missing ES copy for ${d.id}`);
    assert.doesNotMatch(es.label + es.description, /—|–/, d.id);
    assert.equal(pageDesignCopy(d, "es").label, es.label);
    assert.equal(pageDesignCopy(d, "en").label, d.label);
  }
  assert.match(read("src/components/admin/shell/internal/page-modules/HomepageDesignSwap.tsx"), /pageDesignCopy\(design, locale\)/);
});

test("the Pagos header wraps at 390px instead of letting the buttons cover the title", () => {
  const src = read("src/app/(workspace)/[tenantSlug]/admin/payments/page.tsx");
  assert.match(src, /flex flex-wrap items-start justify-between/);
  assert.match(src, /min-w-\[200px\] flex-1/);
  assert.match(src, /shrink-0 flex-wrap items-center/);
});
