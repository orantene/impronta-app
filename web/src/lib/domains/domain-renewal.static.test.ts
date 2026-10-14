import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const read = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const MIGRATION = "20261231359100_talent_domain_renewal.sql";

test("the renewal migration is additive and gives D4 and D5 ONE shared expiry column", () => {
  const sql = read(`../supabase/migrations/${MIGRATION}`);
  assert.match(sql, /add column if not exists registrar_expires_at timestamptz/);
  for (const col of ["registrar_auto_renew", "renewal_price_cents", "renewal_state", "renewal_cycle_expires_at", "renewal_payment_intent_id", "renewal_paid_at"]) {
    assert.match(sql, new RegExp(`add column if not exists ${col}\\b`), col);
  }
  assert.doesNotMatch(sql, /\b(drop|truncate|delete from)\b/i, "additive only");
  const all = readdirSync(join(process.cwd(), "../supabase/migrations")).filter((f) => /^\d{14}_.*\.sql$/.test(f));
  assert.ok(all.includes(MIGRATION));
  assert.equal(all.filter((f) => f.startsWith(MIGRATION.slice(0, 14))).length, 1, "no other migration shares this timestamp");
});

test("the sweep is a bearer-authenticated daily cron, wired in vercel.json, dark without the registrar token", () => {
  const route = read("src/app/api/cron/domain-renewal/route.ts");
  assert.match(route, /CRON_SECRET/);
  assert.match(route, /status: 401/);
  assert.doesNotMatch(route, /searchParams|\?token=/);
  const crons = (JSON.parse(read("vercel.json")) as { crons: Array<{ path: string; schedule: string }> }).crons;
  assert.ok(crons.some((c) => c.path === "/api/cron/domain-renewal"));
  assert.match(read("src/lib/stripe/talent-domain-renewal.ts"), /registrar_not_configured/);
});

test("renewal notices open a real page target, not the 'Coming up next' stub", () => {
  assert.match(read("src/lib/stripe/talent-domain-renewal.ts"), /targetDrawer: "talent-site"/);
  assert.match(read("src/components/admin/shell/internal/notification-drawer-targets.ts"), /"talent-site": \{ kind: "page", surface: "talent", path: "\/talent\/site" \}/);
});

test("the paid-renewal webhook is routed and handled, and a purchase starts the renewal clock", () => {
  assert.match(read("src/lib/stripe/webhook-handler.ts"), /case "talent_domain_renewal"[\s\S]{0,400}fulfillTalentDomainRenewal/);
  assert.match(read("src/lib/stripe/talent-domain-billing.ts"), /recordRegistrarSnapshot\(sb,/);
});

test("the purchase checkout discloses the renewal and saves THAT card for off-session use; the sweep never picks a card itself", () => {
  const billing = read("src/lib/stripe/talent-domain-billing.ts");
  assert.match(billing, /setup_future_usage: "off_session"/);
  assert.match(billing, /dashboard\.domainRenewal\.consentDisclosure/);
  assert.match(billing, /renewal_consent: "1"/);
  const renewal = read("src/lib/stripe/talent-domain-renewal.ts");
  assert.doesNotMatch(renewal, /paymentMethods\.list|invoice_settings/, "no 'first saved card' lookup");
  assert.match(renewal, /renewal_consent_at && row\.renewal_payment_method_id/);
});

test("renewal copy exists in en, es and fr with no em dash", () => {
  for (const loc of ["en", "es", "fr"]) {
    const c = (JSON.parse(read(`messages/${loc}.json`)) as { dashboard: { domainRenewal: Record<string, string> } }).dashboard.domainRenewal;
    for (const k of ["chargedTitle", "chargedBody", "payTitle", "payBody", "autorenewOffTitle", "autorenewOffBody", "consentDisclosure"]) {
      assert.ok(c[k], `${loc}.${k}`);
      assert.doesNotMatch(c[k], /—/, `${loc}.${k}`);
    }
  }
});
