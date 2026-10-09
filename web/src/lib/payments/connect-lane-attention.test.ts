/**
 * 'both' owner: a workspace leg whose payee account lives on another Stripe lane
 * than the charge is a CLEAR HOLD, never a transfer, never a redirect into the
 * talent's personal account. The held leg says which lane's payout account to
 * connect, the workspace admin sees it (even though its account is enabled on the
 * other lane), and it releases once the account connects (releaseHeldPayouts).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { CONNECT_LANE_ATTENTION_MARKER, legLastError } from "./transfers";
import { getConnectLaneAttention } from "./connect-lane-attention";

test("a cross-platform hold records the lane the charge ran on", () => {
  const msg = legLastError({ status: "skipped_cross_platform", detail: "charge on mx, recipient account on us", chargePlatform: "mx" }) ?? "";
  assert.match(msg, /^cross-platform hold: /);
  assert.ok(msg.includes(`${CONNECT_LANE_ATTENTION_MARKER}mx`));
  // no lane known: the old text, no marker
  assert.ok(!(legLastError({ status: "skipped_cross_platform", detail: "x" }) ?? "").includes(CONNECT_LANE_ATTENTION_MARKER));
});

function fakeSb(rows: unknown[], error: unknown = null) {
  const q = { select: () => q, eq: () => q, like: () => q, then: (r: (v: unknown) => unknown) => Promise.resolve({ data: rows, error }).then(r) };
  return { from: () => q } as never;
}

test("getConnectLaneAttention groups held workspace legs by lane and currency", async () => {
  const out = await getConnectLaneAttention(
    { tenantId: "t" },
    fakeSb([
      { amount_cents: 97_000, currency: "mxn", last_error: `cross-platform hold: x [${CONNECT_LANE_ATTENTION_MARKER}mx]` },
      { amount_cents: 3_000, currency: "MXN", last_error: `cross-platform hold: y [${CONNECT_LANE_ATTENTION_MARKER}mx]` },
      { amount_cents: 500, currency: "usd", last_error: `cross-platform hold: z [${CONNECT_LANE_ATTENTION_MARKER}us]` },
      { amount_cents: 0, currency: "usd", last_error: `[${CONNECT_LANE_ATTENTION_MARKER}us]` },
    ]),
  );
  assert.deepEqual(out, [
    { lane: "mx", currency: "mxn", amountCents: 100_000, count: 2 },
    { lane: "us", currency: "usd", amountCents: 500, count: 1 },
  ]);
});

test("a failed read shows nothing instead of throwing", async () => {
  assert.deepEqual(await getConnectLaneAttention({ tenantId: "t" }, fakeSb([], { message: "boom" })), []);
});

test("the workspace payouts surface loads and renders the lane attention, with es copy", () => {
  const actions = readFileSync("src/app/(workspace)/[tenantSlug]/admin/payouts/payouts-surface-actions.ts", "utf8");
  assert.match(actions, /getConnectLaneAttention\(\{ tenantId: scope\.tenantId \}\)/);
  const client = readFileSync("src/app/(workspace)/[tenantSlug]/admin/payouts/payouts-section-client.tsx", "utf8");
  assert.match(client, /data-testid="connect-lane-attention"/);
  const i18n = readFileSync("src/components/admin/shell/internal/dashboard-i18n-money.ts", "utf8");
  assert.match(i18n, /"Connect the business's payout account in Mexico to release \{amount\} held":/);
  assert.match(i18n, /en Estados Unidos para liberar \{amount\} retenidos/);
  // plain language, dashboard money formatter, no gold, a tooltip for the long sentence
  assert.doesNotMatch(client, /138,\s*111,\s*26|Intl\.NumberFormat/);
  assert.match(client, /formatDashboardMoney\(row\.amountCents \/ 100/);
  assert.match(client, /<InfoTip/);
  const visible = [...client.matchAll(/copy\.t\(\s*"([^"]+)"/g)].map((m) => m[1]).join(" ") + i18n.slice(i18n.indexOf("Connect the business's payout account in Mexico"));
  assert.doesNotMatch(visible, /carril|\blane\b/i);
});
