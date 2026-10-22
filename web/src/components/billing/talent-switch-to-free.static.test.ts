/**
 * TUL-831 · the downgrade is reachable from the Plan card and the compare drawer, the sheet says it plainly in en and
 * es, and the new actions are guarded.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { interpolate } from "@/i18n/interpolate";

const web = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const messages = (l: "en" | "es") => JSON.parse(web(`messages/${l}.json`)) as { dashboard: { adminShared: { planChange: Record<string, string> } } };

test("the sheet copy exists in en and es, names the date and the current plan, and has no em dash", () => {
  const vars = { plan: "Gratis", current: "Oficina Web", date: "5 de noviembre de 2026" };
  const es = messages("es").dashboard.adminShared.planChange;
  assert.equal(interpolate(es.downgradeAt, vars), "Tu plan cambia a Gratis el 5 de noviembre de 2026. Hasta entonces sigues con Oficina Web. Hoy no se cobra nada.");
  const en = messages("en").dashboard.adminShared.planChange;
  assert.equal(
    interpolate(en.downgradeAt, { plan: "Free", current: "Web Office", date: "November 5, 2026" }),
    "Your plan changes to Free on November 5, 2026. Until then you stay on Web Office. Nothing is charged today.",
  );
  assert.equal(interpolate(es.switchTo, { plan: "Gratis" }), "Cambiar a Gratis");
  assert.equal(interpolate(en.switchTo, { plan: "Free" }), "Switch to Free");
  assert.equal(es.cancelChange, "Cancelar cambio");
  assert.equal(en.cancelChange, "Cancel change");
  for (const s of [en.downgradeAt, en.switchTo, en.cancelChange, es.downgradeAt, es.switchTo, es.cancelChange]) assert.doesNotMatch(s, /—/);
});

test("the Plan card and the compare drawer both offer the switch", () => {
  assert.match(web("src/app/(workspace)/[tenantSlug]/talent/settings/TalentPlanCard.tsx"), /<TalentSwitchToFree/);
  assert.match(web("src/components/admin/shell/internal/talent-drawers/premium-pages.tsx"), /<TalentSwitchToFree/);
});

test("the switch opens the shared confirm sheet for the Free plan", () => {
  const src = web("src/components/billing/talent-switch-to-free.tsx");
  assert.match(src, /FREE_TALENT_PLAN_KEY/);
  assert.match(src, /planChange\.modal/);
});

test("confirm and cancel are guarded against read-only impersonation; only the pending read is allow-listed", () => {
  const actions = web("src/app/(workspace)/[tenantSlug]/talent/settings/plan-change-actions.ts");
  const cancel = actions.slice(actions.indexOf("export async function cancelTalentPlanChange"));
  assert.match(cancel, /assertNotImpersonating\(\)/);
  const allow = web("src/lib/impersonation/readonly-actions.allow.ts");
  assert.match(allow, /"loadTalentPendingPlanChange"/);
  assert.doesNotMatch(allow, /"cancelTalentPlanChange"/);
});

test("the webhook mirror is not touched by the downgrade actions: they never write plan rows", () => {
  for (const f of ["src/lib/billing/plan-change.ts", "src/lib/billing/plan-change-pending.ts"]) {
    assert.doesNotMatch(web(f), /\.from\(["'](talent_subscriptions|talent_profiles)["']\)/, f);
  }
});
