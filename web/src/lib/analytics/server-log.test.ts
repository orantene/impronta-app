import test from "node:test";
import assert from "node:assert/strict";

import { logAnalyticsEventServer } from "@/lib/analytics/server-log";

const IMPRONTA_ID = "00000000-0000-0000-0000-000000000001";

function fakeClient() {
  const rows: Array<Record<string, unknown>> = [];
  const client = {
    from: (table: string) => {
      assert.equal(table, "analytics_events");
      return {
        insert: async (row: Record<string, unknown>) => {
          rows.push(row);
          return { error: null };
        },
      };
    },
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { client: client as any, rows };
}

test("tenant-less guest event is not inserted and does not throw", async () => {
  const { client, rows } = fakeClient();
  await logAnalyticsEventServer({ name: "onboarding_opened", tenantId: null }, client);
  await logAnalyticsEventServer({ name: "onboarding_opened" }, client);
  assert.equal(rows.length, 0);
});

test("an event with a provable tenant is inserted as before", async () => {
  const { client, rows } = fakeClient();
  const t = "11111111-1111-1111-1111-111111111111";
  await logAnalyticsEventServer({ name: "onboarding_opened", tenantId: t }, client);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.tenant_id, t);
});

test("the Impronta agency id never appears in an insert payload for a tenant-less event", async () => {
  const { client, rows } = fakeClient();
  await logAnalyticsEventServer({ name: "x", tenantId: null }, client);
  assert.ok(!JSON.stringify(rows).includes(IMPRONTA_ID));
});
