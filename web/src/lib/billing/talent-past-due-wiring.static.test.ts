import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

/**
 * TUL-835: talents never saw a past-due warning because the only talent render
 * of PastDueBanner lived in TalentSubscriptionShell, which nothing mounts. The
 * banner now renders in the live Billing panel (Talent > Settings) and on the
 * talent dashboard, reusing the shared component.
 */
const read = (p: string) => readFileSync(join(process.cwd(), "src", p), "utf8");

const card = read("app/(workspace)/[tenantSlug]/talent/settings/TalentBillingCard.tsx");
const notice = read("components/billing/TalentPastDueNotice.tsx");
const today = read("components/admin/shell/internal/talent/pages/TodayPage.tsx");
const summary = read("lib/server-actions/talent-billing-summary.ts");

test("the Billing panel renders the shared PastDueBanner for a past_due talent subscription", () => {
  assert.match(card, /import \{ PastDueBanner \} from "@\/components\/billing\/PastDueBanner"/);
  assert.match(card, /talentPastDueView\(/);
  assert.match(card, /<PastDueBanner\s+scope="talent"/);
});

test("the talent dashboard renders the past-due notice on both Today layouts", () => {
  assert.match(notice, /import \{ PastDueBanner \} from "\.\/PastDueBanner"/);
  assert.match(notice, /loadTalentPastDueState/);
  assert.match(today, /<TalentPastDueNotice tenantSlug=\{tenantSlug\} \/>/);
  const mounts = today.match(/\{pastDueNotice\}/g) ?? [];
  assert.equal(mounts.length, 2, "agenda Today and legacy Today both mount the notice");
});

test("the past-due loader is a self-scoped read listed for read-only impersonation", () => {
  assert.match(summary, /export async function loadTalentPastDueState\(/);
  assert.match(
    read("lib/impersonation/readonly-actions.allow.ts"),
    /"lib\/server-actions\/talent-billing-summary\.ts", \["loadTalentBillingSummary", "loadTalentPastDueState"\]/,
  );
});

test("card on file checks the subscription default before the customer defaults", () => {
  assert.match(summary, /pickDefaultCard\(/);
  assert.match(summary, /subscriptions\s*\.retrieve\([^)]*expand: \["default_payment_method"\]/s);
  assert.match(summary, /"invoice_settings\.default_payment_method", "default_source"/);
});

test("invariance: the billing summary only reads Stripe (no charge, update or cancel call)", () => {
  for (const src of [summary, card, notice]) {
    assert.doesNotMatch(src, /\.(create|update|del|cancel|pay|finalizeInvoice|resume)\(/);
  }
});
